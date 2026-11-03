#!/usr/bin/env python3
"""Rebuild src/pages/listening/sentence-timings.json via Whisper word timestamps.

Workflow:
  1. Load /tmp/align/inventory.json (from scripts/export-sentence-inventory.mts)
  2. For each part, run faster-whisper with word_timestamps (cached under /tmp/align/words/)
  3. Force-align each reference sentence onto the word timeline
  4. Write sentence-timings.json + a JSON report

Usage:
  pnpm exec vite-node scripts/export-sentence-inventory.mts
  python3 scripts/rebuild-sentence-timings.py [--model base.en] [--limit N]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "src/pages/listening/sentence-timings.json"
ALIGN_DIR = Path("/tmp/align")
AUDIO_DIR = ALIGN_DIR / "audio"
WORDS_DIR = ALIGN_DIR / "words"
INVENTORY = ALIGN_DIR / "inventory.json"
REPORT = ALIGN_DIR / "rebuild-report.json"

META_TEXT = (
  "Here is the transcript of the conversation between two education students, "
  "presented in a conversation format, based on the provided sources:"
)

# Small pads so click-to-play does not clip onsets/offsets.
PAD_START = 0.08
PAD_END = 0.12
MIN_DUR = 0.18

WORD_RE = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)?", re.I)


def normalize_words(text: str) -> list[str]:
  # Keep hyphenated spellings as individual letters (C-H-A-S-T-O-N-S → c h …)
  # so they align to letter-by-letter ASR; token_sim blocks letter↔word matches.
  return [w.lower() for w in WORD_RE.findall(text)]


def is_skip(text: str) -> bool:
  t = text.strip()
  if not t:
    return True
  if t == META_TEXT:
    return True
  if re.fullmatch(r"[.…]+", t):
    return True
  if not normalize_words(t):
    return True
  return False


def audio_path(rel: str) -> Path:
  return AUDIO_DIR / rel.replace("/", "_")


def wav_path(rel: str) -> Path:
  """faster-whisper/PyAV can be picky with some mp3 builds; use 16k mono wav."""
  src = audio_path(rel)
  dst = AUDIO_DIR / (src.stem + ".wav")
  if dst.exists() and dst.stat().st_size > 1000:
    return dst
  import subprocess
  subprocess.run(
    [
      "ffmpeg", "-y", "-i", str(src),
      "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst),
    ],
    check=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
  )
  return dst


def _lev_ratio(a: str, b: str) -> float:
  if a == b:
    return 1.0
  la, lb = len(a), len(b)
  if la == 0 or lb == 0:
    return 0.0
  prev = list(range(lb + 1))
  for i, ca in enumerate(a, 1):
    cur = [i]
    for j, cb in enumerate(b, 1):
      cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
    prev = cur
  return 1.0 - prev[-1] / max(la, lb)


def token_sim(a: str, b: str) -> float:
  if a == b:
    return 1.0
  # Single letters (spelled names) must only match single-letter ASR tokens.
  if len(a) == 1 or len(b) == 1:
    return 1.0 if a == b else 0.0
  a2, b2 = a.replace("'", ""), b.replace("'", "")
  if a2 == b2:
    return 0.98
  # light stemming / UK-US
  pairs = {
    ("colour", "color"), ("favourite", "favorite"), ("centre", "center"),
    ("metre", "meter"), ("organise", "organize"), ("recognised", "recognized"),
    ("travelling", "traveling"), ("cancelled", "canceled"),
    ("inquiries", "enquiries"), ("enquiry", "inquiry"),
    ("ok", "okay"), ("okay", "ok"),
  }
  if (a2, b2) in pairs or (b2, a2) in pairs:
    return 0.95
  if a2.rstrip("s") == b2.rstrip("s") and min(len(a2), len(b2)) >= 3:
    return 0.9
  if a2[:4] == b2[:4] and min(len(a2), len(b2)) >= 4:
    return 0.7
  if min(len(a2), len(b2)) >= 5 and _lev_ratio(a2, b2) >= 0.72:
    return 0.75
  return 0.0


def max_spoken_duration(n_tokens: int) -> float:
  # Generous upper bound on how long a spoken sentence should last.
  return max(2.2, n_tokens * 0.85 + 1.4)


def align_sentence(
  tokens: list[str],
  words: list[dict],
  cursor: int,
  hint_time: float | None = None,
) -> tuple[int, int, float] | None:
  """Return (start_idx, end_idx_exclusive, score) in words, or None.

  Prefers matches near ``cursor`` / ``hint_time``. Short backchannels are
  searched only locally so common words like "yes"/"ok" do not latch onto
  later repetitions.
  """
  if not tokens or cursor >= len(words):
    return None
  n = len(tokens)
  short = n <= 2
  max_span = max(n + (2 if short else 8), int(n * (1.6 if short else 2.4)) + 4)
  if short:
    search_limit = min(len(words), cursor + max(18, n * 10))
  else:
    search_limit = min(len(words), cursor + max(80, n * 12, 220 if cursor == 0 else 100))

  # If we have a prior timestamp, also allow a window around that time even
  # when the cursor has drifted slightly backwards.
  hint_idx = None
  if hint_time is not None and words:
    hint_idx = min(
      range(len(words)),
      key=lambda i: abs(words[i]["start"] - hint_time),
    )
    if abs(words[hint_idx]["start"] - hint_time) <= 2.5:
      search_limit = max(search_limit, min(len(words), hint_idx + max_span + 4))
      cursor = min(cursor, max(0, hint_idx - (2 if short else 6)))

  best = None  # (score, start, end)
  max_dur = max_spoken_duration(n)
  for start in range(cursor, search_limit):
    wi = start
    matched = 0
    last_match = start
    gap_broke = False
    skips = 0
    for tok in tokens:
      found = False
      limit = min(len(words), wi + (3 if short else 5))
      for j in range(wi, limit):
        if token_sim(tok, words[j]["word"]) >= 0.7:
          # Reject large silent gaps inside a match.
          if matched and words[j]["start"] - words[last_match]["end"] > 1.6:
            gap_broke = True
            break
          matched += 1
          last_match = j
          wi = j + 1
          found = True
          break
      if gap_broke:
        break
      if not found:
        # Allow a couple of ASR mishears (e.g. Chastons→Justin's).
        skips += 1
        if short or skips > max(1, n // 6):
          break
        continue
      if wi - start > max_span:
        break
    if gap_broke or matched == 0:
      continue
    end = last_match + 1
    if end <= start:
      continue
    coverage = matched / n
    density = matched / max(1, end - start)
    if short and coverage < 1.0:
      continue
    if coverage < (0.75 if n <= 4 else 0.55):
      continue
    if density < (0.7 if short else 0.35):
      continue
    start_t = words[start]["start"]
    end_t = words[end - 1]["end"]
    dur = end_t - start_t
    if dur > max_dur and density < 0.85:
      continue
    if dur > max_dur * 1.8:
      continue
    score = coverage * 0.7 + density * 0.3
    # Prefer staying near the cursor / prior timing.
    score -= (start - cursor) * (0.004 if short else 0.0004)
    if hint_time is not None:
      score -= min(3.0, abs(start_t - hint_time)) * (0.12 if short else 0.03)
    if best is None or score > best[0]:
      best = (score, start, end)
  if best is None:
    return None
  return best[1], best[2], best[0]


def old_native(old) -> tuple[float, float, str] | None:
  if (
    old
    and old[2] in ("ok", "weak")
    and isinstance(old[0], (int, float))
    and isinstance(old[1], (int, float))
    and old[1] > old[0]
  ):
    return float(old[0]), float(old[1]), old[2]
  return None


def span_has_long_silence(words: list[dict], start: float, end: float) -> bool:
  """True when [start,end] contains a long hole with little ASR coverage."""
  if end - start < 2.5:
    return False
  inside = [w for w in words if w["end"] >= start and w["start"] <= end]
  if not inside:
    return end - start >= 2.5
  covered = 0.0
  prev = start
  longest_gap = 0.0
  for w in inside:
    s = max(start, w["start"])
    e = min(end, w["end"])
    if e > s:
      longest_gap = max(longest_gap, s - prev)
      covered += e - s
      prev = max(prev, e)
  longest_gap = max(longest_gap, end - prev)
  # A multi-second hole means this span covers missing audio even if a few
  # instruction words sit at the edges.
  if longest_gap >= 8.0:
    return True
  if longest_gap < 3.5:
    return False
  return covered / max(0.01, end - start) < 0.2


def dialogue_floor(words: list[dict]) -> float:
  """Heuristic start of real dialogue: after the largest early silence gap."""
  if len(words) < 8:
    return 0.0
  best_gap = 0.0
  best_after = 0.0
  for i in range(1, len(words)):
    if words[i]["start"] > 150:
      break
    gap = words[i]["start"] - words[i - 1]["end"]
    if gap > best_gap and gap >= 8.0:
      best_gap = gap
      best_after = words[i]["start"]
  return best_after


def pad_range(
  start: float,
  end: float,
  prev_end: float,
  next_start: float | None,
  duration: float,
) -> tuple[float, float]:
  s = max(0.0, start - PAD_START)
  e = min(duration, end + PAD_END)
  # Do not invade the previous sentence beyond the midpoint.
  if prev_end > 0:
    mid = (prev_end + start) / 2
    s = max(s, min(start, mid))
  if next_start is not None:
    mid = (end + next_start) / 2
    e = min(e, max(end, mid))
  if e - s < MIN_DUR:
    e = min(duration, s + MIN_DUR)
  return round(s, 2), round(e, 2)


def transcribe_words(model, path: Path) -> tuple[list[dict], float]:
  # Bypass PyAV decode path (av.open metadata_errors incompatibility) by
  # feeding a 16 kHz float32 mono array from soundfile.
  import soundfile as sf
  audio, sr = sf.read(str(path), dtype="float32")
  if sr != 16000:
    raise RuntimeError(f"expected 16k wav, got {sr}: {path}")
  segments, info = model.transcribe(
    audio,
    language="en",
    beam_size=1,
    best_of=1,
    word_timestamps=True,
    # Keep VAD off: IELTS files often have long instruction pauses; VAD can
    # drop soft backchannels and clip dialogue edges.
    vad_filter=False,
    condition_on_previous_text=False,
  )
  words: list[dict] = []
  for seg in segments:
    if not seg.words:
      continue
    for w in seg.words:
      token = normalize_words(w.word)
      if not token:
        continue
      words.append({
        "word": token[0],
        "start": float(w.start),
        "end": float(w.end),
        "prob": float(getattr(w, "probability", 0.0) or 0.0),
      })
  return words, float(info.duration or 0.0)


def rebuild_part(model, key: str, part: dict, force: bool = False) -> dict:
  rel = part["audio"]
  ap = audio_path(rel)
  cache = WORDS_DIR / f"{key}.json"
  if cache.exists() and not force:
    cached = json.loads(cache.read_text())
    words, duration = cached["words"], cached["duration"]
  else:
    if not ap.exists():
      raise FileNotFoundError(ap)
    wp = wav_path(rel)
    t0 = time.time()
    words, duration = transcribe_words(model, wp)
    cache.write_text(json.dumps({"words": words, "duration": duration}))
    print(f"  transcribed {key}: {len(words)} words, {duration:.1f}s in {time.time()-t0:.1f}s", flush=True)

  sentences = part["sentences"]
  # Only treat very long early holes (typical IELTS instruction pause) as a
  # dialogue floor; short gaps are common and must not demote real speech.
  floor = dialogue_floor(words)
  if floor < 90:
    floor = 0.0
  raw: list[dict] = []
  cursor = 0
  for i, sent in enumerate(sentences):
    text = sent["text"]
    old = sent.get("old")
    prior = old_native(old)
    if is_skip(text):
      raw.append({"status": "skip", "start": None, "end": None, "score": 1.0, "reason": "non-speech"})
      continue
    tokens = normalize_words(text)
    # Only discard weak/oversized priors. Keep status=ok even when ASR missed
    # the region — those spans were previously playable native audio.
    if prior and prior[2] == "weak":
      if (prior[1] - prior[0]) >= 8.0 and span_has_long_silence(words, prior[0], prior[1]):
        prior = None
      elif (prior[1] - prior[0]) > max_spoken_duration(len(tokens)) * 1.45:
        prior = None
    if (
      prior
      and prior[2] == "weak"
      and floor >= 90
      and prior[1] < floor - 1.0
    ):
      # Weak bumper timings before a long instruction pause are not dialogue.
      prior = None
    hint = prior[0] if prior else None
    hit = align_sentence(tokens, words, cursor, hint_time=hint)
    if hit is None and cursor > 0:
      hit = align_sentence(tokens, words, max(0, cursor - 4), hint_time=hint)

    chosen = None
    reason = "aligned"
    if hit is not None:
      start_i, end_i, score = hit
      start = words[start_i]["start"]
      end = words[end_i - 1]["end"]
      dur = end - start
      suspicious = (
        span_has_long_silence(words, start, end)
        or dur > max_spoken_duration(len(tokens)) * 1.35
      )
      # Reject bumper matches before a long instruction pause when we have no
      # trustworthy prior (ok priors are kept even if ASR/floor is confused).
      if floor >= 90 and start < floor - 1.0 and prior is None:
        suspicious = True
        reason = "matched-before-dialogue"
      # Short utterances that jump far from the prior/cursor are usually wrong.
      if len(tokens) <= 2 and prior and abs(start - prior[0]) > 2.0:
        suspicious = True
      if len(tokens) <= 2 and prior is None and start_i > cursor + 12:
        suspicious = True

      if not suspicious:
        chosen = (start, end, "ok" if score >= 0.72 else "weak", score, end_i)
      elif prior:
        chosen = (prior[0], prior[1], prior[2], score, None)
        reason = "kept-old-over-suspicious-align"
      else:
        if reason == "aligned":
          reason = "suspicious-align-no-good-prior"
    else:
      reason = "not-found-in-asr"

    # Prefer an existing native span whenever alignment fails.
    if chosen is None and prior:
      chosen = (prior[0], prior[1], prior[2], 0.0, None)
      reason = "kept-old-native-over-failed-align"

    if chosen is None:
      raw.append({
        "status": "tts",
        "start": None,
        "end": None,
        "score": 0.0,
        "reason": reason if reason != "aligned" else "not-in-source-audio",
        "old": old,
      })
      continue

    start, end, status, score, end_i = chosen
    raw.append({
      "status": status,
      "start": start,
      "end": end,
      "score": round(float(score), 3),
      "reason": reason,
      "old": old,
    })
    if end_i is not None:
      cursor = end_i
    else:
      # Advance cursor to the ASR word nearest the kept prior end.
      near = min(range(len(words)), key=lambda j: abs(words[j]["end"] - end))
      cursor = max(cursor, near + 1)

  # Second pass: padding + hard monotonicity.
  timings: list[list] = []
  changed = []
  for i, item in enumerate(raw):
    old = item.get("old")
    if item["status"] in ("tts", "skip"):
      timings.append([None, None, item["status"]])
      if old and old[2] != item["status"]:
        changed.append({
          "i": i,
          "from": old[2],
          "to": item["status"],
          "old": old,
          "text": sentences[i]["text"][:80],
          "reason": item.get("reason"),
        })
      continue

    prev_end = 0.0
    for j in range(len(timings) - 1, -1, -1):
      if timings[j][2] in ("ok", "weak") and timings[j][1] is not None:
        prev_end = float(timings[j][1])
        break
    next_start = None
    for j in range(i + 1, len(raw)):
      if raw[j]["status"] in ("ok", "weak") and raw[j]["start"] is not None:
        next_start = float(raw[j]["start"])
        break

    s, e = pad_range(
      float(item["start"]),
      float(item["end"]),
      prev_end,
      next_start,
      duration or (float(item["end"]) + 1),
    )
    # Hard monotonic clamp: never start before the previous native end.
    if s < prev_end:
      s = round(prev_end, 2)
    if next_start is not None and e > next_start:
      e = round(max(s + MIN_DUR, min(e, next_start)), 2)
    if e <= s:
      e = round(s + MIN_DUR, 2)
      item = {**item, "reason": "clamped-mono"}

    timings.append([s, e, item["status"]])
    if old:
      old_st = old[2]
      if old_st != item["status"] or (
        old_st in ("ok", "weak")
        and old[0] is not None
        and (abs(old[0] - s) > 0.35 or abs(old[1] - e) > 0.45)
      ) or item.get("reason", "").startswith("kept-old"):
        changed.append({
          "i": i,
          "from": old_st,
          "to": item["status"],
          "old": old,
          "new": [s, e, item["status"]],
          "score": item.get("score"),
          "note": item.get("reason"),
          "text": sentences[i]["text"][:100],
        })

  # Final forward pass: guarantee non-overlapping native spans.
  prev_end = 0.0
  for i, t in enumerate(timings):
    if t[2] not in ("ok", "weak") or t[0] is None:
      continue
    s, e = float(t[0]), float(t[1])
    if s < prev_end:
      s = round(prev_end, 2)
    if e <= s:
      e = round(s + MIN_DUR, 2)
    timings[i] = [s, e, t[2]]
    prev_end = e

  return {
    "timings": timings,
    "changed": changed,
    "stats": {
      st: sum(1 for t in timings if t[2] == st)
      for st in ("ok", "weak", "tts", "skip")
    },
    "duration": duration,
    "words": len(words),
  }


def main() -> int:
  ap = argparse.ArgumentParser()
  ap.add_argument("--model", default="base.en")
  ap.add_argument("--limit", type=int, default=0, help="Process only first N parts (debug)")
  ap.add_argument("--force", action="store_true", help="Ignore word-timestamp cache")
  ap.add_argument("--only", default="", help="Comma-separated part keys to process")
  args = ap.parse_args()

  if not INVENTORY.exists():
    print("Missing inventory. Run: pnpm exec vite-node scripts/export-sentence-inventory.mts", file=sys.stderr)
    return 1

  inventory = json.loads(INVENTORY.read_text())
  WORDS_DIR.mkdir(parents=True, exist_ok=True)

  from faster_whisper import WhisperModel
  print(f"Loading Whisper model {args.model} (int8 CPU)...", flush=True)
  model = WhisperModel(args.model, device="cpu", compute_type="int8")

  keys = sorted(inventory)
  if args.only:
    want = {k.strip() for k in args.only.split(",") if k.strip()}
    keys = [k for k in keys if k in want]
  if args.limit:
    keys = keys[: args.limit]

  # Keep previously finished parts when rerunning a subset (--only/--limit).
  if OUT_JSON.exists():
    result = json.loads(OUT_JSON.read_text())
  else:
    result = {}

  report = {"parts": {}, "model": args.model, "pad": [PAD_START, PAD_END]}
  tts_fixed = []
  retimed = []
  demoted = []

  for idx, key in enumerate(keys, 1):
    print(f"[{idx}/{len(keys)}] {key}", flush=True)
    part_result = rebuild_part(model, key, inventory[key], force=args.force)
    result[key] = part_result["timings"]
    report["parts"][key] = {
      "stats": part_result["stats"],
      "changed": part_result["changed"],
      "duration": part_result["duration"],
      "words": part_result["words"],
    }
    for ch in part_result["changed"]:
      note = ch.get("note") or ch.get("reason") or ""
      if ch.get("from") == "tts" and ch.get("to") in ("ok", "weak"):
        tts_fixed.append({"key": key, **ch})
      elif (
        ch.get("from") in ("ok", "weak")
        and ch.get("to") in ("ok", "weak")
        and "new" in ch
        and not str(note).startswith("kept-old")
      ):
        retimed.append({"key": key, **ch})
      elif ch.get("from") in ("ok", "weak") and ch.get("to") == "tts":
        demoted.append({"key": key, **ch})
    # Checkpoint after each part
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))

  # Global stats
  totals = {"ok": 0, "weak": 0, "tts": 0, "skip": 0}
  remaining_tts = []
  for key, arr in result.items():
    sents = inventory.get(key, {}).get("sentences", [])
    reason_by_i = {
      ch["i"]: ch.get("reason") or ch.get("note") or "not-found-in-asr"
      for ch in report.get("parts", {}).get(key, {}).get("changed", [])
      if ch.get("to") == "tts"
    }
    for i, t in enumerate(arr):
      totals[t[2]] = totals.get(t[2], 0) + 1
      if t[2] == "tts":
        old = sents[i].get("old") if i < len(sents) else None
        remaining_tts.append({
          "key": key,
          "i": i,
          "text": sents[i]["text"] if i < len(sents) else "",
          "reason": reason_by_i.get(
            i,
            "still-not-found-in-asr" if old and old[2] == "tts" else "not-in-source-audio",
          ),
          "old": old,
        })

  report["totals"] = totals
  report["tts_fixed_count"] = len(tts_fixed)
  report["tts_fixed"] = tts_fixed
  report["retimed_count"] = len(retimed)
  report["demoted_to_tts_count"] = len(demoted)
  report["demoted_to_tts"] = demoted
  report["remaining_tts"] = remaining_tts
  REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
  OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
  print("Wrote", OUT_JSON)
  print("Totals", totals)
  print(
    "TTS fixed", len(tts_fixed),
    "retimed", len(retimed),
    "demoted", len(demoted),
    "remaining TTS", len(remaining_tts),
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

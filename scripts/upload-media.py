#!/usr/bin/env python3
"""Upload my-ielts media files to the my-ielts-media repo via Git Data API.

Batches (one commit each, resumable):
  batch0: .nojekyll + mock/ + 179_audios/ + writing/ + grammar/
  batch-vocab-<dir>: each public/vocabulary/audio/<dir>/ (incl. top-level mp3s)
State file records completed batches; re-running skips them.
Rate-limit / transient errors: sleep + retry.
Token via authd surrogate; never printed.
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request

REPO = "messy6857-maker/my-ielts-media"
BRANCH = "main"
WORKTREE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(WORKTREE, "public")
STATE_DIR = "/home/hatch/workspace/goals/my-ielts-website-improvement/hidden_files/media-migration"
STATE_FILE = os.path.join(STATE_DIR, "upload-state.json")
LOG_FILE = os.path.join(STATE_DIR, "upload.log")


def log(msg):
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def api(method, path, body=None, retries=5):
    url = f"https://api.github.com/repos/{REPO}{path}"
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json", "Accept": "application/vnd.github+json"},
            method=method.upper(),
        )
        add_surrogate_to_request(req, "custom.github", allowed_hosts=("api.github.com", "github.com"))
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode()) if resp.length not in (0, None) else {}
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()[:300]
            if e.code in (403, 429) and attempt < retries - 1:
                wait = 90
                log(f"RATE LIMIT on {method} {path} ({e.code}), sleeping {wait}s...")
                time.sleep(wait)
                continue
            if e.code in (500, 502, 503) and attempt < retries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise RuntimeError(f"API {method} {path} -> HTTP {e.code}: {body_text}")
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise


def collect(rel_dir):
    """Return [(repo_path, full_path)] for all files under public/<rel_dir>."""
    base = os.path.join(PUBLIC, rel_dir)
    out = []
    for root, _dirs, files in os.walk(base):
        for name in files:
            full = os.path.join(root, name)
            out.append((os.path.relpath(full, PUBLIC), full))
    return sorted(out)


def build_batches():
    batches = []
    batch0 = [(".nojekyll", None)]
    for d in ("mock", "179_audios", "writing", "grammar"):
        batch0 += collect(d)
    batches.append(("batch0", batch0))
    audio_root = os.path.join(PUBLIC, "vocabulary", "audio")
    top_mp3s = [(os.path.relpath(os.path.join(audio_root, f), PUBLIC), os.path.join(audio_root, f))
                for f in sorted(os.listdir(audio_root))
                if os.path.isfile(os.path.join(audio_root, f))]
    for entry in sorted(os.listdir(audio_root)):
        full = os.path.join(audio_root, entry)
        if os.path.isdir(full):
            batches.append((f"vocab-{entry}", collect(os.path.join("vocabulary", "audio", entry))))
    if top_mp3s:
        batches.append(("vocab-top", top_mp3s))
    return batches


def init_empty_repo():
    """空仓库无法用 Git Data API 建 blob，先用文件内容接口建初始提交。"""
    url = f"https://api.github.com/repos/{REPO}/contents/.nojekyll"
    req = urllib.request.Request(
        url, data=json.dumps({"message": "init", "content": ""}).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/vnd.github+json"},
        method="PUT",
    )
    add_surrogate_to_request(req, "custom.github", allowed_hosts=("api.github.com", "github.com"))
    with urllib.request.urlopen(req, timeout=60) as resp:
        json.loads(resp.read().decode())
    log("empty repo initialized via contents API")


def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    state = {"done": [], "head": None}
    if os.path.exists(STATE_FILE):
        state = json.load(open(STATE_FILE, encoding="utf-8"))
    done = set(state.get("done", []))

    try:
        ref = api("GET", f"/git/ref/heads/{BRANCH}")
        head = ref["object"]["sha"]
        base_tree = api("GET", f"/git/commits/{head}")["tree"]["sha"]
    except RuntimeError as e:
        # 空仓库取 ref 会返回 409 Git Repository is empty（不是 404）
        if "404" in str(e) or "empty" in str(e):
            head, base_tree = None, None
        else:
            raise
    if head is None:
        init_empty_repo()
        ref = api("GET", f"/git/ref/heads/{BRANCH}")
        head = ref["object"]["sha"]
        base_tree = api("GET", f"/git/commits/{head}")["tree"]["sha"]
    log(f"starting: head={head} done_batches={len(done)}")

    for name, files in build_batches():
        if name in done:
            continue
        log(f"batch {name}: {len(files)} files")
        entries = []
        for i, (rel, full) in enumerate(files):
            if full is None:
                blob = api("POST", "/git/blobs", {"content": "", "encoding": "utf-8"})
            else:
                with open(full, "rb") as f:
                    data = f.read()
                blob = api("POST", "/git/blobs", {
                    "content": base64.b64encode(data).decode(), "encoding": "base64"})
            entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
            if (i + 1) % 100 == 0:
                log(f"  {name}: {i + 1}/{len(files)} blobs")
        tree_body = {"tree": entries}
        if base_tree:
            tree_body["base_tree"] = base_tree
        tree = api("POST", "/git/trees", tree_body)
        commit_body = {"message": f"Media: {name}", "tree": tree["sha"]}
        if head:
            commit_body["parents"] = [head]
        commit = api("POST", "/git/commits", commit_body)
        if head:
            api("PATCH", f"/git/refs/heads/{BRANCH}", {"sha": commit["sha"]})
        else:
            api("POST", "/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
        head, base_tree = commit["sha"], tree["sha"]
        done.add(name)
        state = {"done": sorted(done), "head": head}
        json.dump(state, open(STATE_FILE, "w", encoding="utf-8"))
        log(f"batch {name} committed: {head}")

    log(f"ALL DONE. head={head} batches={len(done)}")


if __name__ == "__main__":
    main()

import {
  accountKey,
  batchStorage,
  compareStamp,
  envelope,
  readValue,
  saveValue,
  studyBaseOf,
} from './storage'
import type { Envelope } from './storage'

export type ArchiveCutoff = [number, string, string]
const legacyMarker = 'archive_retention_v2'
const writingMarker = 'archive_retention_writing_v3'
const archiveMarkers = [legacyMarker, writingMarker] as const
type ArchiveMarker = typeof archiveMarkers[number]

export function isArchiveWatermark(base: string) {
  return base === legacyMarker || base === writingMarker
}

function markerFor(base: string): ArchiveMarker | null {
  if (/^aigrade_v2_/i.test(base))
    return writingMarker
  return /^aigrade_(?:speaking_)?v1_/i.test(base) ? legacyMarker : null
}

export function pastCutoff(key: string, e: Envelope, cutoff?: ArchiveCutoff) {
  return (
    !!cutoff
    && (e.stamp[0] - cutoff[0]
      || e.stamp[1].localeCompare(cutoff[1])
      || key.localeCompare(cutoff[2])) <= 0
  )
}
export function pruneArchives(
  user: string | null,
  maxEntries = 30,
  maxBytes = 1024 * 1024,
) {
  // Old cutoffs can have advanced on a single migration tombstone. They
  // apply only to the original format and must never sweep v2 writing.
  const previous = new Map(archiveMarkers.map((marker) => {
    const cutoff = readValue<{ cutoff: ArchiveCutoff } | null>(accountKey(marker, user), null)?.cutoff
    const valid = Array.isArray(cutoff) && cutoff.length === 3
      && Number.isFinite(cutoff[0]) && typeof cutoff[1] === 'string' && typeof cutoff[2] === 'string'
    return [marker, valid ? cutoff : undefined] as const
  }))
  const cutoffs = new Map(previous)
  const entries = Object.keys(localStorage)
    .flatMap((key) => {
      const base = studyBaseOf(key, user)
      const marker = base && markerFor(base)
      const raw = localStorage.getItem(key)
      if (!marker || !raw)
        return []
      try {
        return [{ key, raw, value: envelope(raw), marker }]
      }
      catch {
        return []
      }
    })
    .sort((a, b) => compareStamp(b.value, a.value) || b.key.localeCompare(a.key))
  let bytes = 0
  let kept = 0
  const encoder = new TextEncoder()
  for (const item of entries) {
    if (item.value.deleted || pastCutoff(item.key, item.value, previous.get(item.marker)))
      continue
    bytes += encoder.encode(item.raw).length
    kept++
    if ((kept > maxEntries || bytes > maxBytes) && cutoffs.get(item.marker) === previous.get(item.marker))
      cutoffs.set(item.marker, [...item.value.stamp, item.key])
  }
  batchStorage(() => {
    for (const marker of archiveMarkers) {
      const cutoff = cutoffs.get(marker)
      const prior = previous.get(marker)
      const durable = cutoff && cutoff !== prior
        ? (saveValue(accountKey(marker, user), { cutoff }) ? cutoff : prior)
        : prior
      for (const item of entries) {
        if (item.marker === marker && pastCutoff(item.key, item.value, durable))
          localStorage.removeItem(item.key)
      }
    }
  })
}
export function saveAiArchive(
  key: string,
  value: unknown,
  user: string | null,
) {
  const ok = saveValue(key, value)
  if (ok)
    pruneArchives(user)
  return ok && localStorage.getItem(key) !== null
}

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
export function archiveBase(base: string) {
  return /^aigrade_(?:speaking_)?v1_/.test(base)
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
  const marker = accountKey('archive_retention_v2', user)
  let cutoff = readValue<{
    cutoff: ArchiveCutoff
  } | null>(marker, null)?.cutoff
  const entries = Object.keys(localStorage)
    .flatMap((key) => {
      const base = studyBaseOf(key, user)
      const raw = localStorage.getItem(key)
      if (!base || !archiveBase(base) || !raw)
        return []
      try {
        const value = envelope(raw)
        return [{ key, raw, value }]
      }
      catch {
        return []
      }
    })
    .sort(
      (a, b) => compareStamp(b.value, a.value) || b.key.localeCompare(a.key),
    )
  let bytes = 0
  let kept = 0
  batchStorage(() => {
    for (const item of entries) {
      if (pastCutoff(item.key, item.value, cutoff)) {
        localStorage.removeItem(item.key)
        continue
      }
      bytes += new TextEncoder().encode(item.raw).length
      if (item.value.deleted || ++kept > maxEntries || bytes > maxBytes) {
        const next: ArchiveCutoff = [...item.value.stamp, item.key]
        if (!cutoff || !pastCutoff(item.key, item.value, cutoff))
          cutoff = next
      }
    }
    if (cutoff && saveValue(marker, { cutoff })) {
      for (const item of entries) {
        if (pastCutoff(item.key, item.value, cutoff))
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

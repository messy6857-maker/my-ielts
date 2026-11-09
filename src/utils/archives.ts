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
  // M7：旧版（legacy，含 v1 作文与口语）评分不再自动清理——旧 cutoff
  // 已退役，旧版结果只由用户手动清理。仅 v2 写作参与预算与清理。
  // M6：预算按格式独立——v2 写作独享 30 份/1 MiB，不再与旧版共用。
  // 顺带清掉已存的旧版 cutoff（一次性；之后不再写入）。
  const legacyKey = accountKey(legacyMarker, user)
  if (localStorage.getItem(legacyKey) !== null)
    localStorage.removeItem(legacyKey)
  const stored = readValue<{ cutoff: ArchiveCutoff } | null>(accountKey(writingMarker, user), null)?.cutoff
  const validPrevious = Array.isArray(stored) && stored.length === 3
    && Number.isFinite(stored[0]) && typeof stored[1] === 'string' && typeof stored[2] === 'string'
    ? stored as ArchiveCutoff
    : undefined
  let cutoff = validPrevious
  const entries = Object.keys(localStorage)
    .flatMap((key) => {
      const base = studyBaseOf(key, user)
      const marker = base && markerFor(base)
      const raw = localStorage.getItem(key)
      if (marker !== writingMarker || !raw)
        return []
      try {
        return [{ key, raw, value: envelope(raw) }]
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
    if (item.value.deleted || pastCutoff(item.key, item.value, validPrevious))
      continue
    bytes += encoder.encode(item.raw).length
    kept++
    if ((kept > maxEntries || bytes > maxBytes) && cutoff === validPrevious)
      cutoff = [...item.value.stamp, item.key]
  }
  batchStorage(() => {
    const durable = cutoff && cutoff !== validPrevious
      ? (saveValue(accountKey(writingMarker, user), { cutoff }) ? cutoff : validPrevious)
      : validPrevious
    for (const item of entries) {
      if (pastCutoff(item.key, item.value, durable))
        localStorage.removeItem(item.key)
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

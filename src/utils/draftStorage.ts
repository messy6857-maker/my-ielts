import { readJson, writeJson } from '../composables/useAuth'

export interface DraftRecord { text: string; secondsLeft: number; updatedAt: number }
export type DraftCollection = Record<string, DraftRecord>

export function isDraftCollection(base: string) {
  return base === 'task1_drafts_v1' || base === 'task2_drafts_v1'
}

function itemSuffix(id: string) {
  return id.split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
}

/** Per-prompt records are authoritative; the original table is a legacy cache. */
export function readDraftCollection(key: string, base: string): DraftCollection {
  const result = readJson<DraftCollection>(key, {}, base)
  const prefix = `${key}__item_`
  const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix) && !k.endsWith('__recovery'))
  for (const itemKey of keys) {
    const suffix = itemKey.slice(prefix.length)
    if (!/^(?:[a-f\d]{4})+$/i.test(suffix))
      continue
    const id = suffix.match(/.{4}/g)!.map(hex => String.fromCharCode(Number.parseInt(hex, 16))).join('')
    const value = readJson<DraftRecord | null | undefined>(itemKey, undefined, `${base}__item_${suffix}`)
    // Corrupt records remain available for recovery, without masking a valid
    // legacy draft. A valid null is a tombstone and must suppress that draft.
    if (value === null) delete result[id]
    else if (value !== undefined) result[id] = value
  }
  return result
}

export function draftChanges(before: DraftCollection, after: DraftCollection) {
  const changes = new Map<string, DraftRecord | null>()
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[id]) !== JSON.stringify(after[id]))
      changes.set(id, after[id] ?? null)
  }
  return changes
}

export function mergeDraftChanges(latest: DraftCollection, before: DraftCollection, after: DraftCollection): DraftCollection {
  for (const [id, value] of draftChanges(before, after)) {
    if (value === null) delete latest[id]
    else latest[id] = value
  }
  return latest
}

export function writeDraftChanges(key: string, base: string, before: DraftCollection, after: DraftCollection) {
  // Independent keys avoid a read/modify/write race between different prompts.
  // Deletions retain a tombstone so a stale table cannot resurrect a draft.
  for (const [id, value] of draftChanges(before, after)) {
    if (!writeJson(`${key}__item_${itemSuffix(id)}`, value))
      return false
  }
  return writeJson(key, readDraftCollection(key, base))
}

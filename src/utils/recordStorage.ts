import { readJson } from '../composables/useAuth'
import { writeStudyBatch } from './studyStorage'

export const recordMaps = ['progress_v1', 'sr_vocabulary_v1', 'listening179_sr_v1', 'reading538_sr_v1']
export const recordSets = ['reading_mastered_v1', 'writing_mastered_v1', 'flashcard_checkin_v1']
export function isRecordCollection(base: string) { return recordMaps.includes(base) || recordSets.includes(base) }
export function recordSuffix(id: string) { return id.split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') }
export function recordId(suffix: string) {
  return /^(?:[a-f\d]{4})+$/i.test(suffix) ? suffix.match(/.{4}/g)!.map(c => String.fromCharCode(Number.parseInt(c, 16))).join('') : null
}
function asMap(value: unknown, set: boolean): Record<string, unknown> {
  return Object.assign(Object.create(null), set ? Object.fromEntries((value as string[]).map(id => [id, true])) : value)
}
function fromMap(value: Record<string, unknown>, set: boolean) { return set ? Object.keys(value) : value }
export function readRecords(key: string, base: string) {
  const set = recordSets.includes(base)
  const result = asMap(readJson(key, set ? [] : {}, base), set)
  for (const k of Object.keys(localStorage).filter(k => k.startsWith(`${key}__entry_`) && !k.endsWith('__recovery'))) {
    const suffix = k.slice(`${key}__entry_`.length)
    const id = recordId(suffix)
    if (id === null) continue
    const value = readJson<unknown>(k, undefined, `${base}__entry_${suffix}`)
    if (value === null) delete result[id]
    else if (value !== undefined) Object.defineProperty(result, id, { value, writable: true, enumerable: true, configurable: true })
  }
  return fromMap(result, set)
}
function changes(base: string, before: unknown, after: unknown) {
  const set = recordSets.includes(base)
  const a = asMap(before, set); const b = asMap(after, set)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(id =>
    JSON.stringify(a[id]) === JSON.stringify(b[id]) ? [] : [[id, b[id] ?? null] as const])
}
export function mergeRecords(base: string, latest: unknown, before: unknown, after: unknown) {
  const set = recordSets.includes(base)
  const result = asMap(latest, set)
  for (const [id, value] of changes(base, before, after)) {
    if (value === null) delete result[id]
    else Object.defineProperty(result, id, { value, writable: true, enumerable: true, configurable: true })
  }
  return fromMap(result, set)
}
export function writeRecords(key: string, base: string, before: unknown, after: unknown) {
  const entries: [string, string][] = changes(base, before, after).map(([id, value]) => [`${key}__entry_${recordSuffix(id)}`, JSON.stringify(value)])
  // Independent entry keys and explicit tombstones keep stale tables from
  // overwriting another word/module, including before storage events arrive.
  writeStudyBatch(entries)
  return readRecords(key, base)
}

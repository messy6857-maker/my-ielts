import { ref } from 'vue'
import { mergeLegacy } from './legacyMerge'

export interface Envelope<T = unknown> {
  __ielts: 2
  stamp: [number, string]
  value?: T
  deleted?: boolean
}
export const storageFailures = ref<string[]>([])
export const storageRevision = ref(0)
const listeners = new Set<(key: string, source: 'local' | 'remote') => void>()
let batchDepth = 0
let batchSource: 'local' | 'remote' | null = null
// “见过的最大戳”下限：会话内棘轮只能防同会话的快钟回放，重载即归零。
// 持久化到 localStorage 后，拉取过快钟设备数据的设备在重载后本地写仍能赢
// （新戳 = max(墙钟, 下限 + 1)，见 saveValue）。只存单调递增的数值，不含账号信息。
// 懒加载：首次写时才读存储，而不是模块导入时读——导入时读会把测试环境里
// 跨文件残留的旧下限带进 fake 时间的用例；生产中首写前存储未被清过，语义相同。
const CLOCK_FLOOR_KEY = 'myielts_clock_floor_v1'
let clock: number | null = null
function currentClockFloor(): number {
  clock ??= 0
  try {
    const stored = Number(localStorage.getItem(CLOCK_FLOOR_KEY))
    if (Number.isSafeInteger(stored) && stored > clock)
      clock = stored
  }
  catch {
    /* Keep the in-memory floor when storage is unavailable. */
  }
  return clock
}

function persistClock(value: number) {
  try {
    localStorage.setItem(
      CLOCK_FLOOR_KEY,
      String(Math.max(value, currentClockFloor())),
    )
  }
  catch {
    /* 存储失败不阻塞写本身；下限仍保留在内存棘轮里。 */
  }
}
let actor = ''
export function writerId() {
  if (!actor) {
    // Reuse a part on reload; a new/duplicated tab receives its own counter writer.
    const navigation = performance.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    try {
      actor
        = navigation?.type === 'reload'
          ? sessionStorage.getItem('myielts_writer_id_v2') || ''
          : ''
      actor ||= crypto.randomUUID()
      sessionStorage.setItem('myielts_writer_id_v2', actor)
    }
    catch {
      actor ||= crypto.randomUUID()
    }
  }
  return actor
}
export const mapBases = [
  'progress_v1',
  'vocabulary_spell_v2',
  'sr_vocabulary_v1',
  'listening179_sr_v1',
  'reading538_sr_v1',
  'corpus_sr_v1',
  'mistake_parts_v2',
  'mistake_resets_v2',
  'daily_parts_v2',
  'daily_resets_v2',
  'stats_parts_v2',
  'timer_sessions_v2',
  'checkin_years_v2',
]
export const setBases = [
  'reading_mastered_v1',
  'writing_mastered_v1',
  'flashcard_checkin_v1',
]
export const arrayBases = [
  'mock_history_v1',
  'task1_essays_v1',
  'task2_essays_v1',
]
export const collectionBases = [...mapBases, ...setBases, ...arrayBases]
const scalarBases = [
  'flashcard_daily_goal_v1',
  'listening179_daily_goal_v1',
  'reading538_daily_goal_v1',
  'corpus_daily_goal_v1',
  'stats_archive_v2',
  'checkin_archive_v2',
  'archive_retention_v2',
  'collection_retention_v3',
  'migration_version_v2',
]
const legacyBases = [
  'vocabulary_spell_v1',
  'mistakes_v1',
  'flashcard_daily_new_v1',
  'listening179_daily_new_v1',
  'reading538_daily_new_v1',
  'corpus_daily_new_v1',
  'study_time_v1',
  'stats_attempts_v1',
]
export function isStudyBase(base: string): boolean {
  const [table, suffix, extra] = base.split('__entry_')
  return (
    extra === undefined
    && ((suffix !== undefined
      && collectionBases.includes(table)
      && /^(?:[a-f\d]{4})+$/i.test(suffix))
      || (suffix === undefined
        && [...collectionBases, ...scalarBases, ...legacyBases].includes(base))
      || /^study_time_v1_[a-z\d-]+$/i.test(base)
      || /^aigrade_(?:speaking_)?v1_(?:[a-z\d]+_)?-?[a-z\d]+$/i.test(base))
  )
}
export function accountPrefix(user: string | null) {
  return user ? `myielts_u_${user}_` : 'myielts_'
}
export function accountKey(base: string, user: string | null) {
  return accountPrefix(user) + base
}
export function studyBaseOf(key: string, user: string | null) {
  const prefix = accountPrefix(user)
  const base = key.startsWith(prefix) ? key.slice(prefix.length) : ''
  return isStudyBase(base) ? base : null
}
export function isStudyKey(key: string) {
  if (studyBaseOf(key, null))
    return true
  const match = key.match(/^myielts_u_(.+)_(.+)$/)
  if (!match)
    return false
  // Match the complete known base. A username prefix never grants ownership.
  return key
    .slice('myielts_u_'.length)
    .split('_')
    .some((_, i, parts) => i > 0 && isStudyBase(parts.slice(i).join('_')))
}
export function encodeId(id: string) {
  return id
    .split('')
    .map(c => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
}
export function decodeId(id: string) {
  return /^(?:[a-f\d]{4})+$/i.test(id)
    ? id
      .match(/.{4}/g)!
      .map(x => String.fromCharCode(Number.parseInt(x, 16)))
      .join('')
    : null
}
export function isEnvelope(value: unknown): value is Envelope {
  const e = value as Envelope | null
  return (
    !!e
    && e.__ielts === 2
    && Array.isArray(e.stamp)
    && Number.isSafeInteger(e.stamp[0])
    && e.stamp[0] >= 0
    && typeof e.stamp[1] === 'string'
  )
}
export function compareStamp(a: Envelope, b: Envelope) {
  return a.stamp[0] - b.stamp[0] || a.stamp[1].localeCompare(b.stamp[1])
}
export function envelope(raw: string): Envelope {
  const value: unknown = JSON.parse(raw)
  return isEnvelope(value)
    ? value
    : { __ielts: 2, stamp: [0, 'legacy'], value }
}
export function readValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null)
      return fallback
    const e = envelope(raw)
    return e.deleted ? fallback : (e.value as T)
  }
  catch {
    return fallback
  }
}
export function subscribeStorage(
  cb: (key: string, source: 'local' | 'remote') => void,
) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function notifyStorage(key: string, source: 'local' | 'remote') {
  if (batchDepth) {
    if (batchSource !== 'local')
      batchSource = source
    return
  }
  storageRevision.value++
  for (const cb of listeners) {
    try {
      cb(key, source)
    }
    catch (error) {
      console.error('Storage subscriber failed', error)
    }
  }
}
export function batchStorage<T>(work: () => T): T {
  batchDepth++
  try {
    return work()
  }
  finally {
    if (--batchDepth === 0 && batchSource) {
      const source = batchSource
      batchSource = null
      notifyStorage('', source)
    }
  }
}
export function saveEnvelope(
  key: string,
  e: Envelope,
  source: 'local' | 'remote' = 'local',
) {
  try {
    localStorage.setItem(key, JSON.stringify(e))
    clock = Math.max(currentClockFloor(), e.stamp[0])
    persistClock(clock)
    storageFailures.value = storageFailures.value.filter(k => k !== key)
    notifyStorage(key, source)
    return true
  }
  catch {
    if (!storageFailures.value.includes(key))
      storageFailures.value = [...storageFailures.value, key]
    return false
  }
}
export function saveValue(key: string, value: unknown, deleted = false) {
  if (!isStudyKey(key)) {
    try {
      if (deleted)
        localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
      notifyStorage(key, 'local')
      return true
    }
    catch {
      if (!storageFailures.value.includes(key))
        storageFailures.value = [...storageFailures.value, key]
      return false
    }
  }
  const old = localStorage.getItem(key)
  let previous: Envelope | undefined
  try {
    if (old)
      previous = envelope(old)
  }
  catch {
    /* Keep the unreadable original for export. */
  }
  if (
    previous
    && !!previous.deleted === deleted
    && JSON.stringify(previous.value) === JSON.stringify(value)
  )
    return true
  clock = Math.max(
    currentClockFloor() + 1,
    Date.now(),
    (previous?.stamp[0] ?? 0) + 1,
  )
  return saveEnvelope(key, {
    __ielts: 2,
    stamp: [clock, writerId()],
    ...(deleted ? { deleted: true } : { value }),
  })
}
export function entryKey(base: string, id: string, user: string | null) {
  return `${accountKey(base, user)}__entry_${encodeId(id)}`
}
export function legacyEntries(
  base: string,
  value: unknown,
): Record<string, unknown> {
  if (setBases.includes(base)) {
    return Array.isArray(value)
      ? Object.fromEntries(
        value.filter(x => typeof x === 'string').map(id => [id, true]),
      )
      : {}
  }
  if (arrayBases.includes(base)) {
    return Array.isArray(value)
      ? Object.fromEntries(
        value
          .filter(x => x && typeof x === 'object')
          .map((x: any) => [
            base === 'mock_history_v1'
              ? `${x.kind}:${x.id}:${x.date}`
              : String(x.id),
            x,
          ]),
      )
      : {}
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export function importTable(base: string, value: unknown, user: string | null) {
  for (const [id, item] of Object.entries(legacyEntries(base, value))) {
    const key = entryKey(base, id, user)
    const raw = localStorage.getItem(key)
    let old: Envelope | null = null
    try {
      if (raw)
        old = envelope(raw)
    }
    catch {
      continue
    }
    if (old && (old.deleted || old.stamp[0] > 0))
      continue
    const merged = old ? mergeLegacy(base, old.value, item) : item
    if (!old || JSON.stringify(old.value) !== JSON.stringify(merged)) {
      saveEnvelope(
        key,
        { __ielts: 2, stamp: [0, 'legacy'], value: merged },
        'remote',
      )
    }
  }
}
export function readRecords<T>(
  base: string,
  user: string | null,
): Record<string, T> {
  const key = accountKey(base, user)
  const marker = `myielts_local_migrated:${key}`
  if (!localStorage.getItem(marker)) {
    importTable(
      base,
      readValue(
        key,
        setBases.includes(base) || arrayBases.includes(base) ? [] : {},
      ),
      user,
    )
    try {
      localStorage.setItem(marker, '1')
    }
    catch {
      /* Repeating an idempotent import is safe. */
    }
  }
  const prefix = `${key}__entry_`
  const records: Record<string, T> = Object.create(null)
  for (const storedKey of Object.keys(localStorage)) {
    if (!storedKey.startsWith(prefix))
      continue
    const id = decodeId(storedKey.slice(prefix.length))
    if (id === null)
      continue
    const value = readValue<T | undefined>(storedKey, undefined)
    if (value !== undefined)
      records[id] = value
  }
  return records
}
/** Read a single entry without enumerating a migrated collection. */
export function readRecord<T>(
  base: string,
  id: string | number,
  user: string | null,
): T | undefined {
  const marker = `myielts_local_migrated:${accountKey(base, user)}`
  if (!localStorage.getItem(marker))
    readRecords(base, user)
  return readValue<T | undefined>(entryKey(base, String(id), user), undefined)
}
export function removeStoredValue(key: string) {
  try {
    localStorage.removeItem(key)
    notifyStorage(key, 'remote')
    return true
  }
  catch {
    return false
  }
}
export function saveRecord(
  base: string,
  id: string,
  value: unknown,
  user: string | null,
) {
  return saveValue(entryKey(base, id, user), value, value === undefined)
}
export function clearRecords(base: string, user: string | null) {
  batchStorage(() => {
    for (const id of Object.keys(readRecords(base, user)))
      saveRecord(base, id, undefined, user)
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage)
      return
    if (event.key === CLOCK_FLOOR_KEY)
      currentClockFloor()
    notifyStorage(event.key ?? '', 'remote')
  })
}

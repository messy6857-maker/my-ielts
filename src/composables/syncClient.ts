import { mergeLegacy } from '../utils/legacyMerge'
import { migrateStudy } from '../utils/migrateStudy'
import { pruneArchives } from '../utils/archives'
import { SYNC_API_BASE } from '../sync-config'
import {
  accountKey,
  batchStorage,
  collectionBases,
  compareStamp,
  envelope,
  importTable,
  notifyStorage,
  readRecords,
  readValue,
  saveEnvelope,
  saveValue,
  storageFailures,
  studyBaseOf,
  subscribeStorage,
} from '../utils/storage'

export const syncEnabled = SYNC_API_BASE.trim() !== ''
export const SYNC_PENDING_KEY = 'myielts_sync_pending_push'
export const AUTH_PENDING_PUSH_KEY = 'myielts_pending_push_v1'
const TOKEN_KEY = 'myielts_sync_token_v1'
interface SessionToken {
  token: string
  username: string
}
function storedToken(): SessionToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw)
      return null
    try {
      const v = JSON.parse(raw)
      if (typeof v.token === 'string' && typeof v.username === 'string')
        return v
    }
    catch {
      /* Migrate old JWT strings. */
    }
    const payload = JSON.parse(
      atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    )
    return typeof payload.username === 'string'
      ? { token: raw, username: payload.username }
      : null
  }
  catch {
    return null
  }
}
export function getTokenOwner() {
  return storedToken()?.username ?? null
}
export function getToken(username?: string | null) {
  const v = storedToken()
  return v && (username === undefined || v.username === username)
    ? v.token
    : null
}
export function setToken(token: string | null, username?: string) {
  if (token && username)
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, username }))
  else localStorage.removeItem(TOKEN_KEY)
}
export function getAuthPendingPush() {
  return localStorage.getItem(AUTH_PENDING_PUSH_KEY) === '1'
}
export function setAuthPendingPush(v: boolean) {
  if (v)
    localStorage.setItem(AUTH_PENDING_PUSH_KEY, '1')
  else localStorage.removeItem(AUTH_PENDING_PUSH_KEY)
}
export function hashString(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
export interface ApiResult {
  ok: boolean
  status: number
  message?: string
  token?: string
  username?: string
  data?: Record<string, string> | null
  /**
   * Keys the server skipped as malformed/foreign (sync PUT only).
   * 新服务端回 [{ key, reason }]，旧服务端回 string[]；两种形状都要兼容
   * （部署窗口内前后端可能错位），见 rejectedKeysOf。
   */
  rejected?: RejectedEntry[]
  updatedAt?: number
  protocolVersion?: number
}
/** 服务端 rejected 原因三类：未知/跨账号 base、非字符串原始值、decode 失败。 */
export type RejectedReason = 'unknown-base' | 'non-string' | 'decode-failed'
export type RejectedEntry = string | { key: string; reason?: string }
/** 归一化 rejected 为纯 key 列表（兼容 string[] 旧形状与对象新形状）。 */
export function rejectedKeysOf(rejected?: RejectedEntry[]): string[] {
  return (rejected ?? []).flatMap(e =>
    typeof e === 'string'
      ? [e]
      : e && typeof e.key === 'string'
        ? [e.key]
        : [],
  )
}
/** 从一次 rejected 响应中取出 key → 原因（无原因的条目不进表）。 */
export function rejectedReasonsOf(
  rejected?: RejectedEntry[],
): Record<string, RejectedReason> {
  const out: Record<string, RejectedReason> = {}
  for (const e of rejected ?? []) {
    if (
      e
      && typeof e !== 'string'
      && typeof e.key === 'string'
      && (e.reason === 'unknown-base' || e.reason === 'non-string' || e.reason === 'decode-failed')
    )
      out[e.key] = e.reason
  }
  return out
}
export const REJECTED_REASON_LABELS: Record<RejectedReason, string> = {
  'unknown-base': '未知或跨账号条目',
  'non-string': '原始值非字符串',
  'decode-failed': '版本戳非法',
}
// Keys the server rejected: quarantined locally so they are never re-uploaded
// (otherwise every push would carry the same poisoned entry again).
// An entry also snapshots the local value's stamp and the quarantine time:
// a locally rewritten value is released automatically, and an unchanged entry
// is re-probed after QUARANTINE_REPROBE_MS (e.g. the server may have been
// upgraded to accept it since) instead of being skipped forever.
const QUARANTINE_KEY = 'myielts_sync_quarantined'
const QUARANTINE_REPROBE_MS = 7 * 24 * 60 * 60 * 1000
const quarantineKey = (owner: string) => `${QUARANTINE_KEY}:${owner}`
interface QuarantineEntry {
  key: string
  /** JSON stamp of the local value when quarantined; null for legacy entries. */
  stamp: string | null
  /** Epoch ms when quarantined; 0 for legacy entries (re-probe at once). */
  at: number
}
export function getQuarantineEntries(owner: string | null): QuarantineEntry[] {
  if (!owner)
    return []
  try {
    const v = JSON.parse(localStorage.getItem(quarantineKey(owner)) || '[]')
    if (!Array.isArray(v))
      return []
    return v.flatMap((item): QuarantineEntry[] => {
      if (typeof item === 'string')
        return [{ key: item, stamp: null, at: 0 }]
      if (item && typeof item.k === 'string') {
        return [{
          key: item.k,
          stamp: typeof item.s === 'string' ? item.s : null,
          at: typeof item.t === 'number' ? item.t : 0,
        }]
      }
      // 写入侧存的是 { key, stamp, at }（见 quarantineKeys）：读取必须认
      // 这种形状，否则隔离表经 localStorage 往返后全丢、隔离整体失效。
      // 旧的 { k, s, t } 紧凑形状仍兼容（已存的老条目不丢）。
      if (item && typeof item.key === 'string') {
        return [{
          key: item.key,
          stamp: typeof item.stamp === 'string' ? item.stamp : null,
          at: typeof item.at === 'number' ? item.at : 0,
        }]
      }
      return []
    })
  }
  catch {
    return []
  }
}
function writeQuarantineEntries(owner: string, entries: QuarantineEntry[]) {
  localStorage.setItem(quarantineKey(owner), JSON.stringify(entries))
}
export function getQuarantinedKeys(owner: string | null): string[] {
  return getQuarantineEntries(owner).map(e => e.key)
}
/** Stamp snapshot of the current local value (null when the key is gone). */
function snapshotOf(key: string): string | null {
  const raw = localStorage.getItem(key)
  if (raw === null)
    return null
  try {
    return JSON.stringify(envelope(raw).stamp)
  }
  catch {
    return `raw:${hashString(raw)}`
  }
}
export function quarantineKeys(owner: string, keys: string[]) {
  if (!owner || !keys.length)
    return
  const byKey = new Map(
    getQuarantineEntries(owner).map(e => [e.key, e] as const),
  )
  for (const key of keys)
    byKey.set(key, { key, stamp: snapshotOf(key), at: Date.now() })
  writeQuarantineEntries(owner, [...byKey.values()])
}
const REJECTED_REASON_KEY = 'myielts_sync_rejected_reasons'
function rejectedReasonKey(owner: string) {
  return `${REJECTED_REASON_KEY}:${owner}`
}
export function unquarantineKeys(owner: string, keys: string[]) {
  if (!owner || !keys.length)
    return
  const drop = new Set(keys)
  const entries = getQuarantineEntries(owner)
  if (entries.some(e => drop.has(e.key)))
    writeQuarantineEntries(owner, entries.filter(e => !drop.has(e.key)))
  try {
    const prev = JSON.parse(
      localStorage.getItem(rejectedReasonKey(owner)) || '{}',
    )
    if (prev && typeof prev === 'object') {
      for (const k of drop)
        delete prev[k]
      localStorage.setItem(rejectedReasonKey(owner), JSON.stringify(prev))
    }
  }
  catch {
    /* 原因表写失败不影响解除本身。 */
  }
}
export function clearQuarantinedKeys(owner: string | null) {
  if (owner) {
    localStorage.removeItem(quarantineKey(owner))
    localStorage.removeItem(rejectedReasonKey(owner))
  }
}
export function getRejectedReason(
  owner: string | null,
  key: string,
): RejectedReason | null {
  if (!owner)
    return null
  try {
    const v = JSON.parse(localStorage.getItem(rejectedReasonKey(owner)) || '{}')
    const r = v?.[key]
    return r === 'unknown-base' || r === 'non-string' || r === 'decode-failed'
      ? r
      : null
  }
  catch {
    return null
  }
}
function storeRejectedReasons(
  owner: string,
  reasons: Record<string, RejectedReason>,
) {
  if (!Object.keys(reasons).length)
    return
  try {
    const prev = JSON.parse(
      localStorage.getItem(rejectedReasonKey(owner)) || '{}',
    )
    localStorage.setItem(
      rejectedReasonKey(owner),
      JSON.stringify({ ...(prev && typeof prev === 'object' ? prev : {}), ...reasons }),
    )
  }
  catch {
    /* 原因只是展示用，写失败不影响隔离本身。 */
  }
}
/** Quarantine the keys a successful push reported as rejected, if any. */
export function handleRejectedKeys(
  owner: string,
  result: { ok: boolean; rejected?: RejectedEntry[] },
): boolean {
  const keys = rejectedKeysOf(result.rejected)
  if (!result.ok || !keys.length)
    return false
  quarantineKeys(owner, keys)
  storeRejectedReasons(owner, rejectedReasonsOf(result.rejected))
  return true
}
/**
 * 同步请求超时（毫秒）：基础 30 秒 + 每 MB 10 秒，上限 300 秒。
 * 大账号在慢上行下不再每次都被固定 30 秒掐断；5MB 上限对应 80 秒。
 */
export function syncTimeoutMs(bodyBytes: number) {
  return Math.min(
    300000,
    30000 + Math.ceil(Math.max(0, bodyBytes) / 1048576) * 10000,
  )
}
const capabilities = new Map<string, number>()
async function api(
  path: string,
  method: string,
  body?: unknown,
  username?: string | null,
): Promise<ApiResult> {
  const token = username ? getToken(username) : null
  if (username && !token)
    return { ok: false, status: 401, message: '账号会话已变化，请重新登录' }
  const controller = new AbortController()
  const bodyText = body === undefined ? undefined : JSON.stringify(body)
  const timeout = setTimeout(
    () => controller.abort(),
    syncTimeoutMs(
      bodyText === undefined
        ? 0
        : new TextEncoder().encode(bodyText).length,
    ),
  )
  try {
    const response = await fetch(`${SYNC_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: bodyText,
      signal: controller.signal,
    })
    let json: any
    try {
      json = await response.json()
    }
    catch {
      return {
        ok: false,
        status: response.status,
        message: '同步服务器返回了非 JSON 响应，请稍后重试',
      }
    }
    if (
      !json
      || typeof json !== 'object'
      || Array.isArray(json)
      || json.ok !== true
      || !response.ok
    ) {
      return {
        ok: false,
        status: response.status,
        message:
          typeof json?.message === 'string'
            ? json.message
            : '同步服务器响应异常，请重试',
      }
    }
    if (
      path === '/sync'
      && method === 'GET'
      && !(
        json.data === null
        || (json.data
          && typeof json.data === 'object'
          && !Array.isArray(json.data)
          && Object.values(json.data).every(v => typeof v === 'string'))
      )
    ) {
      return {
        ok: false,
        status: response.status,
        message: '同步数据格式异常，已保留本机记录',
      }
    }
    return { ...json, ok: true, status: response.status }
  }
  catch {
    return {
      ok: false,
      status: 0,
      message: controller.signal.aborted
        ? '同步请求超时，请重试'
        : '无法连接同步服务器',
    }
  }
  finally {
    clearTimeout(timeout)
  }
}
export function apiRegister(username: string, password: string) {
  return api('/register', 'POST', { username, password })
}
export function apiLogin(username: string, password: string) {
  return api('/login', 'POST', { username, password })
}
export async function apiPull(username = getTokenOwner() ?? '') {
  const result = await api('/sync', 'GET', undefined, username)
  if (result.ok)
    capabilities.set(username, result.protocolVersion ?? 1)
  return result
}
let pushQueue = Promise.resolve()
export function apiPush(
  data: Record<string, string>,
  username = getTokenOwner() ?? '',
): Promise<ApiResult> {
  const token = getToken(username)
  const task = pushQueue.then(async () => {
    if (!token || token !== getToken(username)) {
      return {
        ok: false,
        status: 401,
        message: '账号会话已变化，未上传旧账号记录',
      }
    }
    if (capabilities.get(username) !== 2) {
      const probe = await apiPull(username)
      if (!probe.ok)
        return probe
      if (probe.protocolVersion !== 2) {
        return {
          ok: false,
          status: 426,
          message: '同步服务需要更新后才能安全上传；学习记录已保存在本机',
        }
      }
      // 探针拉取结果顺手应用：少一次往返的陈旧窗口。只在协议 2 确认后应用，
      // 426 门禁语义不变（旧服务端的数据不应用）。
      if (probe.data)
        applySyncData(probe.data, username)
    }
    return api('/sync', 'PUT', { protocolVersion: 2, data }, username)
  })
  pushQueue = task.then(
    () => {},
    () => {},
  )
  return task
}
export function collectSyncData(username: string): Record<string, string> {
  migrateStudy(username)
  pruneArchives(username)
  batchStorage(() => {
    for (const base of collectionBases) readRecords(base, username)
  })
  if (!storageFailures.value.some(key => studyBaseOf(key, username)))
    saveValue(accountKey('migration_version_v2', username), 2)
  const result: Record<string, string> = Object.create(null)
  // Quarantined keys are skipped only while the local value is unchanged
  // and the re-probe window has not elapsed. A rewritten value is released
  // at once; an expired or legacy (snapshot-less) entry is included in this
  // push so the server gets another chance — pushNow removes it if the
  // server accepts it, or re-quarantines it with a fresh stamp/time if not.
  const quarantined = new Set<string>()
  const released: string[] = []
  const now = Date.now()
  for (const entry of getQuarantineEntries(username)) {
    if (entry.stamp === null)
      continue
    const current = snapshotOf(entry.key)
    if (current === null || current !== entry.stamp) {
      released.push(entry.key)
      continue
    }
    if (now - entry.at < QUARANTINE_REPROBE_MS)
      quarantined.add(entry.key)
  }
  if (released.length)
    unquarantineKeys(username, released)
  for (const key of Object.keys(localStorage)) {
    const base = studyBaseOf(key, username)
    if (
      !base
      || quarantined.has(key)
      || collectionBases.includes(base)
      || [
        'mistakes_v1',
        'stats_attempts_v1',
        'study_time_v1',
      ].includes(base)
      || base.endsWith('_daily_new_v1')
      || base.startsWith('study_time_v1_')
    )
      continue
    const raw = localStorage.getItem(key)
    if (raw === null)
      continue
    try {
      result[key] = JSON.stringify(envelope(raw))
    }
    catch {
      /* Invalid originals remain available in the local backup export. */
    }
  }
  return result
}
export function onSyncApplied(cb: () => void) {
  return subscribeStorage((_key, source) => {
    if (source === 'remote')
      cb()
  })
}
export function applySyncData(data: Record<string, string>, username: string) {
  let count = 0
  batchStorage(() => {
    for (const [key, raw] of Object.entries(data)) {
      const base = studyBaseOf(key, username)
      if (!base || typeof raw !== 'string')
        continue
      try {
        const incoming = envelope(raw)
        if (collectionBases.includes(base)) {
          if (!incoming.deleted)
            importTable(base, incoming.value, username)
          continue
        }
        if (
          base.startsWith('checkin_years_v2__entry_')
          && !incoming.deleted
          && Array.isArray(incoming.value)
        ) {
          const old = readValue<number[]>(key, [])
          const merged = [...new Set([...old, ...incoming.value])].sort(
            (a, b) => Number(a) - Number(b),
          )
          const previous = localStorage.getItem(key)
          const latest
            = previous && compareStamp(envelope(previous), incoming) > 0
              ? envelope(previous)
              : incoming
          if (JSON.stringify(old) !== JSON.stringify(merged)) {
            saveEnvelope(key, { ...latest, value: merged }, 'remote')
            count++
          }
          continue
        }
        const previousRaw = localStorage.getItem(key)
        if (base === 'archive_retention_v2') {
          const previous = previousRaw ? envelope(previousRaw) : undefined
          const cuts = [
            (previous?.value as any)?.cutoff,
            (incoming.value as any)?.cutoff,
          ].filter(
            c =>
              Array.isArray(c)
              && c.length === 3
              && Number.isFinite(c[0])
              && typeof c[1] === 'string'
              && typeof c[2] === 'string',
          ) as Array<[number, string, string]>
          cuts.sort(
            (a, b) =>
              a[0] - b[0]
              || a[1].localeCompare(b[1])
              || a[2].localeCompare(b[2]),
          )
          const cutoff = cuts.at(-1)
          if (cutoff) {
            const latest
              = previous && compareStamp(previous, incoming) > 0
                ? previous
                : incoming
            const merged = {
              __ielts: 2 as const,
              stamp: latest.stamp,
              value: { cutoff },
            }
            if (
              JSON.stringify(previous) !== JSON.stringify(merged)
              && saveEnvelope(key, merged, 'remote')
            )
              count++
            continue
          }
        }
        if (previousRaw && incoming.stamp[0] === 0) {
          const previous = envelope(previousRaw)
          if (
            previous.stamp[0] === 0
            && !previous.deleted
            && !incoming.deleted
          ) {
            // 戳 0 的 legacy 种子键走 union/max 语义（与服务端对齐），不是纯 LWW：
            // 两设备各执一份 legacy 数据时，后来者不再因戳相等被丢弃。
            // 注意传表名（去掉 __entry_ 后缀），否则 legacyMerge 的分支永不命中。
            const merged = mergeLegacy(
              base.split('__entry_')[0],
              previous.value,
              incoming.value,
            )
            if (JSON.stringify(merged) !== JSON.stringify(previous.value)) {
              saveEnvelope(key, { ...incoming, value: merged }, 'remote')
              count++
            }
            continue
          }
        }
        if (
          previousRaw !== null
          && compareStamp(incoming, envelope(previousRaw)) <= 0
        )
          continue
        if (saveEnvelope(key, incoming, 'remote'))
          count++
      }
      catch {
        /* Ignore malformed remote entries without replacing local records. */
      }
    }
    migrateStudy(username)
    pruneArchives(username)
    if (count)
      notifyStorage('', 'remote')
  })
  return count
}

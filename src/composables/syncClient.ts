import { compactStatsData } from '../utils/statsArchive'
import { mergeEntry } from '../utils/entryMerge'
import { compactDeletionData, pruneCollectionData } from '../utils/retention'
import { migrateStudy } from '../utils/migrateStudy'
import { pruneArchives } from '../utils/archives'
import { SYNC_API_BASE } from '../sync-config'
import {
  accountKey,
  batchStorage,
  collectionBases,
  envelope,
  importTable,
  notifyStorage,
  readRecords,
  removeStoredValue,
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
  sentData?: Record<string, string>
  updatedAt?: number
  nextCursor?: string | null
  compactStats?: boolean
  compactDeletes?: boolean
  protocolVersion?: number
}
/** 服务端 rejected 原因三类：未知/跨账号 base、非字符串原始值、decode 失败。 */
export type RejectedReason =
  | 'unknown-base'
  | 'non-string'
  | 'decode-failed'
  | 'entry-too-large'
export type RejectedEntry = string | { key: string; reason?: string }
/** 归一化 rejected 为纯 key 列表（兼容 string[] 旧形状与对象新形状）。 */
export function rejectedKeysOf(rejected?: RejectedEntry[]): string[] {
  return (rejected ?? []).flatMap(e =>
    typeof e === 'string' ? [e] : e && typeof e.key === 'string' ? [e.key] : [],
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
      && (e.reason === 'unknown-base'
        || e.reason === 'non-string'
        || e.reason === 'decode-failed'
        || e.reason === 'entry-too-large')
    )
      out[e.key] = e.reason
  }
  return out
}
export const REJECTED_REASON_LABELS: Record<RejectedReason, string> = {
  'unknown-base': '未知或跨账号条目',
  'non-string': '原始值非字符串',
  'decode-failed': '版本戳非法',
  'entry-too-large': '单条记录超出上传上限，原文保留在本机备份',
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
        return [
          {
            key: item.k,
            stamp: typeof item.s === 'string' ? item.s : null,
            at: typeof item.t === 'number' ? item.t : 0,
          },
        ]
      }
      // 写入侧存的是 { key, stamp, at }（见 quarantineKeys）：读取必须认
      // 这种形状，否则隔离表经 localStorage 往返后全丢、隔离整体失效。
      // 旧的 { k, s, t } 紧凑形状仍兼容（已存的老条目不丢）。
      if (item && typeof item.key === 'string') {
        return [
          {
            key: item.key,
            stamp: typeof item.stamp === 'string' ? item.stamp : null,
            at: typeof item.at === 'number' ? item.at : 0,
          },
        ]
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
  notifyStorage(quarantineKey(owner), 'local')
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
  if (entries.some(e => drop.has(e.key))) {
    writeQuarantineEntries(
      owner,
      entries.filter(e => !drop.has(e.key)),
    )
  }
  try {
    const prev = JSON.parse(
      localStorage.getItem(rejectedReasonKey(owner)) || '{}',
    )
    if (prev && typeof prev === 'object') {
      for (const k of drop) delete prev[k]
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
    notifyStorage(quarantineKey(owner), 'local')
  }
}
export function getRejectedReason(
  owner: string | null,
  key: string,
): RejectedReason | null {
  if (!owner)
    return null
  try {
    const v = JSON.parse(
      localStorage.getItem(rejectedReasonKey(owner)) || '{}',
    )
    const r = v?.[key]
    return r === 'unknown-base'
      || r === 'non-string'
      || r === 'decode-failed'
      || r === 'entry-too-large'
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
      JSON.stringify({
        ...(prev && typeof prev === 'object' ? prev : {}),
        ...reasons,
      }),
    )
  }
  catch {
    /* 原因只是展示用，写失败不影响隔离本身。 */
  }
}
/** Quarantine the keys a successful push reported as rejected, if any. */
export function handleRejectedKeys(
  owner: string,
  result: {
    ok: boolean
    rejected?: RejectedEntry[]
    sentData?: Record<string, string>
  },
  sent?: Record<string, string>,
): boolean {
  sent ??= result.sentData
  const keys = rejectedKeysOf(result.rejected).filter((key) => {
    if (!sent)
      return true
    const raw = sent[key]
    if (raw === undefined)
      return false
    try {
      return snapshotOf(key) === JSON.stringify(envelope(raw).stamp)
    }
    catch {
      return localStorage.getItem(key) === raw
    }
  })
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
const compactServers = new Set<string>()
const deletionServers = new Set<string>()
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
      bodyText === undefined ? 0 : new TextEncoder().encode(bodyText).length,
    ),
  )
  try {
    const response = await fetch(`${SYNC_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(path.split('?')[0] === '/sync'
          ? { 'X-IELTS-Compact': '1', 'X-IELTS-Deletes': '1' }
          : {}),
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
      path.split('?')[0] === '/sync'
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
  const token = getToken(username)
  for (let attempt = 0; attempt < 3; attempt++) {
    let result = await api('/sync', 'GET', undefined, username)
    const all: Record<string, string> = { ...(result.data || {}) }
    const cursors = new Set<string>()
    let restart = false
    while (result.ok && result.nextCursor) {
      if (getToken(username) !== token) {
        return {
          ok: false,
          status: 401,
          message: '账号会话已变化，未应用旧账号数据',
        }
      }
      if (cursors.has(result.nextCursor))
        return { ok: false, status: 502, message: '同步分页异常，请重试' }
      cursors.add(result.nextCursor)
      result = await api(
        `/sync?cursor=${encodeURIComponent(result.nextCursor)}`,
        'GET',
        undefined,
        username,
      )
      if (result.status === 409) {
        restart = true
        break
      }
      Object.assign(all, result.data || {})
    }
    if (restart)
      continue
    if (getToken(username) !== token) {
      return {
        ok: false,
        status: 401,
        message: '账号会话已变化，未应用旧账号数据',
      }
    }
    if (result.ok) {
      capabilities.set(username, result.protocolVersion ?? 1)
      if (result.compactDeletes)
        deletionServers.add(username)
      else deletionServers.delete(username)
      if (result.compactStats)
        compactServers.add(username)
      else compactServers.delete(username)
    }
    return result.ok
      ? {
          ...result,
          data: result.data === null && !Object.keys(all).length ? null : all,
        }
      : result
  }
  return { ok: false, status: 409, message: '云端正在更新，请稍后重试拉取' }
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
    if (
      Object.keys(data).some(k => k.includes('_stats_archive_v3__entry_'))
      && !compactServers.has(username)
    ) {
      return {
        ok: false,
        status: 426,
        message: '同步服务需要支持统计压缩后才能上传，原记录保留在本机。',
      }
    }
    if (
      Object.keys(data).some(k =>
        k.includes('_deletion_archive_v3__entry_'),
      )
      && !deletionServers.has(username)
    ) {
      return {
        ok: false,
        status: 426,
        message: '同步服务需要支持删除索引后才能上传，原记录保留在本机。',
      }
    }
    const result: ApiResult = {
      ok: true,
      status: 200,
      data: {},
      rejected: [],
      sentData: data,
    }
    const encoder = new TextEncoder()
    const send = async (
      entries: Array<[string, string]>,
    ): Promise<ApiResult> => {
      if (getToken(username) !== token) {
        return {
          ok: false,
          status: 401,
          message: '账号会话已变化，未继续上传',
        }
      }
      const reply = await api(
        '/sync',
        'PUT',
        { protocolVersion: 2, data: Object.fromEntries(entries) },
        username,
      )
      if (reply.status === 413 && entries.length > 1) {
        const middle = Math.ceil(entries.length / 2)
        const left = await send(entries.slice(0, middle))
        return left.ok ? send(entries.slice(middle)) : left
      }
      if (reply.ok) {
        if (reply.compactDeletes)
          deletionServers.add(username)
        else deletionServers.delete(username)
        if (reply.compactStats)
          compactServers.add(username)
        else compactServers.delete(username)
        if (reply.data)
          applySyncData(reply.data, username)
        result.rejected!.push(...(reply.rejected ?? []))
        Object.assign(result.data!, reply.data ?? {})
      }
      return reply
    }
    let batch: Array<[string, string]> = []
    let bytes = 0
    for (const entry of Object.entries(data)) {
      const size = encoder.encode(JSON.stringify(entry)).length + 2
      if (size > 4 * 1024 * 1024) {
        result.rejected!.push({ key: entry[0], reason: 'entry-too-large' })
        continue
      }
      if (batch.length && bytes + size > 256 * 1024) {
        const reply = await send(batch)
        if (!reply.ok)
          return reply
        batch = []
        bytes = 0
      }
      batch.push(entry)
      bytes += size
    }
    const reply = await send(batch)
    if (!reply.ok)
      return reply
    return { ...reply, ...result }
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
  const originals = new Map<string, string>()
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
      || (base === 'typing_ignore_case_v2' && !deletionServers.has(username))
      || [
        'vocabulary_spell_v1',
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
      originals.set(key, raw)
      const record = envelope(raw)
      // Old backends/clients still expect a spelling string; keep alternatives locally until capability negotiation succeeds.
      if (
        !deletionServers.has(username)
        && base.startsWith('vocabulary_spell_v2__entry_')
        && !record.deleted
        && Array.isArray((record.value as any)?.alternatives)
      )
        record.value = (record.value as any).text
      result[key] = JSON.stringify(record)
    }
    catch {
      /* Invalid originals remain available in the local backup export. */
    }
  }
  const prunedStats = compactStatsData(
    pruneCollectionData(result, username),
    username,
    compactServers.has(username),
  )
  const pruned = compactDeletionData(
    prunedStats,
    username,
    deletionServers.has(username),
  )
  let durable = true
  const saved: Record<string, string> = {}
  batchStorage(() => {
    // Replacement guards must be durable before their original records are removed.
    for (const [key, raw] of Object.entries(pruned)) {
      if (raw !== result[key]) {
        if (saveEnvelope(key, envelope(String(raw)), 'remote'))
          saved[key] = String(raw)
        else durable = false
      }
    }
    if (durable) {
      for (const key of Object.keys(result)) {
        if (
          !(key in pruned)
          && localStorage.getItem(key) === originals.get(key)
        )
          removeStoredValue(key)
      }
    }
  })
  if (!durable)
    return { ...result, ...saved }

  return pruned
}
export function onSyncApplied(cb: () => void) {
  return subscribeStorage((_key, source) => {
    if (source === 'remote')
      cb()
  })
}
export function applySyncData(data: Record<string, string>, username: string) {
  data = pruneCollectionData(data, username)
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
        const previousRaw = localStorage.getItem(key)
        const previous = previousRaw ? envelope(previousRaw) : undefined
        const merged = mergeEntry(base, previous, incoming)
        if (JSON.stringify(merged) === JSON.stringify(previous))
          continue
        if (saveEnvelope(key, merged, 'remote'))
          count++
      }
      catch {
        /* Ignore malformed remote entries without replacing local records. */
      }
    }
    migrateStudy(username)
    pruneArchives(username)
    collectSyncData(username)
    if (count)
      notifyStorage('', 'remote')
  })
  return count
}

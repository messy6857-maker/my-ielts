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
  isEnvelope,
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
  /** Keys the server skipped as malformed/foreign (sync PUT only). */
  rejected?: string[]
  updatedAt?: number
  protocolVersion?: number
}
// Keys the server rejected: quarantined locally so they are never re-uploaded
// (otherwise every push would carry the same poisoned entry again).
const QUARANTINE_KEY = 'myielts_sync_quarantined'
const quarantineKey = (owner: string) => `${QUARANTINE_KEY}:${owner}`
export function getQuarantinedKeys(owner: string | null): string[] {
  if (!owner)
    return []
  try {
    const v = JSON.parse(localStorage.getItem(quarantineKey(owner)) || '[]')
    return Array.isArray(v) ? v.filter(k => typeof k === 'string') : []
  }
  catch {
    return []
  }
}
export function quarantineKeys(owner: string, keys: string[]) {
  if (!owner || !keys.length)
    return
  const merged = [...new Set([...getQuarantinedKeys(owner), ...keys])]
  localStorage.setItem(quarantineKey(owner), JSON.stringify(merged))
}
export function clearQuarantinedKeys(owner: string | null) {
  if (owner)
    localStorage.removeItem(quarantineKey(owner))
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
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${SYNC_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  const quarantined = new Set(getQuarantinedKeys(username))
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
        'tombstones_v1',
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
            const merged = mergeLegacy(base, previous.value, incoming.value)
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
    const tombs = readValue<
      Array<{
        k: string
        h: string
      }>
    >(accountKey('tombstones_v1', username), [])
    if (Array.isArray(tombs)) {
      for (const tomb of tombs) {
        if (!studyBaseOf(tomb.k, username))
          continue
        const raw = localStorage.getItem(tomb.k)
        try {
          if (
            raw
            && !isEnvelope(JSON.parse(raw))
            && hashString(raw) === tomb.h
          ) {
            saveEnvelope(
              tomb.k,
              { __ielts: 2, stamp: [0, 'legacy-delete'], deleted: true },
              'remote',
            )
          }
        }
        catch {
          /* Preserve malformed originals. */
        }
      }
    }
    migrateStudy(username)
    pruneArchives(username)
    if (count)
      notifyStorage('', 'remote')
  })
  return count
}

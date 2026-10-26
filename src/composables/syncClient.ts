// 云同步底层客户端：纯函数 + token 存取，不依赖 useAuth（避免循环引用）
import { SYNC_API_BASE } from '../sync-config'
import { parseStudyValue } from '../utils/studySchema'
import { collectStudySnapshot } from '../utils/studySnapshot'
import { studyBaseOf, writeStudyBatch } from '../utils/studyStorage'

export const syncEnabled = SYNC_API_BASE.trim() !== ''

const TOKEN_KEY = 'myielts_sync_token_v1'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  }
  catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token)
      localStorage.setItem(TOKEN_KEY, token)
    else
      localStorage.removeItem(TOKEN_KEY)
  }
  catch {
    // 忽略
  }
}

interface ApiResult {
  ok: boolean
  message?: string
  token?: string
  username?: string
  data?: Record<string, string> | null
  updatedAt?: number
}

async function api(path: string, method: string, body?: unknown, token?: string | null): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token === undefined ? getToken() : token
  if (t)
    headers.Authorization = `Bearer ${t}`
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const res = await fetch(`${SYNC_API_BASE}${path}`, {
          method, headers, signal: controller.signal,
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const json = await res.json().catch(() => null)
        if (!json || typeof json !== 'object' || Array.isArray(json))
          return { ok: false, message: '服务器响应格式异常' }
        return { ...json, ok: res.ok && json.ok !== false } as ApiResult
      })(),
      new Promise<ApiResult>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('同步请求超时，请重试'))
        }, 15000)
      }),
    ])
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function apiRegister(username: string, password: string): Promise<ApiResult> {
  return api('/register', 'POST', { username, password })
}

export async function apiLogin(username: string, password: string): Promise<ApiResult> {
  return api('/login', 'POST', { username, password })
}

export async function apiPull(token?: string): Promise<ApiResult> {
  return api('/sync', 'GET', undefined, token)
}

const incompleteSnapshots = new WeakSet<object>()

const uploads = new Map<string, Promise<ApiResult>>()

export async function apiPush(data: Record<string, string>, token?: string): Promise<ApiResult> {
  if (incompleteSnapshots.has(data))
    return { ok: false, message: '本地有损坏的数据，已暂停上传；请先导出备份保留恢复内容' }
  // Logout and automatic/manual uploads share one queue per credential.
  // Capture credentials now rather than reading another account's token later.
  const credential = token ?? getToken()
  const key = credential ?? ''
  const previous = uploads.get(key) ?? Promise.resolve({ ok: true })
  const pending = previous.catch(() => ({ ok: false })).then(() => api('/sync', 'PUT', { data }, credential))
  uploads.set(key, pending)
  try {
    return await pending
  }
  finally {
    if (uploads.get(key) === pending)
      uploads.delete(key)
  }
}

// 收集当前账号需要同步的本地数据（只收 myielts_u_<username>_ 前缀的 key）
export function collectSyncData(username: string): Record<string, string> {
  const snapshot = collectStudySnapshot(username)
  if (snapshot.invalidBases.length)
    incompleteSnapshots.add(snapshot.data)
  return snapshot.data
}

// 把云端数据写回本地，然后调用方负责 reload
export function applySyncData(data: Record<string, string>, username: string): number {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('同步数据格式异常')
  // Validate the complete payload before writing anything. Session, credentials,
  // device identity and other accounts' keys are never imported.
  const entries = Object.entries(data)
  for (const [key, value] of entries) {
    const base = studyBaseOf(key, username)
    if (base === null || typeof value !== 'string')
      throw new Error('同步数据包含其他账号或未知模块')
    parseStudyValue(base, value)
  }
  writeStudyBatch(entries)
  return entries.length
}

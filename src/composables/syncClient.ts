// 云同步底层客户端：纯函数 + token 存取，不依赖 useAuth（避免循环引用）
import { SYNC_API_BASE } from '../sync-config'
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
  const t = token ?? getToken()
  if (t)
    headers.Authorization = `Bearer ${t}`
  const res = await fetch(`${SYNC_API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!json || typeof json !== 'object' || Array.isArray(json))
    return { ok: false, message: '服务器响应格式异常' }
  return { ...json, ok: res.ok && json.ok !== false }
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

export async function apiPush(data: Record<string, string>, token?: string): Promise<ApiResult> {
  return api('/sync', 'PUT', { data }, token)
}

// 收集当前账号需要同步的本地数据（只收 myielts_u_<username>_ 前缀的 key）
export function collectSyncData(username: string): Record<string, string> {
  const data: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && studyBaseOf(key, username) !== null) {
        const value = localStorage.getItem(key)
        if (value !== null)
          data[key] = value
      }
    }
  }
  catch {
    // 忽略
  }
  return data
}

// 把云端数据写回本地，然后调用方负责 reload
export function applySyncData(data: Record<string, string>, username: string): number {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('同步数据格式异常')
  // Validate the complete payload before writing anything. Session, credentials,
  // device identity and other accounts' keys are never imported.
  const entries = Object.entries(data)
  for (const [key, value] of entries) {
    if (studyBaseOf(key, username) === null || typeof value !== 'string')
      throw new Error('同步数据包含其他账号或未知模块')
    JSON.parse(value)
  }
  writeStudyBatch(entries)
  return entries.length
}

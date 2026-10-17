// 云同步底层客户端：纯函数 + token 存取，不依赖 useAuth（避免循环引用）
import { SYNC_API_BASE } from '../sync-config'

export const syncEnabled = SYNC_API_BASE.trim() !== ''

const TOKEN_KEY = 'myielts_sync_token_v1'
const SESSION_KEY = 'myielts_session_v1'

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
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json.ok !== false, ...json }
}

export async function apiRegister(username: string, password: string): Promise<ApiResult> {
  return api('/register', 'POST', { username, password })
}

export async function apiLogin(username: string, password: string): Promise<ApiResult> {
  return api('/login', 'POST', { username, password })
}

export async function apiPull(): Promise<ApiResult> {
  return api('/sync', 'GET')
}

export async function apiPush(data: Record<string, string>): Promise<ApiResult> {
  return api('/sync', 'PUT', { data })
}

// 收集当前账号需要同步的本地数据（只收 myielts_u_<username>_ 前缀的 key）
export function collectSyncData(username: string): Record<string, string> {
  const data: Record<string, string> = {}
  const prefix = `myielts_u_${username}_`
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix) && key !== SESSION_KEY && key !== TOKEN_KEY) {
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
export function applySyncData(data: Record<string, string>): number {
  let count = 0
  try {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('myielts_') && k !== SESSION_KEY && k !== TOKEN_KEY) {
        localStorage.setItem(k, v)
        count++
      }
    }
  }
  catch {
    // 忽略
  }
  return count
}

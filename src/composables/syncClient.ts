// 云同步底层客户端：纯函数 + token 存取，不依赖 useAuth（避免循环引用）
import { SYNC_API_BASE } from '../sync-config'

export const syncEnabled = SYNC_API_BASE.trim() !== ''

const TOKEN_KEY = 'myielts_sync_token_v1'
const SESSION_KEY = 'myielts_session_v1'

// 推送失败标志（localStorage）：失败置位、成功清除；拉取时以此判断本地是否有未推数据
export const SYNC_PENDING_KEY = 'myielts_sync_pending_push'

// 注册/登录/退出时直接 apiPush 失败留下的补推标记（不进同步前缀，本身不同步）。
// useSync 在登录成功/ensureWired 时读到标记就清标记并补推一次。
export const AUTH_PENDING_PUSH_KEY = 'myielts_pending_push_v1'

export function getAuthPendingPush(): boolean {
  try {
    return localStorage.getItem(AUTH_PENDING_PUSH_KEY) === '1'
  }
  catch {
    return false
  }
}

export function setAuthPendingPush(v: boolean) {
  try {
    if (v)
      localStorage.setItem(AUTH_PENDING_PUSH_KEY, '1')
    else
      localStorage.removeItem(AUTH_PENDING_PUSH_KEY)
  }
  catch {
    // 忽略
  }
}

// 小型稳定哈希（djb2 转 16 进制）：墓碑用，不做安全用途；同一字符串恒得同一结果
export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++)
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}

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
  status: number
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
  // status 透出给调用方做 401 专项处理（status 写在展开之后，避免被服务端同名字段覆盖）
  return { ok: res.ok && json.ok !== false, ...json, status: res.status }
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

// 收集当前账号需要同步的本地数据（只收 myielts_u_<username>_ 前缀的 key）。
// 写作草稿（*_draft_v1）只存本机、不同步：草稿 key 按账号隔离后也带用户前缀，
// 若不排除会被收进同步 payload，删掉的草稿会在另一设备拉取/推送后复活。
export function collectSyncData(username: string): Record<string, string> {
  const data: Record<string, string> = {}
  const prefix = `myielts_u_${username}_`
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix) && key !== SESSION_KEY && key !== TOKEN_KEY && !key.endsWith('_draft_v1')) {
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

// 云端数据应用后通知：各 store 借此 reload 内存，避免旧内存覆盖新数据。
// 监听在各 store 创建时注册一次（单例），applySyncData 写满 ≥1 个 key 后触发。
const syncAppliedListeners = new Set<() => void>()
export function onSyncApplied(cb: () => void) {
  syncAppliedListeners.add(cb)
}

function notifySyncApplied() {
  syncAppliedListeners.forEach((cb) => {
    try {
      cb()
    }
    catch {
      // 单个监听失败不影响其他 store
    }
  })
}

// 把云端数据写回本地，然后通知各 store reload 内存。
// 收紧：只写当前账号的同步前缀 key。旧实现写所有 myielts_ 开头的 key，
// 一旦服务端返回了非预期 key（如会话、token、含 API Key 的设置），就会写进本地，
// 其中 ai-settings 一旦进了 u_ 前缀还会被下一轮推送传上云端。
// 墓碑：云端数据里若有 tombstones key 且解析出数组则采用。应用云端条目时，
// 跳过“在墓碑表中且云端 value 哈希等于墓碑哈希”的条目（合并型 PUT 下云端残留的旧删除值）；
// 应用完后，对本地 key：凡在墓碑表中且本地 value 哈希等于墓碑哈希的，直接删除
// （直接 removeItem，不再重复记墓碑，避免递归）。墓碑表本身按云端版本整体写回。
export function applySyncData(data: Record<string, string>, username: string): number {
  const prefix = `myielts_u_${username}_`
  const tombKey = `${prefix}tombstones_v1`
  let count = 0
  try {
    let tombs: Array<{ k: string, h: string }> = []
    const rawTombs = data[tombKey]
    if (rawTombs) {
      try {
        const parsed: unknown = JSON.parse(rawTombs)
        if (Array.isArray(parsed)) {
          tombs = parsed.filter((t): t is { k: string, h: string } =>
            !!t && typeof (t as { k?: unknown }).k === 'string' && typeof (t as { h?: unknown }).h === 'string')
        }
      }
      catch {
        // 云端墓碑损坏则按无墓碑处理
      }
    }
    const tombMap = new Map(tombs.map(t => [t.k, t.h]))
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith(prefix))
        continue
      if (tombMap.has(k) && tombMap.get(k) === hashString(v))
        continue
      localStorage.setItem(k, v)
      count++
    }
    for (const [k, h] of tombMap) {
      if (k === tombKey)
        continue
      const local = localStorage.getItem(k)
      if (local !== null && hashString(local) === h)
        localStorage.removeItem(k)
    }
  }
  catch {
    // 忽略
  }
  if (count > 0)
    notifySyncApplied()
  return count
}

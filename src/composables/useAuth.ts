// 账号体系：纯前端本地账号
// 注册/登录/记住我，会话恢复；密码加盐哈希后存 localStorage
// 注意：这是单机本地实现，用于按账号隔离学习数据，不做服务端校验

export interface AccountRecord {
  salt: string
  hash: string
  createdAt: number
}

const USERS_KEY = 'myielts_users_v1'
const SESSION_KEY = 'myielts_session_v1'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw)
      return fallback
    return JSON.parse(raw) as T
  }
  catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // 配额不足等情况静默失败
  }
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface AuthResult {
  ok: boolean
  message?: string
}

export const useAuth = createGlobalState(() => {
  const currentUser = ref<string | null>(null)

  function readUsers(): Record<string, AccountRecord> {
    return readJson<Record<string, AccountRecord>>(USERS_KEY, {})
  }

  // 启动时恢复会话：优先 localStorage（记住我），其次 sessionStorage
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const session = JSON.parse(raw) as { username?: string }
      if (session.username && readUsers()[session.username])
        currentUser.value = session.username
    }
  }
  catch {
    // 会话损坏则视为未登录
  }

  function setSession(username: string, remember: boolean) {
    const value = JSON.stringify({ username, ts: Date.now() })
    try {
      if (remember) {
        localStorage.setItem(SESSION_KEY, value)
        sessionStorage.removeItem(SESSION_KEY)
      }
      else {
        sessionStorage.setItem(SESSION_KEY, value)
        localStorage.removeItem(SESSION_KEY)
      }
    }
    catch {
      // 忽略
    }
  }

  async function register(username: string, password: string): Promise<AuthResult> {
    username = username.trim()
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username))
      return { ok: false, message: '用户名需为 2-20 位字母、数字、下划线或中文' }
    if (password.length < 4)
      return { ok: false, message: '密码至少 4 位' }
    const users = readUsers()
    if (users[username])
      return { ok: false, message: '用户名已存在，换一个吧' }
    const salt = randomSalt()
    const hash = await sha256Hex(salt + password)
    users[username] = { salt, hash, createdAt: Date.now() }
    writeJson(USERS_KEY, users)
    setSession(username, true)
    currentUser.value = username
    return { ok: true }
  }

  async function login(username: string, password: string, remember: boolean): Promise<AuthResult> {
    username = username.trim()
    const record = readUsers()[username]
    if (!record)
      return { ok: false, message: '用户不存在，请先注册' }
    const hash = await sha256Hex(record.salt + password)
    if (hash !== record.hash)
      return { ok: false, message: '密码不正确' }
    setSession(username, remember)
    currentUser.value = username
    return { ok: true }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
    catch {
      // 忽略
    }
    currentUser.value = null
  }

  return { currentUser, register, login, logout }
})

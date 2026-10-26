// 账号体系：
// - 未配置同步服务器时：纯前端本地账号（密码加盐哈希存 localStorage，单机使用）
// - 配置了 SYNC_API_BASE 时：走服务器注册/登录，学习数据多设备同步
import { validateStudyValue } from '../utils/studySchema'
import { apiLogin, apiPull, apiPush, apiRegister, applySyncData, collectSyncData, getToken, setToken, syncEnabled, TOKEN_KEY } from './syncClient'

export interface AccountRecord {
  salt: string
  hash: string
  createdAt: number
}

const USERS_KEY = 'myielts_users_v1'
const SESSION_KEY = 'myielts_session_v1'
// 服务器托管账号在本地用户表中的标记（仅用于会话恢复，不做本地密码校验）
const SERVER_MARKER_HASH = 'server-managed'

// 本地写入监听：供云同步标记 dirty
const writeListeners = new Set<() => void>()
export function onLocalWrite(cb: () => void) {
  writeListeners.add(cb)
  return () => writeListeners.delete(cb)
}

export function notifyLocalWrite() {
  writeListeners.forEach(cb => cb())
}

export function readJson<T>(key: string, fallback: T, studyBase?: string): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw)
      return fallback
    const value: unknown = JSON.parse(raw)
    if (studyBase)
      validateStudyValue(studyBase, value)
    return value as T
  }
  catch {
    if (studyBase && !key.endsWith('__recovery')) {
      try {
        const raw = localStorage.getItem(key)
        if (raw !== null && localStorage.getItem(`${key}__recovery`) === null)
          localStorage.setItem(`${key}__recovery`, raw)
      }
      catch { /* The original key remains intact if recovery storage is full. */ }
    }
    return fallback
  }
}

export const storageFailures = ref<string[]>([])

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    if (!storageFailures.value.includes(key))
      storageFailures.value = [...storageFailures.value, key]
    return false
  }
  storageFailures.value = storageFailures.value.filter(failed => failed !== key)
  notifyLocalWrite()
  return true
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

const beforeLogout = new Set<() => void>()
export function onBeforeLogout(callback: () => void) {
  beforeLogout.add(callback)
  return () => beforeLogout.delete(callback)
}

export const useAuth = createGlobalState(() => {
  const currentUser = ref<string | null>(null)
  const sessionRevision = ref(0)

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
    sessionRevision.value++
  }

  // 服务器托管账号：在本地用户表留标记，保证会话恢复能通过
  function ensureServerMarker(username: string) {
    const users = readUsers()
    if (!users[username] || users[username].hash !== SERVER_MARKER_HASH) {
      users[username] = { salt: '', hash: SERVER_MARKER_HASH, createdAt: Date.now() }
      writeJson(USERS_KEY, users)
    }
  }

  // ---------- 服务器模式 ----------
  async function serverRegister(username: string, password: string): Promise<AuthResult> {
    username = username.trim()
    if (!/^[\w\u4E00-\u9FA5]{2,20}$/.test(username))
      return { ok: false, message: '用户名需为 2-20 位字母、数字、下划线或中文' }
    if (password.length < 4)
      return { ok: false, message: '密码至少 4 位' }
    let r: Awaited<ReturnType<typeof apiRegister>>
    try {
      r = await apiRegister(username, password)
    }
    catch {
      return { ok: false, message: '无法连接同步服务器，请检查网络' }
    }
    if (!r.ok || !r.token)
      return { ok: false, message: r.message || '注册失败' }
    setToken(r.token, username)
    ensureServerMarker(username)
    // 新账号：把本机现有数据（如果有）推到云端，完成迁移
    try {
      await apiPush(collectSyncData(username), r.token)
    }
    catch {
      // 推送失败不阻塞注册，后续自动同步会补
    }
    setSession(username, true)
    currentUser.value = username
    return { ok: true }
  }

  async function serverLogin(username: string, password: string, remember: boolean): Promise<AuthResult> {
    username = username.trim()
    let r: Awaited<ReturnType<typeof apiLogin>>
    try {
      r = await apiLogin(username, password)
    }
    catch {
      return { ok: false, message: '无法连接同步服务器，请检查网络' }
    }
    if (!r.ok || !r.token)
      return { ok: false, message: r.message || '登录失败' }
    // 拉取云端数据并与本地合并
    try {
      const pull = await apiPull(r.token)
      if (!pull.ok)
        return { ok: false, message: pull.message || '读取云端数据失败，请重试' }
      if (pull.data === undefined)
        return { ok: false, message: '云端响应缺少数据字段，请重试' }
      if (pull.data !== null && pull.data !== undefined && (typeof pull.data !== 'object' || Array.isArray(pull.data)))
        return { ok: false, message: '云端数据格式异常' }
      if (pull.data && Object.keys(pull.data).length > 0) {
        const localKeys = Object.keys(collectSyncData(username))
        if (localKeys.length === 0) {
          // 本机没数据：直接用云端
          applySyncData(pull.data, username)
          setToken(r.token, username)
          ensureServerMarker(username)
          setSession(username, remember)
          currentUser.value = username
          location.reload()
          return { ok: true }
        }
        // 两边都有数据：让用户选
        const dt = pull.updatedAt ? new Date(pull.updatedAt).toLocaleString() : '未知时间'
        const useServer = confirm(`云端已有学习数据（更新于 ${dt}），本机也有数据。\n\n点"确定"用云端数据覆盖本机，点"取消"把本机数据上传到云端。`)
        if (useServer) {
          applySyncData(pull.data, username)
          setToken(r.token, username)
          ensureServerMarker(username)
          setSession(username, remember)
          currentUser.value = username
          location.reload()
          return { ok: true }
        }
        const push = await apiPush(collectSyncData(username), r.token)
        if (!push.ok)
          return { ok: false, message: push.message || '上传学习数据失败，请重试' }
      }
      else {
        // 云端没数据：把本机数据推上去（换设备首次登录的迁移场景）
        const push = await apiPush(collectSyncData(username), r.token)
        if (!push.ok)
          return { ok: false, message: push.message || '上传学习数据失败，请重试' }
      }
    }
    catch {
      return { ok: false, message: '同步数据失败，请重试' }
    }
    setToken(r.token, username)
    ensureServerMarker(username)
    setSession(username, remember)
    currentUser.value = username
    return { ok: true }
  }

  // ---------- 本地模式（原有逻辑） ----------
  async function localRegister(username: string, password: string): Promise<AuthResult> {
    username = username.trim()
    if (!/^[\w\u4E00-\u9FA5]{2,20}$/.test(username))
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

  async function localLogin(username: string, password: string, remember: boolean): Promise<AuthResult> {
    username = username.trim()
    const record = readUsers()[username]
    if (!record)
      return { ok: false, message: '用户不存在，请先注册' }
    if (record.hash === SERVER_MARKER_HASH)
      return { ok: false, message: '该账号已迁移到云同步，请检查同步服务器配置' }
    const hash = await sha256Hex(record.salt + password)
    if (hash !== record.hash)
      return { ok: false, message: '密码不正确' }
    setSession(username, remember)
    currentUser.value = username
    return { ok: true }
  }

  async function register(username: string, password: string): Promise<AuthResult> {
    if (syncEnabled)
      return serverRegister(username, password)
    return localRegister(username, password)
  }

  async function login(username: string, password: string, remember: boolean): Promise<AuthResult> {
    if (syncEnabled)
      return serverLogin(username, password, remember)
    return localLogin(username, password, remember)
  }

  const logoutNotice = ref('')
  async function logout() {
    const user = currentUser.value
    const credential = getToken(user)
    let notice = ''
    logoutNotice.value = ''
    // Settle active study sessions before collecting the final upload.
    beforeLogout.forEach((callback) => {
      try { callback() }
      catch { notice = '部分数据未能保存，请检查浏览器存储空间' }
    })
    if (syncEnabled && user && credential) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          apiPush(collectSyncData(user), credential),
          new Promise<{ ok: boolean }>(resolve => { timeout = setTimeout(resolve, 5000, { ok: false }) }),
        ])
        if (!result.ok)
          notice = '已退出；本机学习数据已保留，云端同步未完成，请下次登录后重试'
      }
      catch {
        notice = '已退出；本机学习数据已保留，云端同步未完成，请下次登录后重试'
      }
      finally { clearTimeout(timeout) }
    }
    if (currentUser.value !== user || getToken(user) !== credential)
      return
    logoutNotice.value = notice
    // A different tab may own the shared credential now. Only clear our own.
    if (!syncEnabled || credential)
      setToken(null)
    try {
      const shared = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (shared?.username === user)
        localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
    catch {
      // 忽略
    }
    currentUser.value = null
  }

  // Never adopt another tab's credentials while keeping this tab's answers.
  // Invalidate the page session; local account watchers settle old-owner data.
  useEventListener(window, 'storage', (event: StorageEvent) => {
    if (event.storageArea !== localStorage || (event.key !== null && event.key !== TOKEN_KEY && event.key !== SESSION_KEY))
      return
    sessionRevision.value++
    if (syncEnabled && currentUser.value && !getToken(currentUser.value)) {
      beforeLogout.forEach((callback) => { try { callback() } catch { /* Keep the old account data local. */ } })
      currentUser.value = null
      try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
      logoutNotice.value = '账号已在其他页面变更，请重新登录此页面'
    }
  })

  return { currentUser, sessionRevision, register, login, logout, logoutNotice, syncEnabled }
})

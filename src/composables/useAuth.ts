// 账号体系：
// - 未配置同步服务器时：纯前端本地账号（密码加盐哈希存 localStorage，单机使用）
// - 配置了 SYNC_API_BASE 时：走服务器注册/登录，学习数据多设备同步
import { SYNC_PENDING_KEY, apiLogin, apiPull, apiPush, apiRegister, applySyncData, collectSyncData, getToken, hashString, setAuthPendingPush, setToken, syncEnabled } from './syncClient'

export interface AccountRecord {
  salt: string
  hash: string
  createdAt: number
}

const USERS_KEY = 'myielts_users_v1'
const SESSION_KEY = 'myielts_session_v1'
// 服务器托管账号在本地用户表中的标记（仅用于会话恢复，不做本地密码校验）
const SERVER_MARKER_HASH = 'server-managed'

// 本地写入监听：供云同步标记 dirty（回调收到本次写入的 key）
const writeListeners = new Set<(key: string) => void>()
export function onLocalWrite(cb: (key: string) => void) {
  writeListeners.add(cb)
}

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
    writeListeners.forEach(cb => cb(key))
  }
  catch {
    // 配额不足等情况静默失败
  }
}

// 本地删除监听：供云同步标记 dirty（删除类操作以前没有任何通知通道，
// 如模考记录清空后关页就丢同步）。与 writeJson 对称，删除也通知。
const removeListeners = new Set<(key: string) => void>()
export function onLocalRemove(cb: (key: string) => void) {
  removeListeners.add(cb)
}

export function removeJson(key: string) {
  // 墓碑：仅对当前登录账号的同步前缀 key 记删除，避免多设备下拉取时复活。
  // 墓碑本身用 writeJson 写入（走正常 dirty 推送通道，不直接 setItem 绕过同步）；
  // 墓碑 key 本身、游客 key、token/session/AI 设置类 key 一律不记。
  // 墓碑记失败不阻塞删除本身（分开 try/catch）。
  try {
    const user = useAuth().currentUser.value
    if (user) {
      const prefix = `myielts_u_${user}_`
      const tombKey = `${prefix}tombstones_v1`
      if (key.startsWith(prefix) && key !== tombKey) {
        const old = localStorage.getItem(key)
        if (old !== null) {
          const tombs = readJson<Array<{ k: string, h: string }>>(tombKey, [])
          const next = tombs.filter(t => t.k !== key)
          next.push({ k: key, h: hashString(old) })
          // 上限 100 条，超了丢最旧的
          writeJson(tombKey, next.slice(-100))
        }
      }
    }
  }
  catch {
    // 墓碑失败不阻塞删除
  }
  try {
    localStorage.removeItem(key)
    removeListeners.forEach(cb => cb(key))
  }
  catch {
    // 忽略
  }
}

// 游客数据迁移：游客 key（myielts_<base>，无 u_）→ 账号 key（myielts_u_<user>_<base>），
// 仅当目标 key 不存在时拷贝；游客 key 保留不删。必须在 currentUser 被赋值之前调用，
// 让各 store 的 watch 随后读到迁移后的数据。
// 不迁移：会话/token/用户表/AI 设置（含 Key，绝不能进可同步的 u_ 前缀）/
// 设备标识/界面状态 key/推送失败标志。
const MIGRATE_SKIP_KEYS = new Set([
  SESSION_KEY,
  'myielts_sync_token_v1', // syncClient 内的 TOKEN_KEY，未导出，这里用字面值
  USERS_KEY,
  SYNC_PENDING_KEY,
  'myielts_ai_settings_v1',
  'myielts_device_id',
  'myielts_speaking_tab',
  'myielts_writing_tab',
  'myielts_task1_guide_open',
  'myielts_task2_guide_open',
  // 写作草稿是全局 key（另一人会改为按账号隔离）：游客期草稿绝不能迁成登录账号的草稿
  'myielts_task1_draft_v1',
  'myielts_task2_draft_v1',
])

function migrateGuestData(username: string) {
  const targetPrefix = `myielts_u_${username}_`
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k)
        keys.push(k)
    }
    for (const k of keys) {
      // 模考游客 key：myielts_u_guest_mock_history_v1（用户名恰好为 guest 时与目标相同，跳过）
      if (k === 'myielts_u_guest_mock_history_v1') {
        if (username !== 'guest' && localStorage.getItem(`${targetPrefix}mock_history_v1`) === null) {
          const v = localStorage.getItem(k)
          if (v !== null)
            localStorage.setItem(`${targetPrefix}mock_history_v1`, v)
        }
        continue
      }
      if (k.startsWith('myielts_u_') || MIGRATE_SKIP_KEYS.has(k) || !k.startsWith('myielts_'))
        continue
      // AI 存档的游客 key：myielts_guest_aigrade… → myielts_u_<user>_aigrade…
      let target: string
      if (k.startsWith('myielts_guest_aigrade_speaking_v1_'))
        target = `${targetPrefix}aigrade_speaking_v1_${k.slice('myielts_guest_aigrade_speaking_v1_'.length)}`
      else if (k.startsWith('myielts_guest_aigrade_v1_'))
        target = `${targetPrefix}aigrade_v1_${k.slice('myielts_guest_aigrade_v1_'.length)}`
      else
        target = targetPrefix + k.slice('myielts_'.length)
      if (localStorage.getItem(target) === null) {
        const v = localStorage.getItem(k)
        if (v !== null)
          localStorage.setItem(target, v)
      }
    }
  }
  catch {
    // 迁移失败不阻塞登录/注册，后续同步会补
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
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username))
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
    setToken(r.token)
    ensureServerMarker(username)
    // 先把游客数据迁进账号 key，再推到云端（这样推送里就包含迁移后的数据）
    migrateGuestData(username)
    // 新账号：把本机现有数据（如果有）推到云端，完成迁移。
    // 推送失败不阻塞注册：记补推标记，useSync 在 ensureWired/登录成功时补推一次
    try {
      const pr = await apiPush(collectSyncData(username))
      if (!pr.ok)
        setAuthPendingPush(true)
    }
    catch {
      setAuthPendingPush(true)
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
    setToken(r.token)
    ensureServerMarker(username)
    // 先把游客数据迁进账号 key：迁移后的数据计入"本机数据"，参与下面的冲突判断
    // （以前是本机没数据→直接用云端，游客数据就此静默丢失）
    migrateGuestData(username)
    // 拉取云端数据并与本地合并
    try {
      const pull = await apiPull()
      if (pull.ok && pull.data && Object.keys(pull.data).length > 0) {
        const localKeys = Object.keys(collectSyncData(username))
        if (localKeys.length === 0) {
          // 本机没数据：直接用云端
          applySyncData(pull.data, username)
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
          setSession(username, remember)
          currentUser.value = username
          location.reload()
          return { ok: true }
        }
        // 用户选本机：推送失败不阻塞登录，记补推标记由 useSync 补推
        const pr = await apiPush(collectSyncData(username))
        if (!pr.ok)
          setAuthPendingPush(true)
      }
      else if (pull.ok) {
        // 云端为空：把本机数据推上去（换设备首次登录的迁移场景）。
        // 推送结果要检查：失败就返回失败，而不是静默成功
        const pr = await apiPush(collectSyncData(username))
        if (!pr.ok)
          return { ok: false, message: pr.message || '同步数据上传失败，请重试' }
      }
      else {
        // 拉取失败（服务端 500、代理错误页等）：绝不能当成“云端没数据”把本地全量推上云，
        // 否则可能覆盖云端较新的他设备数据。直接返回失败，不推不覆盖，等用户重试
        return { ok: false, message: pull.message || '拉取云端数据失败，请重试' }
      }
    }
    catch {
      return { ok: false, message: '同步数据失败，请重试' }
    }
    setSession(username, remember)
    currentUser.value = username
    return { ok: true }
  }

  // ---------- 本地模式（原有逻辑） ----------
  async function localRegister(username: string, password: string): Promise<AuthResult> {
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
    migrateGuestData(username)
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
    migrateGuestData(username)
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

  async function logout(): Promise<{ pushOk: boolean }> {
    // 退出前尽力把最新数据推到云端。推送失败时：返回值带给调用方（TheHeader 目前忽略
    // 返回值），同时记补推标记，下次登录成功时由 useSync 补推一次。
    let pushOk = true
    if (syncEnabled && currentUser.value && getToken()) {
      try {
        const pr = await apiPush(collectSyncData(currentUser.value))
        if (!pr.ok) {
          pushOk = false
          setAuthPendingPush(true)
        }
      }
      catch {
        pushOk = false
        setAuthPendingPush(true)
      }
    }
    setToken(null)
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
    catch {
      // 忽略
    }
    currentUser.value = null
    return { pushOk }
  }

  return { currentUser, register, login, logout, syncEnabled }
})

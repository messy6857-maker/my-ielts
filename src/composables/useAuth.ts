// 账号体系：
// - 未配置同步服务器时：纯前端本地账号（密码加盐哈希存 localStorage，单机使用）
// - 配置了 SYNC_API_BASE 时：走服务器注册/登录，学习数据多设备同步
import {
  accountKey,
  batchStorage,
  collectionBases,
  entryKey,
  legacyEntries,
  readRecords,
  readValue,
  saveRecord,
  saveValue,
  storageFailures,
  studyBaseOf,
  subscribeStorage,
} from '../utils/storage'
import {
  SYNC_PENDING_KEY,
  apiLogin,
  apiPull,
  apiPush,
  apiRegister,
  applySyncData,
  collectSyncData,
  getToken,
  getTokenOwner,
  handleRejectedKeys,
  setAuthPendingPush,
  setToken,
  syncEnabled,
} from './syncClient'

export { storageFailures }
export const accountNotice = ref('')
export interface AccountNotice {
  id: string
  message: string
  priority: number
}
export const accountNotices = ref<AccountNotice[]>([])
export function dismissAccountNotice(id: string) {
  const removed = accountNotices.value.find(n => n.id === id)
  accountNotices.value = accountNotices.value.filter(n => n.id !== id)
  if (removed?.message === accountNotice.value)
    accountNotice.value = ''
}
export function pushAccountNotice(message: string, id = message, priority = 1) {
  accountNotices.value = [
    ...accountNotices.value.filter(n => n.id !== id && n.message !== message),
    { id, message, priority },
  ].sort((a, b) => b.priority - a.priority)
  accountNotice.value = message
}
// Compatibility for callers that still assign the original public ref.
watch(
  accountNotice,
  (message, previous) => {
    if (!message && previous) {
      accountNotices.value = accountNotices.value.filter(
        n => n.message !== previous,
      )
    }
    if (message && !accountNotices.value.some(n => n.message === message)) {
      accountNotices.value = [
        ...accountNotices.value,
        { id: message, message, priority: 1 },
      ]
    }
  },
  { flush: 'sync' },
)
export interface AccountRecord {
  salt: string
  hash: string
  createdAt: number
}
const USERS_KEY = 'myielts_users_v1'
const SESSION_KEY = 'myielts_session_v1'
// 服务器托管账号在本地用户表中的标记（仅用于会话恢复，不做本地密码校验）
const SERVER_MARKER_HASH = 'server-managed'
const beforeLogout = new Set<() => void>()
export function onBeforeLogout(cb: () => void) {
  beforeLogout.add(cb)
  return () => beforeLogout.delete(cb)
}
// Storage notifications distinguish local edits from applied remote records.
export function onLocalWrite(cb: (key: string) => void) {
  return subscribeStorage((key, source) => {
    if (source === 'local')
      cb(key)
  })
}

export function readJson<T>(key: string, fallback: T): T {
  return readValue(key, fallback)
}
export function writeJson(key: string, value: unknown) {
  return saveValue(key, value)
}
export function removeJson(key: string) {
  return saveValue(key, undefined, true)
}
// 游客数据迁移：游客 key（myielts_<base>，无 u_）→ 账号 key（myielts_u_<user>_<base>），
// 仅当目标 key 不存在时拷贝；游客 key 保留不删。必须在 currentUser 被赋值之前调用，
// 让各 store 的 watch 随后读到迁移后的数据。
// 不迁移：会话/token/用户表/AI 设置（含 Key，绝不能进可同步的 u_ 前缀）/
// 设备标识/界面状态 key/推送失败标志。
export function migrateGuestData(username: string) {
  batchStorage(() => {
    for (const key of Object.keys(localStorage)) {
      const base = studyBaseOf(key, null)
      if (!base)
        continue
      if (collectionBases.includes(base)) {
        const value = readValue<unknown>(key, undefined)
        const current = readRecords<unknown>(base, username)
        for (const [id, item] of Object.entries(legacyEntries(base, value))) {
          if (
            !(id in current)
            && localStorage.getItem(entryKey(base, id, username)) === null
          )
            saveRecord(base, id, item, username)
        }
        continue
      }
      const target = accountKey(base, username)
      if (localStorage.getItem(target) === null) {
        const value = readValue<unknown>(key, undefined)
        if (value !== undefined)
          saveValue(target, value)
      }
    }
    // Legacy guest mock records used a username-shaped key. Only migrate once.
    const oldGuest = 'myielts_u_guest_mock_history_v1'
    if (
      username !== 'guest'
      && !readValue<Record<string, unknown>>(USERS_KEY, {}).guest
      && localStorage.getItem(accountKey('mock_history_v1', username)) === null
    ) {
      const history = readValue<unknown>(oldGuest, undefined)
      if (history !== undefined)
        saveValue(accountKey('mock_history_v1', username), history)
    }
  })
}
function guestMigrationKey(username: string) {
  return `myielts_local_guest_migration:${username}`
}
export function hasPendingGuestMigration(username: string) {
  return localStorage.getItem(guestMigrationKey(username)) === '1'
}
export function finishGuestMigration(username: string) {
  if (!hasPendingGuestMigration(username))
    return
  migrateGuestData(username)
  if (!storageFailures.value.some(key => studyBaseOf(key, username)))
    localStorage.removeItem(guestMigrationKey(username))
}
function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
export interface AuthResult {
  ok: boolean
  message?: string
}
export const useAuth = createGlobalState(() => {
  const currentUser = ref<string | null>(null)
  const loggingOut = ref(false)
  function readUsers(): Record<string, AccountRecord> {
    return readJson<Record<string, AccountRecord>>(USERS_KEY, {})
  }
  // 启动时恢复会话：优先 localStorage（记住我），其次 sessionStorage
  try {
    const raw
      = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const session = JSON.parse(raw) as {
        username?: string
      }
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
      users[username] = {
        salt: '',
        hash: SERVER_MARKER_HASH,
        createdAt: Date.now(),
      }
      writeJson(USERS_KEY, users)
    }
  }
  // ---------- 服务器模式 ----------
  async function serverRegister(
    username: string,
    password: string,
  ): Promise<AuthResult> {
    username = username.trim()
    if (!/^[a-zA-Z0-9_\u4E00-\u9FA5]{2,20}$/.test(username)) {
      return {
        ok: false,
        message: '用户名需为 2-20 位字母、数字、下划线或中文',
      }
    }
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
    username = r.username || username
    setToken(r.token, username)
    ensureServerMarker(username)
    // 先把游客数据迁进账号 key，再推到云端（这样推送里就包含迁移后的数据）
    migrateGuestData(username)
    // 新账号：把本机现有数据（如果有）推到云端，完成迁移。
    // 推送失败不阻塞注册：记补推标记，useSync 在 ensureWired/登录成功时补推一次
    try {
      const pr = await apiPush(collectSyncData(username), username)
      // 成功也可能带 rejected：立即隔离并记补推，让 useSync 的下次推送
      // 走统一的隔离路径（否则要等用户下次本地写才落地）。
      if (!pr.ok || handleRejectedKeys(username, pr))
        setAuthPendingPush(true)
    }
    catch {
      setAuthPendingPush(true)
    }
    setSession(username, true)
    if (storageFailures.value.length) {
      return {
        ok: false,
        message: '浏览器存储写入失败，请先导出备份并释放空间后重试',
      }
    }
    currentUser.value = username
    return { ok: true }
  }
  async function serverLogin(
    username: string,
    password: string,
    remember: boolean,
  ): Promise<AuthResult> {
    username = username.trim()
    if (
      !/^[a-zA-Z0-9_\u4E00-\u9FA5]{2,20}$/.test(username)
      || password.length < 4
    )
      return { ok: false, message: '请输入有效用户名（2–20位）及至少4位密码' }
    let r: Awaited<ReturnType<typeof apiLogin>>
    try {
      r = await apiLogin(username, password)
    }
    catch {
      return { ok: false, message: '无法连接同步服务器，请检查网络' }
    }
    if (!r.ok || !r.token)
      return { ok: false, message: r.message || '登录失败' }
    username = r.username || username
    setToken(r.token, username)
    ensureServerMarker(username)
    localStorage.setItem(guestMigrationKey(username), '1')
    // 先把游客数据迁进账号 key：迁移后的数据计入"本机数据"，参与下面的冲突判断
    // （以前是本机没数据→直接用云端，游客数据就此静默丢失）
    // 拉取云端数据并与本地合并
    try {
      const pull = await apiPull(username)
      if (!pull.ok)
        setAuthPendingPush(true)

      // A successful login remains usable offline if the initial pull fails.
      if (pull.ok && pull.data)
        applySyncData(pull.data, username)
      if (pull.ok) {
        finishGuestMigration(username)
      }
      else {
        pushAccountNotice(
          '云端首次拉取未完成，游客进度仍保留在游客身份；联网后会自动合并缺失记录。',
          'guest-migration',
        )
      }

      // Merge independently versioned entries; never choose one whole table over another.
      const pushed = pull.ok
        ? await apiPush(collectSyncData(username), username)
        : { ok: false, data: null }
      if (pushed.ok && pushed.data)
        applySyncData(pushed.data, username)
      if (!pushed.ok || handleRejectedKeys(username, pushed))
        setAuthPendingPush(true)
    }
    catch {
      setAuthPendingPush(true)
    }
    setSession(username, remember)
    if (storageFailures.value.length) {
      return {
        ok: false,
        message: '浏览器存储写入失败，请先导出备份并释放空间后重试',
      }
    }
    currentUser.value = username
    return { ok: true }
  }
  // ---------- 本地模式（原有逻辑） ----------
  async function localRegister(
    username: string,
    password: string,
  ): Promise<AuthResult> {
    username = username.trim()
    if (!/^[a-zA-Z0-9_\u4E00-\u9FA5]{2,20}$/.test(username)) {
      return {
        ok: false,
        message: '用户名需为 2-20 位字母、数字、下划线或中文',
      }
    }
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
    if (storageFailures.value.length) {
      return {
        ok: false,
        message: '浏览器存储写入失败，请先导出备份并释放空间后重试',
      }
    }
    currentUser.value = username
    return { ok: true }
  }
  async function localLogin(
    username: string,
    password: string,
    remember: boolean,
  ): Promise<AuthResult> {
    username = username.trim()
    const record = readUsers()[username]
    if (!record)
      return { ok: false, message: '用户不存在，请先注册' }
    if (record.hash === SERVER_MARKER_HASH) {
      return {
        ok: false,
        message: '该账号已迁移到云同步，请检查同步服务器配置',
      }
    }
    const hash = await sha256Hex(record.salt + password)
    if (hash !== record.hash)
      return { ok: false, message: '密码不正确' }
    migrateGuestData(username)
    setSession(username, remember)
    if (storageFailures.value.length) {
      return {
        ok: false,
        message: '浏览器存储写入失败，请先导出备份并释放空间后重试',
      }
    }
    currentUser.value = username
    return { ok: true }
  }
  async function register(
    username: string,
    password: string,
  ): Promise<AuthResult> {
    if (syncEnabled)
      return serverRegister(username, password)
    return localRegister(username, password)
  }
  async function login(
    username: string,
    password: string,
    remember: boolean,
  ): Promise<AuthResult> {
    if (syncEnabled)
      return serverLogin(username, password, remember)
    return localLogin(username, password, remember)
  }
  let logoutJob: Promise<{ pushOk: boolean }> | null = null
  function logout(): Promise<{ pushOk: boolean }> {
    if (logoutJob)
      return logoutJob
    const job = performLogout()
    logoutJob = job
    void job
      .finally(() => {
        if (logoutJob === job)
          logoutJob = null
      })
      .catch(() => {})
    return job
  }
  async function performLogout(): Promise<{ pushOk: boolean }> {
    const owner = currentUser.value
    const tokenAtStart = owner ? getToken(owner) : null
    loggingOut.value = true
    beforeLogout.forEach((cb) => {
      try {
        cb()
      }
      catch (error) {
        console.error('Save before logout failed', error)
      }
    })
    // 退出前尽力把最新数据推到云端。推送失败时：返回值带给调用方（TheHeader 的
    // onLogout 据此写 accountNotice 提示），同时记补推标记，下次登录成功时由 useSync 补推一次。
    let pushOk = true
    if (syncEnabled && currentUser.value && getToken(currentUser.value)) {
      try {
        if (owner && hasPendingGuestMigration(owner)) {
          const pull = await apiPull(owner)
          if (!pull.ok || getToken(owner) !== tokenAtStart)
            throw new Error('首次拉取尚未完成，暂不上传游客迁移数据')
          if (pull.data)
            applySyncData(pull.data, owner)
          finishGuestMigration(owner)
        }
        const pr = await apiPush(
          collectSyncData(currentUser.value),
          currentUser.value,
        )
        if (!pr.ok) {
          pushOk = false
          setAuthPendingPush(true)
        }
        else if (handleRejectedKeys(currentUser.value, pr)) {
          setAuthPendingPush(true)
        }
        else {
          // 退出推送全量成功且无 rejected：本机已无待传数据，清 pending，
          // 下次登录不再多一次空推；有 rejected 时仍走补推标记路径。
          localStorage.removeItem(`${SYNC_PENDING_KEY}:${currentUser.value}`)
        }
      }
      catch {
        pushOk = false
        setAuthPendingPush(true)
      }
    }
    if (owner && getToken(owner) === tokenAtStart)
      setToken(null)
    try {
      const shared = readValue<{
        username?: string
      } | null>(SESSION_KEY, null)
      if (shared?.username === owner)
        localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
    catch {
      // 忽略
    }
    currentUser.value = null
    loggingOut.value = false
    return { pushOk }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (
        event.key !== SESSION_KEY
        && event.key !== 'myielts_sync_token_v1'
        && event.key !== null
      )
        return
      if (currentUser.value && getTokenOwner() !== currentUser.value) {
        // 先写横幅、再置空身份：置空会同步触发模考的 owner watcher，
        // 进行中的模考会把横幅换成更具体的“已暂停”提示；无模考时
        // 本条跨页签提示保留。本页随后被 App.vue 的 watch 踢回首页。
        accountNotice.value = '另一页签切换了账号，本页已回到游客身份'
        currentUser.value = null
      }
    })
  }
  return { currentUser, loggingOut, register, login, logout, syncEnabled }
})

// 云同步状态 + 自动推送（防抖）+ 手动同步
import { SYNC_PENDING_KEY, apiPull, apiPush, applySyncData, collectSyncData, getAuthPendingPush, getToken, setAuthPendingPush, syncEnabled } from './syncClient'
import { onLocalRemove, onLocalWrite, useAuth } from './useAuth'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export const useSync = createGlobalState(() => {
  const { currentUser } = useAuth()
  const status = ref<SyncStatus>('idle')
  const lastSyncAt = ref<number>(0)
  const errorMsg = ref('')
  let dirty = false
  // 计时 key 不排 8 秒定时器，但要记下来：页面隐藏时的 flush 靠它触发推送
  let timerDirty = false
  // 推送世代计数：schedulePush 每次标记 dirty 时递增；pushNow 开始时记录当前值，
  // 成功后仅当世代未变才清 dirty/timerDirty——推送进行中又有新写入时，
  // 旧实现无条件清 dirty 会把那笔新写入的推送资格丢掉（8 秒定时器随后空转一次）
  let pushGen = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let wired = false
  let pushing = false
  // 推送遇 401 时置真：token 已过期，必须重新登录（本地数据不动）
  const authFailed = ref(false)

  function setStatus(s: SyncStatus, msg = '') {
    status.value = s
    errorMsg.value = msg
  }

  function getPendingPush(): boolean {
    try {
      return localStorage.getItem(SYNC_PENDING_KEY) === '1'
    }
    catch {
      return false
    }
  }

  function setPendingPush(v: boolean) {
    try {
      if (v)
        localStorage.setItem(SYNC_PENDING_KEY, '1')
      else
        localStorage.removeItem(SYNC_PENDING_KEY)
    }
    catch {
      // 忽略
    }
  }

  // 需要重新登录：老本地会话无 token，或推送/拉取遇 401（token 已过期）
  const needsRelogin = computed(() => authFailed.value
    || (syncEnabled && !!currentUser.value && !getToken()))

  // 登录成功（或登出）后清除 401 残留状态，由 TheHeader 在账号变化时调用
  function clearAuthError() {
    authFailed.value = false
    setPendingPush(false)
  }

  async function pushNow(force = false): Promise<boolean> {
    if (!syncEnabled || !currentUser.value)
      return false
    if (!getToken()) {
      setStatus('error', '请先退出登录，再重新登录以启用云同步')
      return false
    }
    // 401 门禁：token 已过期时自动推送不再打请求（手动同步不受影响：
    // TheHeader 的 onManualSync 先判 needsRelogin 走退出重登，根本到不了这里；
    // force 参数是给其他直接调用方留的逃生口）
    if (authFailed.value && !force)
      return false
    // 已有推送在跑时不再叠加一次全量序列化 + 上传：只记 dirty，
    // 跑完后若还有新写入再补推一次，避免自测中多次推送互相抢主线程
    if (pushing) {
      dirty = true
      pushGen++
      return false
    }
    pushing = true
    setStatus('syncing')
    const genAtStart = pushGen
    try {
      const data = collectSyncData(currentUser.value)
      const r = await apiPush(data)
      if (r.ok) {
        // 世代未变才清 dirty：推送期间的新写入已递增世代并挂了新定时器，
        // 此时清 dirty 会把那笔写入的推送资格丢掉
        if (genAtStart === pushGen) {
          dirty = false
          timerDirty = false
        }
        setPendingPush(false)
        authFailed.value = false
        lastSyncAt.value = Date.now()
        setStatus('ok')
        return true
      }
      if (r.status === 401) {
        // token 过期：停掉重试循环（不清本地数据），顶栏改显示"请重新登录"；
        // 同时置 pending，阻止回可见拉取用旧云端数据覆盖这批未推数据
        authFailed.value = true
        setPendingPush(true)
        if (genAtStart === pushGen) {
          dirty = false
          timerDirty = false
        }
        setStatus('error', '登录已过期，请重新登录')
        return false
      }
      setPendingPush(true)
      setStatus('error', r.message || '推送失败')
      return false
    }
    catch {
      setPendingPush(true)
      setStatus('error', '无法连接同步服务器')
      return false
    }
    finally {
      pushing = false
      // 推送期间又有新写入、且没有待触发的定时推送时，补一次定时推送
      if ((dirty || timerDirty) && !timer)
        schedulePush()
    }
  }

  // 拉取云端数据写回本地（applySyncData 写满 ≥1 个 key 后会通知各 store reload 内存；
  // 自测队列是会话开始时快照的本地数组，不会被 reload 中途重排，模考答案又在组件本地
  // state，所以定向重载 store 不会清空进行中的模考作答——这就是“不 reload 保模考答案”
  // 取舍的定向重载实现。只在无未推数据时调用，避免覆盖本地还没推上去的改动）
  async function pullNow(): Promise<boolean> {
    if (!syncEnabled || !currentUser.value || !getToken() || pushing)
      return false
    try {
      const r = await apiPull()
      if (r.ok && r.data) {
        applySyncData(r.data, currentUser.value)
        return true
      }
      if (r.status === 401) {
        authFailed.value = true
        setPendingPush(true)
        setStatus('error', '登录已过期，请重新登录')
      }
      return false
    }
    catch {
      return false
    }
  }

  function schedulePush(key?: string) {
    if (!syncEnabled || !currentUser.value || !getToken())
      return
    // 401 门禁：token 已过期时不再为新写入排推送，避免每批写入都再打一次 401
    if (authFailed.value)
      return
    // 学习计时是每设备一个 key、退出/暂停就写一次：不为它单独排 8 秒定时器，
    // 但要记 timerDirty，让页面隐藏时的 flush 能把它带上去（以前是静默 return，
    // 纯计时变化永远不置 dirty，注释里的"页面隐藏时一起上传"实际不成立）
    if (key && key.includes('study_time_v1')) {
      timerDirty = true
      pushGen++
      return
    }
    dirty = true
    pushGen++
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (!dirty)
        return
      // 整库序列化 + 上传放在浏览器空闲时做（最多等 15 秒），
      // 不跟点词、播音频、切词抢主线程
      const ric = (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
      }).requestIdleCallback
      if (ric) {
        ric(() => {
          if (dirty)
            pushNow()
        }, { timeout: 15000 })
      }
      else {
        pushNow()
      }
    }, 8000)
  }

  // 只接一次：本地写入 -> 8 秒后推送；页面隐藏/关闭 -> 立刻推送；
  // 回到可见时，若本会话内无未推数据（无 dirty、无 pending），拉取一次云端，
  // 解决"已登录设备永不拉取、旧快照覆盖新数据"的问题
  function ensureWired() {
    if (wired || !syncEnabled)
      return
    wired = true
    onLocalWrite(key => schedulePush(key))
    onLocalRemove(key => schedulePush(key))
    const flush = () => {
      // 关标签时序：本监听注册早于自测页的计时 pause 监听（TheHeader 在 RouterView 之前挂载）。
      // 若直接调 pushNow，collectSyncData 采样时本段计时还没结算。defer 到 microtask，
      // 让同一事件里后注册的同步写入（pause 的 writeJson）先落盘再采样；条件也在 microtask 内重判，
      // 否则关闭前 dirty 已清时根本不会排队。pushNow 自身的 401 门禁/pushing 守卫不变，
      // 多次 flush 仍由 pushing 守卫去重；卸载时 fetch 本就是 best-effort，可靠性等级不变。
      queueMicrotask(() => {
        if ((dirty || timerDirty) && currentUser.value && getToken())
          pushNow()
      })
    }
    const maybePull = () => {
      if (currentUser.value && getToken() && !dirty && !timerDirty && !pushing && !getPendingPush())
        void pullNow()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden')
        flush()
      else if (document.visibilityState === 'visible')
        maybePull()
    })
    // 注册/登录/退出时直接 apiPush 失败留下的补推标记：登录成功时清标记并补推一次。
    // 未登录、token 缺失或 401 门禁时不动标记，等下次登录成功（401 清除后）再补推。
    const pickupPendingPush = () => {
      if (currentUser.value && getToken() && !authFailed.value && getAuthPendingPush()) {
        setAuthPendingPush(false)
        schedulePush()
      }
    }
    watch(currentUser, (u) => {
      if (u)
        pickupPendingPush()
    })
    pickupPendingPush()
  }

  const statusText = computed(() => {
    switch (status.value) {
      case 'syncing': return '同步中…'
      case 'ok': {
        if (!lastSyncAt.value)
          return '已连接'
        const d = new Date(lastSyncAt.value)
        const hh = `${d.getHours()}`.padStart(2, '0')
        const mm = `${d.getMinutes()}`.padStart(2, '0')
        return `已同步 ${hh}:${mm}`
      }
      case 'error': return '同步失败'
      default: return '未同步'
    }
  })

  return { syncEnabled, status, statusText, errorMsg, lastSyncAt, needsRelogin, pushNow, pullNow, schedulePush, ensureWired, clearAuthError }
})

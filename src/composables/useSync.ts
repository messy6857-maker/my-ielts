import { studyBaseOf } from '../utils/storage'
import {
  SYNC_PENDING_KEY,
  apiPull,
  apiPush,
  applySyncData,
  collectSyncData,
  getAuthPendingPush,
  getQuarantinedKeys,
  getToken,
  handleRejectedKeys,
  rejectedKeysOf,
  setAuthPendingPush,
  syncEnabled,
  unquarantineKeys,
} from './syncClient'
import {
  accountNotice,
  finishGuestMigration,
  hasPendingGuestMigration,
  onLocalWrite,
  useAuth,
} from './useAuth'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'
export const useSync = createGlobalState(() => {
  const { currentUser } = useAuth()
  const status = ref<SyncStatus>('idle')
  const lastSyncAt = ref(0)
  const errorMsg = ref('')
  const rejectedNotice = ref('')
  const authFailed = ref(false)
  const backendOutdated = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let wired = false
  // 上一次已用 accountNotice 横幅展示过的同步失败原因：同一原因重复失败时
  // 不再刷屏；原因变化或成功同步后再次失败时才重新展示一次。
  let lastNotifiedSyncError = ''
  let generation = 0
  let requestSequence = 0
  let inFlight: Promise<boolean> | null = null
  const pendingKey = (owner: string) => `${SYNC_PENDING_KEY}:${owner}`
  const pending = (owner: string) =>
    localStorage.getItem(pendingKey(owner)) === '1'
  const needsRelogin = computed(
    () =>
      !!currentUser.value && (authFailed.value || !getToken(currentUser.value)),
  )
  function clearAuthError() {
    authFailed.value = false
    backendOutdated.value = false
  }
  function dismissRejectedNotice() {
    rejectedNotice.value = ''
  }
  function failure(result: { status: number; message?: string }) {
    authFailed.value = result.status === 401
    backendOutdated.value = result.status === 426
    status.value = 'error'
    const msg = result.message || '同步失败，学习记录已保存在本机'
    errorMsg.value = msg
    // 同步失败原因只在顶栏按钮 title 里时触屏看不到：状态变化（新原因）
    // 时用 accountNotice 横幅展示一次，可关闭；同一原因重复失败不刷屏。
    if (msg !== lastNotifiedSyncError) {
      lastNotifiedSyncError = msg
      accountNotice.value = msg
    }
  }
  async function pushNow(force = false): Promise<boolean> {
    const owner = currentUser.value
    if (!syncEnabled || !owner || !getToken(owner))
      return false
    if (hasPendingGuestMigration(owner) && !(await pullNow()))
      return false
    if (inFlight) {
      await inFlight
      return pending(owner) ? pushNow(force) : true
    }
    if (!force && (authFailed.value || backendOutdated.value))
      return false
    const token = getToken(owner)
    const atStart = generation
    status.value = 'syncing'
    errorMsg.value = ''
    const job = (async () => {
      const payload = collectSyncData(owner)
      const result = await apiPush(payload, owner)
      if (currentUser.value !== owner || getToken(owner) !== token)
        return false
      if (!result.ok) {
        localStorage.setItem(pendingKey(owner), '1')
        failure(result)
        return false
      }
      // Server-skipped entries are quarantined locally (never re-uploaded
      // while unchanged) and surfaced in Settings; the rest of the payload
      // already synced. Keys sent in this push and not rejected are no
      // longer poison (re-probe/legacy entries): drop them from quarantine.
      if (handleRejectedKeys(owner, result)) {
        rejectedNotice.value
          = `${rejectedKeysOf(result.rejected).length} 条学习记录因格式异常未同步，已隔离不再上传，详情见设置页`
      }
      else if (!getQuarantinedKeys(owner).length) {
        // A clean push clears the notice only once nothing is quarantined
        // anymore; otherwise the next auto-push would erase a prompt the
        // user may not have seen yet.
        rejectedNotice.value = ''
      }
      const rejectedKeys = new Set(rejectedKeysOf(result.rejected))
      unquarantineKeys(
        owner,
        Object.keys(payload).filter(k => !rejectedKeys.has(k)),
      )
      if (result.data)
        applySyncData(result.data, owner)
      if (atStart === generation)
        localStorage.removeItem(pendingKey(owner))
      // 成功同步后清掉“已通知”标记，下一次失败（即使原因相同）是新一轮失败，应再提示一次。
      lastNotifiedSyncError = ''
      lastSyncAt.value = Date.now()
      status.value = 'ok'
      clearAuthError()
      return true
    })()
    inFlight = job
    try {
      return await job
    }
    finally {
      if (inFlight === job)
        inFlight = null
      if (
        currentUser.value === owner
        && generation !== atStart
        && !timer
        && !authFailed.value
        && !backendOutdated.value
      )
        schedulePush()
    }
  }
  async function pullNow(): Promise<boolean> {
    const owner = currentUser.value
    if (!syncEnabled || !owner || !getToken(owner))
      return false
    const token = getToken(owner)
    const sequence = ++requestSequence
    const result = await apiPull(owner)
    if (
      sequence !== requestSequence
      || currentUser.value !== owner
      || getToken(owner) !== token
    )
      return false
    if (!result.ok) {
      failure(result)
      return false
    }
    // Entries are versioned; writes made while this request was in flight win.
    if (result.data)
      applySyncData(result.data, owner)
    finishGuestMigration(owner)
    return true
  }
  function schedulePush(key?: string) {
    const owner = currentUser.value
    if (
      !syncEnabled
      || !owner
      || !getToken(owner)
      || (key && !studyBaseOf(key, owner))
    )
      return
    generation++
    localStorage.setItem(pendingKey(owner), '1')
    if (authFailed.value || backendOutdated.value || timer)
      return
    // A fixed upper bound avoids an active learner postponing upload forever.
    timer = setTimeout(() => {
      timer = undefined
      void pushNow()
    }, 8000)
  }
  function ensureWired() {
    if (wired || !syncEnabled)
      return
    wired = true
    onLocalWrite(schedulePush)
    const flush = () =>
      queueMicrotask(() => {
        const owner = currentUser.value
        if (owner && pending(owner))
          void pushNow()
      })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden')
        flush()
      else if (document.visibilityState === 'visible')
        void pullNow()
    })
    window.addEventListener('online', async () => {
      if (currentUser.value) {
        clearAuthError()
        if (await pullNow())
          await pushNow(true)
      }
    })
    watch(currentUser, (owner) => {
      if (timer)
        clearTimeout(timer)
      timer = undefined
      requestSequence++
      generation++
      clearAuthError()
      status.value = 'idle'
      if (owner && getToken(owner)) {
        void pullNow()
        if (pending(owner) || getAuthPendingPush()) {
          setAuthPendingPush(false)
          schedulePush()
        }
      }
    })
    if (currentUser.value && getToken(currentUser.value)) {
      void pullNow()
      if (pending(currentUser.value) || getAuthPendingPush()) {
        setAuthPendingPush(false)
        schedulePush()
      }
    }
  }
  const statusText = computed(() =>
    status.value === 'syncing'
      ? '同步中…'
      : status.value === 'error'
        ? '同步失败'
        : lastSyncAt.value
          ? `已同步 ${new Date(lastSyncAt.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : '未同步',
  )
  return {
    syncEnabled,
    status,
    statusText,
    errorMsg,
    rejectedNotice,
    dismissRejectedNotice,
    lastSyncAt,
    needsRelogin,
    pushNow,
    pullNow,
    schedulePush,
    ensureWired,
    clearAuthError,
  }
})

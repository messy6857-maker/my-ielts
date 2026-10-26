// 云同步状态 + 自动推送（防抖）+ 手动同步
import { apiPush, collectSyncData, getToken, syncEnabled } from './syncClient'
import { onLocalWrite, useAuth } from './useAuth'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export const useSync = createGlobalState(() => {
  const { currentUser, sessionRevision } = useAuth()
  const status = ref<SyncStatus>('idle')
  const lastSyncAt = ref<number>(0)
  const errorMsg = ref('')
  let revision = 0
  let uploadedRevision = 0
  let generation = 0
  let inFlight: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null
  let wired = false

  function clearScheduledPush() {
    if (timer) clearTimeout(timer)
    if (maxWaitTimer) clearTimeout(maxWaitTimer)
    timer = null
    maxWaitTimer = null
  }

  function setStatus(s: SyncStatus, msg = '') {
    status.value = s
    errorMsg.value = msg
  }

  // 已登录但没有服务器 token（老本地会话）：需要退出重登
  const needsRelogin = computed(() => {
    void sessionRevision.value
    return syncEnabled && !!currentUser.value && !getToken(currentUser.value)
  })

  function pushNow(): Promise<boolean> {
    if (!syncEnabled || !currentUser.value)
      return Promise.resolve(false)
    const user = currentUser.value
    const token = getToken(user)
    if (!token) {
      setStatus('error', '请先退出登录，再重新登录以启用云同步')
      return Promise.resolve(false)
    }
    const credential = token
    clearScheduledPush()
    if (inFlight)
      return inFlight
    const ownGeneration = generation
    const isCurrent = () => generation === ownGeneration && currentUser.value === user && getToken(user) === credential
    async function upload(): Promise<boolean> {
      setStatus('syncing')
      try {
        do {
          const data = collectSyncData(user)
          const snapshotRevision = revision
          const result = await apiPush(data, credential)
          if (!isCurrent())
            return false
          if (!result.ok) {
            setStatus('error', result.message || '推送失败')
            return false
          }
          uploadedRevision = snapshotRevision
          lastSyncAt.value = Date.now()
        } while (revision !== uploadedRevision)
        clearScheduledPush()
        setStatus('ok')
        return true
      }
      catch {
        if (isCurrent())
          setStatus('error', '无法连接同步服务器')
        return false
      }
    }
    const pending = upload().finally(() => {
      if (inFlight === pending)
        inFlight = null
    })
    inFlight = pending
    return pending
  }

  function schedulePush() {
    if (!syncEnabled || !currentUser.value || !getToken(currentUser.value))
      return
    revision++
    if (timer)
      clearTimeout(timer)
    const flush = () => {
      clearScheduledPush()
      if (revision !== uploadedRevision)
        void pushNow()
    }
    timer = setTimeout(flush, 8000)
    maxWaitTimer ??= setTimeout(flush, 30000)
  }

  // 只接一次：本地写入 -> 8 秒后推送；页面隐藏/关闭 -> 立刻推送
  function ensureWired() {
    if (wired || !syncEnabled)
      return
    wired = true
    onLocalWrite(() => schedulePush())
    const flush = () => {
      if (revision !== uploadedRevision && currentUser.value && getToken(currentUser.value))
        pushNow()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden')
        flush()
    })
  }

  watch([currentUser, sessionRevision], () => {
    generation++
    clearScheduledPush()
    inFlight = null
    revision = 0
    uploadedRevision = 0
    lastSyncAt.value = 0
    setStatus('idle')
  }, { flush: 'sync' })

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

  return { syncEnabled, status, statusText, errorMsg, lastSyncAt, needsRelogin, pushNow, schedulePush, ensureWired }
})

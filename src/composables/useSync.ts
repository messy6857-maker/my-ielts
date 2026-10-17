// 云同步状态 + 自动推送（防抖）+ 手动同步
import { apiPush, collectSyncData, getToken, syncEnabled } from './syncClient'
import { onLocalWrite, useAuth } from './useAuth'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export const useSync = createGlobalState(() => {
  const { currentUser } = useAuth()
  const status = ref<SyncStatus>('idle')
  const lastSyncAt = ref<number>(0)
  const errorMsg = ref('')
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let wired = false

  function setStatus(s: SyncStatus, msg = '') {
    status.value = s
    errorMsg.value = msg
  }

  async function pushNow(): Promise<boolean> {
    if (!syncEnabled || !currentUser.value || !getToken())
      return false
    setStatus('syncing')
    try {
      const data = collectSyncData(currentUser.value)
      const r = await apiPush(data)
      if (r.ok) {
        dirty = false
        lastSyncAt.value = Date.now()
        setStatus('ok')
        return true
      }
      setStatus('error', r.message || '推送失败')
      return false
    }
    catch {
      setStatus('error', '无法连接同步服务器')
      return false
    }
  }

  function schedulePush() {
    if (!syncEnabled || !currentUser.value || !getToken())
      return
    dirty = true
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (dirty)
        pushNow()
    }, 8000)
  }

  // 只接一次：本地写入 -> 8 秒后推送；页面隐藏/关闭 -> 立刻推送
  function ensureWired() {
    if (wired || !syncEnabled)
      return
    wired = true
    onLocalWrite(() => schedulePush())
    const flush = () => {
      if (dirty && currentUser.value && getToken())
        pushNow()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden')
        flush()
    })
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

  return { syncEnabled, status, statusText, errorMsg, lastSyncAt, pushNow, schedulePush, ensureWired }
})

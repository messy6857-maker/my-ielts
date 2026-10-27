import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { accountKey, storageFailures, writerId } from '../utils/storage'
import { accountNotice, onBeforeLogout, useAuth } from './useAuth'

export interface ExamDraft {
  version: 1
  kind: 'reading' | 'listening'
  testId: string
  answers: Record<string, string>
  timeLeft: number
  extra?: any
  submitted?: boolean
  updatedAt: number
}
export function useExamRecovery(options: {
  kind: ExamDraft['kind']
  testId: Ref<string>
  started: Ref<boolean>
  submitted: Ref<boolean>
  answers: Ref<Record<string, string>>
  timeLeft: Ref<number>
  pause: () => void
  remaining: () => number
  extra?: () => unknown
  onUnblocked?: () => void
}) {
  // owner 跟随考试生命周期：未开考或已交卷时跟随当前身份，切号不阻断开始；
  // 开考后锁定为开考身份，只有此时切号才阻断。上一版在 setup 捕获一次，
  // 导致游客挂载后登录、登录挂载后登出都会永久 blocked。
  const owner = ref(useAuth().currentUser.value)
  let activeTestId = options.testId.value
  let pauseMessage = ''
  let wasBlocked = false
  const writer = writerId()
  const baseKey = (id = options.testId.value) =>
    accountKey(`mock_draft_v1_${options.kind}_${encodeURIComponent(id)}`, owner.value)
  const key = (id = options.testId.value) => `${baseKey(id)}__session_${writer}`
  const blocked = computed(() => options.started.value && !options.submitted.value && useAuth().currentUser.value !== owner.value)
  const error = ref('')
  const draft = ref<ExamDraft | null>(null)
  function refresh() {
    const prefix = baseKey()
    const candidates = Object.keys(localStorage)
      .filter(k => k === prefix || k.startsWith(`${prefix}__session_`))
      .flatMap((storedKey) => {
        try {
          const d = JSON.parse(
            localStorage.getItem(storedKey) ?? 'null',
          ) as ExamDraft | null
          return d?.version === 1
            && d.kind === options.kind
            && d.testId === options.testId.value
            && d.answers
            && typeof d.answers === 'object'
            && Object.values(d.answers).every(a => typeof a === 'string')
            && Number.isFinite(d.timeLeft)
            ? [{ storedKey, value: d }]
            : []
        }
        catch {
          return []
        }
      })
      .sort((a, b) => b.value.updatedAt - a.value.updatedAt)
    draft.value
      = (candidates.find(c => c.storedKey === key()) ?? candidates[0])?.value
      ?? null
  }
  function save() {
    if (!options.started.value || options.submitted.value)
      return true
    const value: ExamDraft = {
      version: 1,
      kind: options.kind,
      testId: activeTestId,
      answers: { ...options.answers.value },
      timeLeft: Math.max(0, options.remaining()),
      extra: options.extra?.(),
      updatedAt: Date.now(),
    }
    try {
      localStorage.setItem(key(activeTestId), JSON.stringify(value))
      draft.value = value
      storageFailures.value = storageFailures.value.filter(
        k => k !== key(activeTestId),
      )
      return true
    }
    catch {
      error.value
        = '作答草稿保存失败，请先复制答案或导出可用备份，不要关闭页面。'
      if (!storageFailures.value.includes(key(activeTestId)))
        storageFailures.value = [...storageFailures.value, key(activeTestId)]
      return false
    }
  }
  function clear() {
    // 清当前展示套题的本会话草稿：弃稿发生在开始屏，此时 activeTestId
    // 还是上次开考的套题，用它会清错键；交卷时两者一致，不受影响。
    localStorage.removeItem(key())
    draft.value = null
  }
  // 交卷时把草稿标记为已交卷（无论记录保存是否成功）：开始屏不再 offer
  // “继续”，避免对已交卷内容重复续做；记录保存失败时草稿仍保留答案。
  function markSubmitted() {
    const storedKey = key()
    try {
      const raw = localStorage.getItem(storedKey)
      const d = raw ? (JSON.parse(raw) as ExamDraft | null) : null
      if (d && d.version === 1) {
        const value = { ...d, submitted: true, updatedAt: Date.now() }
        localStorage.setItem(storedKey, JSON.stringify(value))
        draft.value = value
      }
    }
    catch {
      // 标记失败不阻塞交卷流程
    }
  }
  function dismissNotice() {
    error.value = ''
    if (accountNotice.value === pauseMessage)
      accountNotice.value = ''
  }
  function mismatch() {
    if (!blocked.value)
      return false
    const saved = save()
    const message = `账号已变化，本次模考已暂停。${saved ? `答案已保存在原身份的本机草稿中；${owner.value ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从剩余时间继续作答。` : '作答草稿保存失败，请先复制答案，不要关闭页面。'}`
    pauseMessage = message
    error.value = message
    accountNotice.value = message
    options.pause()
    wasBlocked = true
    return true
  }
  const stopOwner = watch(
    useAuth().currentUser,
    () => {
      if (!options.started.value || options.submitted.value) {
        // 未开考或已交卷：owner 跟随当前身份，切号不阻断开始/重开，
        // 也不再误报“已暂停”。
        owner.value = useAuth().currentUser.value
        return
      }
      if (mismatch())
        return
      // 回到原身份、阻断解除：恢复计时。暂停时 timer 已清，只清提示会让
      // 考试以冻结时钟继续作答、自动交卷永不触发，所以必须重建计时。
      if (wasBlocked) {
        wasBlocked = false
        options.onUnblocked?.()
      }
      // 回到原身份、阻断解除：清掉暂停提示（保存失败的提示不是暂停消息，保留）。
      if (error.value === pauseMessage)
        error.value = ''
      if (accountNotice.value === pauseMessage)
        accountNotice.value = ''
    },
    { flush: 'sync' },
  )
  const stopAnswers = watch(options.answers, save, {
    deep: true,
    flush: 'sync',
  })
  const stopTest = watch(options.testId, refresh)
  const offLogout = onBeforeLogout(() => {
    save()
    options.pause()
  })
  window.addEventListener('pagehide', save)
  const visibility = () => {
    if (document.visibilityState === 'hidden')
      save()
  }
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    save()
    options.pause()
    stopOwner()
    stopAnswers()
    stopTest()
    offLogout()
    window.removeEventListener('pagehide', save)
    document.removeEventListener('visibilitychange', visibility)
  })
  refresh()
  return {
    begin() {
      owner.value = useAuth().currentUser.value
      activeTestId = options.testId.value
      wasBlocked = false
      error.value = ''
      if (accountNotice.value === pauseMessage)
        accountNotice.value = ''
    },
    owner,
    activeTestId: () => activeTestId,
    blocked,
    error,
    draft,
    refresh,
    save,
    clear,
    markSubmitted,
    dismissNotice,
    mismatch,
  }
}

import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { accountKey, storageFailures, writerId } from '../utils/storage'
import type { MockRecord } from './useMockHistory'
import { saveMockRecord } from './useMockHistory'
import { dismissAccountNotice, onBeforeLogout, pushAccountNotice, useAuth } from './useAuth'

export interface ExamDraft {
  attemptId?: string
  versionId?: string
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
  const pauseNoticeId = `exam-pause:${crypto.randomUUID()}`
  let attemptId = ''
  let sourceKey: string | undefined
  let sourceRaw: string | null = null
  let wasBlocked = false
  const writer = writerId()
  const baseKey = (id = options.testId.value) =>
    accountKey(
      `mock_draft_v1_${options.kind}_${encodeURIComponent(id)}`,
      owner.value,
    )
  const key = (id = options.testId.value) =>
    `${baseKey(id)}__session_${writer}`
  const blocked = computed(
    () =>
      options.started.value
      && !options.submitted.value
      && useAuth().currentUser.value !== owner.value,
  )
  const error = ref('')
  const draft = ref<ExamDraft | null>(null)
  // Session snapshots belong to independent attempts. Clearing/submitting this tab
  // must never retire another tab's answers, even for the same paper.
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
            ? [
                {
                  storedKey,
                  value: {
                    ...d,
                    versionId: storedKey,
                    attemptId: d.attemptId || `legacy:${storedKey}:${d.updatedAt}`,
                    updatedAt:
                      Number.isFinite(d.updatedAt)
                      && d.updatedAt > 0
                      && !Number.isNaN(new Date(d.updatedAt).getTime())
                        ? d.updatedAt
                        : 0,
                  },
                },
              ]
            : []
        }
        catch {
          return []
        }
      })
      .filter(c => !localStorage.getItem(`${prefix}__completed_${encodeURIComponent(c.value.attemptId)}`))
      .sort((a, b) => b.value.updatedAt - a.value.updatedAt)
    draft.value
      = (candidates.find(c => c.storedKey === key()) ?? candidates[0])?.value
      ?? null
  }
  function writeDraft() {
    if (attemptId && localStorage.getItem(`${baseKey(activeTestId)}__completed_${encodeURIComponent(attemptId)}`))
      return true
    const value: ExamDraft = {
      attemptId,
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
      // 本次保存已越过保存时刻的墓碑：之后被动保存不再被它判定为过期。

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
  function save() {
    if (!options.started.value || options.submitted.value)
      return true
    return writeDraft()
  }
  function saveFlush() {
    return save()
  }
  function clear() {
    if (!options.started.value && draft.value?.versionId) {
      sourceKey = draft.value.versionId
      sourceRaw = localStorage.getItem(sourceKey)
    }
    try {
      localStorage.removeItem(key())
      if (sourceKey && localStorage.getItem(sourceKey) === sourceRaw)
        localStorage.removeItem(sourceKey)
    }
    catch {
      return false
    }
    draft.value = null
    return true
  }
  function markSubmitted() {
    // Called only after the history record has been committed successfully.
    const current = draft.value
    if (current) {
      try {
        localStorage.setItem(`${baseKey()}__completed_${encodeURIComponent(attemptId)}`, JSON.stringify({ completedAt: Date.now() }))
        localStorage.setItem(
          key(),
          JSON.stringify({ ...current, submitted: true }),
        )
      }
      catch {
        /* History is already durable; a retained snapshot is recoverable. */
      }
    }
  }
  function submitResult(record: Omit<MockRecord, 'date'>) {
    if (mismatch() || options.submitted.value || !saveFlush())
      return null
    options.pause()
    options.submitted.value = true
    let saved = false
    try {
      saved = saveMockRecord(record)
    }
    catch {
      saved = false
    }
    if (saved) {
      markSubmitted()
      clear()
    }
    else {
      error.value
        = '交卷记录保存失败，最新答案仍保存在草稿中；请重试保存成绩。'
    }
    return { saved }
  }
  function dismissNotice() {
    error.value = ''
    dismissAccountNotice(pauseNoticeId)
  }
  function mismatch() {
    if (!blocked.value)
      return false
    const saved = saveFlush()
    const message = `账号已变化，本次模考已暂停。${saved ? `答案已保存在原身份的本机草稿中；${owner.value ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从剩余时间继续作答。` : '作答草稿保存失败，请先复制答案，不要关闭页面。'}`
    pauseMessage = message
    error.value = message
    pushAccountNotice(message, pauseNoticeId, 2)
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
        refresh()
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
      dismissAccountNotice(pauseNoticeId)
    },
    { flush: 'sync' },
  )
  // M-Opt-#3：答案写入 300ms 防抖——填空连续输入不再每次按键全量序列化
  // 写 localStorage。显式保存（startTest 的 save()）仍立即写；unmount /
  // pagehide / visibilitychange 走 saveFlush() 立即写，不受防抖影响。
  let answersTimer: ReturnType<typeof setTimeout> | null = null
  const stopAnswers = watch(
    [options.answers, () => options.extra?.()],
    () => {
      if (answersTimer)
        clearTimeout(answersTimer)
      answersTimer = setTimeout(() => {
        answersTimer = null
        save()
      }, 300)
    },
    {
      deep: true,
    },
  )
  const stopTest = watch(options.testId, refresh)
  const offLogout = onBeforeLogout(() => {
    const saved = saveFlush()
    if (saved)
      options.pause()
    return saved
  })
  window.addEventListener('pagehide', saveFlush)
  const visibility = () => {
    if (document.visibilityState === 'hidden')
      saveFlush()
  }
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    saveFlush()
    // saveFlush 已立即写了最新答案，挂起的防抖定时器不再需要：清掉它，
    // 避免卸载后多余的一次重复写入。
    if (answersTimer) {
      clearTimeout(answersTimer)
      answersTimer = null
    }
    options.pause()
    stopOwner()
    stopAnswers()
    stopTest()
    offLogout()
    window.removeEventListener('pagehide', saveFlush)
    document.removeEventListener('visibilitychange', visibility)
  })
  refresh()
  return {
    begin(saved?: ExamDraft | null) {
      attemptId = saved?.attemptId || crypto.randomUUID()
      sourceKey = saved?.versionId
      sourceRaw = sourceKey ? localStorage.getItem(sourceKey) : null
      owner.value = useAuth().currentUser.value
      activeTestId = options.testId.value
      wasBlocked = false
      error.value = ''
      dismissAccountNotice(pauseNoticeId)
    },
    owner,
    activeTestId: () => activeTestId,
    blocked,
    error,
    draft,
    refresh,
    save,
    saveFlush,
    clear,
    markSubmitted,
    submitResult,
    dismissNotice,
    mismatch,
  }
}

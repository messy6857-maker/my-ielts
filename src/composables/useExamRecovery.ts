import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  examAttemptId,
  examSessionId,
  newestAttemptDrafts,
} from '../utils/examDrafts'
import { accountKey, readRecords, storageFailures } from '../utils/storage'
import type { MockRecord } from './useMockHistory'
import { saveMockRecord } from './useMockHistory'
import {
  dismissAccountNotice,
  onBeforeLogout,
  pushAccountNotice,
  useAuth,
} from './useAuth'

export interface ExamDraft {
  editedAt?: number
  revision?: number
  activeElsewhere?: boolean
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
  const writer = examSessionId()
  let previousSnapshot: ExamDraft | null = null
  const retired = ref(false)
  let recoveryId = ''
  let recoverySaved = false
  const leaseKey = `myielts_local_exam_session:${writer}`
  function heartbeat() {
    try {
      localStorage.setItem(leaseKey, String(Date.now()))
    }
    catch {}
  }
  heartbeat()
  const leaseTimer = setInterval(heartbeat, 10000)
  function activeSibling(storedKey: string) {
    const session = storedKey
      .split('__session_')[1]
      ?.split('__attempt_')[0]
      ?.split('__recovery_')[0]
    const at = Number(
      localStorage.getItem(`myielts_local_exam_session:${session}`) || 0,
    )
    return (
      !!session
      && session !== writer
      && at > 0
      && Math.abs(Date.now() - at) < 30000
    )
  }
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
  const availableDrafts = ref<ExamDraft[]>([])
  // 退役横幅与通用 error 分离：退役文案只读 retiredMessage，“知道了”清 error
  // 时不再抹空横幅；离开后的保留确认走 retainedNotice，在开始屏单独展示。
  const retiredMessage = ref('')
  const retainedNotice = ref('')
  const submittedDrafts = ref<ExamDraft[]>([])
  let selectedVersion: string | null = null
  // Session snapshots belong to independent attempts. Clearing/submitting this tab
  // must never retire another tab's answers, even for the same paper.
  function refresh() {
    const completed = new Set(
      Object.values(readRecords<MockRecord>('mock_history_v1', owner.value))
        .map(record => record.attemptId)
        .filter(Boolean),
    )
    const prefix = baseKey()
    const parsed = Object.keys(localStorage)
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
                    activeElsewhere: activeSibling(storedKey),
                    editedAt:
                      Number.isFinite(d.editedAt) && d.editedAt! >= 0
                        ? d.editedAt
                        : Number.isFinite(d.updatedAt)
                          ? d.updatedAt
                          : 0,
                    revision:
                      Number.isSafeInteger(d.revision) && d.revision! >= 0
                        ? d.revision
                        : 0,
                    attemptId: examAttemptId(d, storedKey),
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
    // 已交卷快照不进入可选列表，但开始屏仍须可见提示（死代码清理）。
    submittedDrafts.value = parsed
      .filter(c => c.value.submitted)
      .map(c => c.value)
    const candidates = parsed
      .filter(
        c =>
          !c.value.submitted
          && !completed.has(c.value.attemptId)
          && !localStorage.getItem(
            `${prefix}__completed_${encodeURIComponent(c.value.attemptId)}`,
          ),
      )
      .sort((a, b) => b.value.updatedAt - a.value.updatedAt)
    const selectedAttempt = candidates.find(
      c => c.storedKey === selectedVersion,
    )?.value.attemptId
    availableDrafts.value = newestAttemptDrafts(candidates.map(c => c.value))
    // Foreign snapshots require an explicit choice even after a lease expires.
    draft.value
      = availableDrafts.value.find(d =>
        selectedAttempt
          ? d.attemptId === selectedAttempt
          : d.versionId === key(),
      ) ?? null
  }
  function writeDraft() {
    const completedKey = `${baseKey(activeTestId)}__completed_${encodeURIComponent(attemptId)}`
    const isRetired = !!attemptId && !!localStorage.getItem(completedKey)
    if (isRetired) {
      recoverySaved = false
      retired.value = true
      options.pause()
    }
    const changedAnswers
      = !previousSnapshot
      || JSON.stringify(previousSnapshot.answers)
        !== JSON.stringify(options.answers.value)
    const editedAt = changedAnswers
      ? Math.max(
        Date.now(),
        (previousSnapshot?.editedAt ?? previousSnapshot?.updatedAt ?? 0) + 1,
      )
      : (previousSnapshot!.editedAt ?? previousSnapshot!.updatedAt)
    const value: ExamDraft = {
      attemptId,
      editedAt,
      revision: (previousSnapshot?.revision || 0) + 1,
      version: 1,
      kind: options.kind,
      testId: activeTestId,
      answers: { ...options.answers.value },
      timeLeft: Math.max(0, options.remaining()),
      extra: options.extra?.(),
      updatedAt: Date.now(),
    }
    try {
      if (isRetired) {
        recoveryId ||= crypto.randomUUID()
        localStorage.setItem(
          `${baseKey(activeTestId)}__session_${writer}__recovery_${recoveryId}`,
          JSON.stringify({
            ...value,
            attemptId: recoveryId,
            retiredFrom: attemptId,
          }),
        )
        previousSnapshot = value
        recoverySaved = true
        retired.value = true
        options.pause()
        retiredMessage.value
          = '本次作答已在另一页签提交或放弃，计时已暂停。当前答案已另存为恢复副本；请选择继续为独立作答或保留副本后离开。'
        return false
      }
      localStorage.setItem(key(activeTestId), JSON.stringify(value))
      previousSnapshot = value
      draft.value = value
      storageFailures.value = storageFailures.value.filter(
        k => k !== key(activeTestId),
      )
      return true
    }
    catch {
      error.value
        = '作答草稿保存失败，请先复制答案或导出可用备份，不要关闭页面。'
      if (isRetired) {
        retiredMessage.value
          = '本次作答已在另一页签提交或放弃，计时已暂停；恢复副本保存失败，请先复制答案，不要关闭页面。'
      }
      if (!storageFailures.value.includes(key(activeTestId)))
        storageFailures.value = [...storageFailures.value, key(activeTestId)]
      return false
    }
  }
  function leaveRetired() {
    writeDraft()
    if (!recoverySaved)
      return
    options.started.value = false
    retired.value = false
    retiredMessage.value = ''
    retainedNotice.value = '恢复副本已保留，可从草稿列表选择恢复。'
    selectedVersion = null
    owner.value = useAuth().currentUser.value
    wasBlocked = false
    dismissAccountNotice(pauseNoticeId)
    refresh()
  }
  function continueRecovered() {
    if (
      !retired.value
      || !recoveryId
      || useAuth().currentUser.value !== owner.value
    )
      return
    const old = attemptId
    attemptId = recoveryId
    if (writeDraft()) {
      try {
        localStorage.removeItem(
          `${baseKey(activeTestId)}__session_${writer}__recovery_${recoveryId}`,
        )
      }
      catch {
        /* The current attempt is durable; a duplicate recovery copy is safe. */
      }
      recoveryId = ''
      retired.value = false
      retiredMessage.value = ''
      error.value = ''
      options.onUnblocked?.()
    }
    else {
      attemptId = old
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
      const retiring = options.started.value
        ? attemptId
        : draft.value?.attemptId
      if (
        retiring
        && !localStorage.getItem(
          `${baseKey()}__completed_${encodeURIComponent(retiring)}`,
        )
      ) {
        localStorage.setItem(
          `${baseKey()}__completed_${encodeURIComponent(retiring)}`,
          JSON.stringify({ completedAt: Date.now() }),
        )
      }
      if (options.started.value || sourceKey === key()) {
        // 已交卷快照必须保留：开始屏靠它显示“已有交卷记录”。
        // submitResult 先由 markSubmitted 写 submitted 快照、随后调 clear()，
        // 若这里无条件删 key()，快照会被立即删掉，开始屏永远看不到。
        let keepSubmitted = false
        try {
          keepSubmitted
            = JSON.parse(localStorage.getItem(key()) ?? 'null')?.submitted === true
        }
        catch {}
        if (!keepSubmitted)
          localStorage.removeItem(key())
      }
      if (sourceKey && localStorage.getItem(sourceKey) === sourceRaw)
        localStorage.removeItem(sourceKey)
    }
    catch {
      error.value = '草稿处理失败，原答案仍保留。请释放空间后重试。'
      return false
    }
    selectedVersion = null
    draft.value = null
    return true
  }
  function markSubmitted() {
    // Called only after the history record has been committed successfully.
    const current = draft.value
    if (current) {
      try {
        localStorage.setItem(
          `${baseKey()}__completed_${encodeURIComponent(attemptId)}`,
          JSON.stringify({ completedAt: Date.now() }),
        )
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
      saved = saveMockRecord({ ...record, attemptId })
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
  function dismissRetainedNotice() {
    retainedNotice.value = ''
  }
  function mismatch() {
    if (!blocked.value)
      return false
    const saved = saveFlush()
    // 退役路径返回 false 恰恰发生在恢复副本已成功落盘时，绝不能写成“保存失败”。
    const retiredSaved = retired.value && recoverySaved
    const message = retiredSaved
      ? `账号已变化，本次模考已暂停。当前答案已另存为恢复副本；${owner.value ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从草稿列表选择恢复。`
      : `账号已变化，本次模考已暂停。${saved ? `答案已保存在原身份的本机草稿中；${owner.value ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从剩余时间继续作答。` : '作答草稿保存失败，请先复制答案，不要关闭页面。'}`
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
        selectedVersion = null
        refresh()
        return
      }
      if (mismatch())
        return
      // 回到原身份、阻断解除：恢复计时。暂停时 timer 已清，只清提示会让
      // 考试以冻结时钟继续作答、自动交卷永不触发，所以必须重建计时。
      if (wasBlocked) {
        wasBlocked = false
        if (!retired.value)
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
  const stopTest = watch(options.testId, () => {
    selectedVersion = null
    refresh()
  })
  const offLogout = onBeforeLogout(() => {
    const saved = saveFlush()
    if (saved)
      options.pause()
    return saved
  })
  const onRetirement = (event: StorageEvent) => {
    if (
      event.key
        === `${baseKey(activeTestId)}__completed_${encodeURIComponent(attemptId)}`
      && options.started.value
      && !options.submitted.value
    )
      saveFlush()
  }
  window.addEventListener('storage', onRetirement)
  window.addEventListener('pagehide', saveFlush)
  const visibility = () => {
    if (document.visibilityState === 'hidden')
      saveFlush()
  }
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    clearInterval(leaseTimer)
    try {
      localStorage.removeItem(leaseKey)
    }
    catch {}
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
    window.removeEventListener('storage', onRetirement)
    window.removeEventListener('pagehide', saveFlush)
    document.removeEventListener('visibilitychange', visibility)
  })
  refresh()
  return {
    begin(saved?: ExamDraft | null) {
      owner.value = useAuth().currentUser.value
      activeTestId = options.testId.value
      const ownKey = key(activeTestId)
      const oldRaw = localStorage.getItem(ownKey)
      if (oldRaw && saved?.versionId !== ownKey) {
        let old: ExamDraft | null = null
        try {
          old = JSON.parse(oldRaw)
        }
        catch {}
        if (!old?.submitted) {
          try {
            const id = old ? examAttemptId(old, ownKey) : crypto.randomUUID()
            localStorage.setItem(
              `${ownKey}__attempt_${encodeURIComponent(id)}`,
              old ? JSON.stringify({ ...old, attemptId: id }) : oldRaw,
            )
          }
          catch {
            error.value
              = '原作答备份失败，未开始新作答。请先导出备份或释放空间。'
            return false
          }
        }
      }
      attemptId = saved?.attemptId || crypto.randomUUID()
      previousSnapshot = saved || null
      retired.value = false
      retiredMessage.value = ''
      retainedNotice.value = ''
      recoveryId = ''
      sourceKey = saved?.versionId
      sourceRaw = sourceKey ? localStorage.getItem(sourceKey) : null
      owner.value = useAuth().currentUser.value
      activeTestId = options.testId.value
      wasBlocked = false
      error.value = ''
      dismissAccountNotice(pauseNoticeId)
      return true
    },
    owner,
    retired,
    retiredMessage,
    retainedNotice,
    submittedDrafts,
    dismissRetainedNotice,
    leaveRetired,
    continueRecovered,
    availableDrafts,
    selectDraft(versionId: string) {
      selectedVersion = versionId
      refresh()
    },
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

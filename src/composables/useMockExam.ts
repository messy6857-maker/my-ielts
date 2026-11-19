import type { MockTestPair } from '../pages/mock/registry'
import type { MockQuestion } from '../pages/mock/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { loadMockTest, mockTestList } from '../pages/mock/registry'
import {
  countCorrect,
  mockQuestionStatus,
  restoreTimeLeft,
  toggleMultiSelectValue,
  totalScorePoints,
} from '../pages/mock/types'
import { collectMockMistakeEntries } from '../utils/mockMistakes'
import { useAuth } from './useAuth'
import { alertDialog, chooseDialog, confirmDialog } from './useDialog'
import { useExamClock } from './useExamClock'
import { useExamRecovery } from './useExamRecovery'
import { useMockMistakeSave } from './useMockMistakeSave'
import { useStudyTimer } from './useStudyTimer'

// 听力、阅读限时模考共用的考试流程：选题加载、草稿恢复、开考、计时、作答、交卷、保存成绩和错题、
// 离开确认。两个页面只保留各自的界面和特有部分（听力的音频和原文、阅读的划词高亮和配对题输入）。
// 每一步的顺序和原来两个页面里完全一样，只是写在一处。

export interface MockExamOptions<T> {
  kind: 'listening' | 'reading'
  /** 这个页面的地址（切换套题时跳转用） */
  path: string
  /** 从一套题里取出这一科 */
  pick: (pair: MockTestPair) => T
  questions: (section: T) => MockQuestion[]
  timeLimit: (section: T) => number
  /** 错题按哪几部分记（听力 part1…，阅读 passage1…） */
  mistakeParts: (section: T) => Array<{ part: string, questions: MockQuestion[], audio?: string }>
  bandScore: (score: number, total: number) => number
  /** 跟草稿一起保存的页面状态（当前 Part / Passage、高亮…） */
  extra: () => unknown
  /** 按草稿里的页面状态还原；undefined 表示新开一套，回到默认 */
  restoreExtra: (extra: any) => void
  /** 计时停下时一起停的东西（听力：所有音频） */
  pauseMedia?: () => void
  /** 换套题前先清掉的界面状态（在暂停计时之前） */
  beforeLoad?: () => void
  /** 开始加载新套题时（听力：清原文状态、停音频） */
  onLoadStart?: () => void
  /** 新套题载入后清掉上一套的界面状态 */
  onLoaded?: () => void
  /** 交卷保存之后（听力：加载原文；阅读：关掉划词弹窗） */
  afterSubmit?: () => void | Promise<void>
}

export function useMockExam<T>(options: MockExamOptions<T>) {
  const router = useRouter()
  const route = useRoute()
  const studyTimer = useStudyTimer()

  const testId = computed(() => (route.query.test as string) || 'cam21-test1')
  const testPair = ref<MockTestPair | null>(null)
  const test = computed(() => testPair.value
    ? options.pick(testPair.value)
    : undefined)
  const loading = ref(true)
  const loadError = ref(false)
  const started = ref(false) // 点"开始测试"后才计时
  const timeLeft = ref(0)
  const answers = ref<Record<string, string>>({})
  const submitted = ref(false)
  let loadSeq = 0

  const examClock = useExamClock(
    timeLeft,
    () => {
      submit()
    },
    options.pauseMedia,
  )
  const pauseExam = examClock.pause
  const startTimer = examClock.start
  const recovery = useExamRecovery({
    kind: options.kind,
    testId,
    started,
    submitted,
    answers,
    timeLeft,
    pause: pauseExam,
    remaining: examClock.remaining,
    extra: options.extra,
    onUnblocked: startTimer,
  })

  const recordSaveFailed = ref(false)
  const mistakeSave = useMockMistakeSave()
  let resultsOwner: string | null = null
  function retrySaveResult() {
    if (useAuth().currentUser.value !== resultsOwner) {
      recovery.error.value = '请先回到本次作答的原身份，再重试保存成绩。'
      return
    }
    submitted.value = false
    submit()
  }

  // 异步加载选中的套题（按需加载，不一次全载入）
  // loadSeq 防止快速切换时旧的加载覆盖新的；try/finally 保证 loading 一定复位
  async function loadTest() {
    if (started.value && !submitted.value) {
      const active = recovery.activeTestId()
      // Returning from a rejected route change must not reload the active paper.
      if (testId.value === active)
        return
      if (recovery.blocked.value || !recovery.saveFlush()) {
        await router.replace({
          query: { ...route.query, test: active },
        })
        return
      }
    }
    studyTimer.pause()
    options.beforeLoad?.()
    pauseExam()
    started.value = false
    // 非法 test id（如手写 URL / 过期书签）不再静默 fallback：把 URL 参数规范化为默认套题，
    // 与实际加载内容一致，书签也被修复；replace 不产生多余历史记录，随后 watcher 以新 id 重载
    if (!mockTestList.some(t => t.id === testId.value)) {
      router.replace({
        query: { ...route.query, test: 'cam21-test1' },
      })
      return
    }
    const seq = ++loadSeq
    options.onLoadStart?.()
    loading.value = true
    loadError.value = false
    pauseExam()
    options.pauseMedia?.()
    try {
      const pair = await loadMockTest(testId.value)
      if (seq !== loadSeq)
        return // 已被更新的加载取代
      if (recovery.blocked.value) {
        // 加载途中被阻断：不应用新套题，把 URL 换回进行中的套题
        const active = recovery.activeTestId()
        if (active && testId.value !== active) {
          router.replace({
            query: { ...route.query, test: active },
          })
        }
        return
      }
      options.onLoaded?.()
      recordSaveFailed.value = false
      // 切题不丢待重试的错题写入：失败记录已落本机存储，横幅留到重试成功。
      testPair.value = pair
      answers.value = {}
      submitted.value = false
      options.restoreExtra(undefined)
      started.value = false
      recovery.refresh()
    }
    catch {
      if (seq !== loadSeq)
        return
      loadError.value = true
    }
    finally {
      if (seq === loadSeq)
        loading.value = false
    }
  }

  // 点"开始测试"才重置状态并开始计时
  type ExamDraft = NonNullable<typeof recovery.draft.value>
  // 0 秒草稿的二选一弹窗还在等待时，再点“开始测试”不再叠出第二个弹窗
  let expiredPromptOpen = false
  /**
   * 弹窗确认后、动手之前：重新从存储读取草稿（页面里的草稿只是打开弹窗时的快照，
   * 其他页签期间保存的新答案不会自动同步过来），确认仍是同一份、内容没被改过、
   * 没被交卷或退役。变了就什么都不做，页面已显示最新内容，提示用户重新确认。
   */
  function draftStillSame(before: ExamDraft | null): ExamDraft | null | false {
    recovery.refresh()
    const current = recovery.draft.value
    const same = before
      ? !!current
      && !current.submitted
      && current.versionId === before.versionId
      && current.attemptId === before.attemptId
      && (current.revision ?? 0) === (before.revision ?? 0)
      && current.updatedAt === before.updatedAt
      : !current
    if (same)
      return current
    alertDialog('这份草稿刚在其他页签更新过（或已被交卷/放弃）。页面已载入最新内容，请确认后再操作。')
    return false
  }
  function startTest() {
    if (recovery.mismatch())
      return
    if (!testPair.value || started.value || expiredPromptOpen)
      return
    // 已交卷的草稿不再续做：按全新测试开始
    const saved
      = recovery.draft.value && !recovery.draft.value.submitted
        ? recovery.draft.value
        : null
    // M-Opt-#4：0 秒草稿不再 1 秒后自动交卷，给二选一：直接交卷查看成绩，
    // 或放弃草稿、全新开始。
    if (saved && saved.timeLeft <= 0) {
      expiredPromptOpen = true
      const pair = testPair.value
      const user = useAuth().currentUser.value
      chooseDialog(
        '该草稿剩余时间已到（0 秒）。可以直接交卷查看成绩，或放弃草稿、全新开始。',
        { confirmText: '直接交卷', cancelText: '放弃草稿，重新开始' },
      ).then((choice) => {
        expiredPromptOpen = false
        // 按 Esc / 点遮罩关掉弹窗：什么都不做，草稿原样保留，可再点“开始测试”重新选
        if (choice === 'dismiss')
          return
        // 弹窗期间换了账号、换了套题、已经开考：这次选择作废
        if (
          useAuth().currentUser.value !== user
          || testPair.value !== pair
          || started.value
          || recovery.mismatch()
        ) {
          return
        }
        // 这份草稿弹窗期间被其他页签改过、交卷或退役：保留最新答案，请用户重新确认
        const current = draftStillSame(saved)
        if (!current)
          return
        if (!recovery.begin(current))
          return
        if (choice === 'cancel') {
          if (recovery.clear())
            beginTest(null)
          return
        }
        answers.value = current.answers ?? {}
        options.restoreExtra(current.extra)
        started.value = true
        submitted.value = false
        studyTimer.start()
        submit()
      })
      return
    }
    beginTest(saved)
  }
  function beginTest(saved: ExamDraft | null) {
    const pair = testPair.value
    if (!pair || !recovery.begin(saved))
      return
    timeLeft.value = restoreTimeLeft(
      saved?.timeLeft,
      options.timeLimit(options.pick(pair)),
    )
    answers.value = saved?.answers ?? {}
    submitted.value = false
    options.restoreExtra(saved?.extra)
    started.value = true
    recovery.save()
    startTimer()
    studyTimer.start()
  }

  // 放弃当前草稿并重新开始：清掉本会话草稿后立刻全新开考，
  // 避免清完仍留在开始屏、下次刷新又被其他页签快照顶回来。
  async function discardDraftAndStart() {
    // 记下弹窗打开时选中的那份草稿；确认时若已换成别的草稿（或被交卷/删除），不再退役
    const target = recovery.draft.value
    const pair = testPair.value
    if (
      !(await confirmDialog(
        '放弃所选的这一次作答并重新开始？同一 attempt 的副本将退役，其他独立作答不受影响。',
        { danger: true, confirmText: '放弃并重新开始' },
      ))
    ) {
      return
    }
    if (started.value || testPair.value !== pair)
      return
    // 弹窗期间这份草稿被其他页签改过/交卷/退役：不退役新内容，请用户重新确认
    if (draftStillSame(target) === false)
      return
    if (recovery.clear())
      startTest()
  }

  onMounted(loadTest)
  watch(testId, loadTest)
  onUnmounted(() => {
    pauseExam()
    studyTimer.pause()
  })

  const allQuestions = computed<MockQuestion[]>(
    () => test.value
      ? options.questions(test.value)
      : [],
  )
  // 满分题数（多选题按答案个数计）
  const scoredTotal = computed(() => totalScorePoints(allQuestions.value))
  const correctCount = computed(() =>
    countCorrect(allQuestions.value, answers.value, submitted.value),
  )
  const band = computed(() => options.bandScore(correctCount.value, scoredTotal.value))
  /** 作答了几题（空白交卷时成绩单显示“未作答”，不显示换算分） */
  const answeredCount = computed(() =>
    Object.values(answers.value).filter(v => String(v ?? '').trim() !== '').length)

  function setAnswer(qid: string, val: string) {
    if (recovery.mismatch())
      return
    if (!submitted.value)
      answers.value[qid] = val
  }
  function toggleMultiSelect(qid: string, idx: number) {
    if (recovery.mismatch())
      return
    if (submitted.value)
      return
    // 多选题最多选该题答案个数（Choose TWO 即 2 个），多出的拒绝加入，防止全选刷分
    const q = allQuestions.value.find(q => q.id === qid)
    const max
      = q && Array.isArray(q.answer)
        ? q.answer.length
        : Number.POSITIVE_INFINITY
    answers.value[qid] = toggleMultiSelectValue(
      answers.value[qid] ?? '',
      idx,
      max,
    )
  }

  // 切换套题：已开始且未交卷且已有答案时先确认，避免误触丢进度；
  // select 是 :value 绑定，取消时 testId 未变，选择框会自动复原
  const hasAnswers = computed(() =>
    Object.values(answers.value).some(v => v.trim() !== ''),
  )
  async function onTestChange(e: Event) {
    const select = e.target as HTMLSelectElement
    const target = select.value
    if (started.value && !submitted.value && hasAnswers.value) {
      // 弹窗期间下拉框先显示回当前套题，确认后再跳转
      select.value = testId.value
      if (!(await confirmDialog('切换套题将暂停并保留当前作答草稿，确定吗？', { confirmText: '切换' })))
        return
      if (target === testId.value)
        return
    }
    router.push({
      path: options.path,
      query: { test: target },
    })
  }

  function questionStatus(
    q: MockQuestion,
  ): 'correct' | 'wrong' | 'partial' | 'unanswered' {
    return mockQuestionStatus(q, answers.value[q.id] ?? '', submitted.value)
  }

  // 离开确认弹窗还开着时又发起导航（再点链接、按返回键）：共用同一个弹窗的结果
  let leavePrompt: Promise<boolean> | null = null
  onBeforeRouteLeave(async () => {
    if (!started.value || submitted.value)
      return true
    if (useAuth().currentUser.value === recovery.owner.value) {
      leavePrompt ??= confirmDialog(
        '尚未交卷，离开将暂停本页作答并保留草稿，其他页签独立作答不受影响，确定吗？',
        { confirmText: '离开', cancelText: '继续作答' },
      ).finally(() => {
        leavePrompt = null
      })
      if (!(await leavePrompt))
        return false
      // 弹窗期间时间到已自动交卷：直接放行
      if (!started.value || submitted.value)
        return true
    }
    return recovery.saveBeforeLeave()
  })

  async function submit() {
    const total = totalScorePoints(allQuestions.value)
    const score = countCorrect(allQuestions.value, answers.value, true)
    const label = testPair.value?.label ?? testId.value
    // A-1: capture the attempt before submitResult (success clears the draft);
    // one attempt records its mistakes once, a retry only tops up the record.
    const attemptId = recovery.attemptId()
    const result = recovery.submitResult({
      id: testId.value,
      label,
      kind: options.kind,
      score,
      total,
      band: options.bandScore(score, total),
      answered: answeredCount.value,
    })
    if (!result)
      return
    studyTimer.pause()
    recordSaveFailed.value = !result.saved
    if (!result.saved)
      resultsOwner = recovery.owner.value
    // 错题本：交卷后写入（按账号隔离，走现有 mistake_parts 同步）
    mistakeSave.save(attemptId, collectMockMistakeEntries({
      kind: options.kind,
      testId: testId.value,
      label,
      answers: answers.value,
      parts: test.value
        ? options.mistakeParts(test.value)
        : [],
    }))
    await options.afterSubmit?.()
  }

  return {
    router,
    route,
    studyTimer,
    testId,
    testPair,
    test,
    loading,
    loadError,
    started,
    timeLeft,
    answers,
    submitted,
    examClock,
    pauseExam,
    startTimer,
    recovery,
    recordSaveFailed,
    mistakeSave,
    retrySaveResult,
    loadTest,
    /** 当前加载的序号：异步任务用它判断套题是否已经换了 */
    loadSeq: () => loadSeq,
    draftStillSame,
    startTest,
    beginTest,
    discardDraftAndStart,
    allQuestions,
    scoredTotal,
    correctCount,
    band,
    answeredCount,
    setAnswer,
    toggleMultiSelect,
    hasAnswers,
    onTestChange,
    questionStatus,
    submit,
  }
}

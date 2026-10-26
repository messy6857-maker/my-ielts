import type { MockTestSelection } from '../pages/mock/registry'
import type { MockQuestion } from '../pages/mock/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadMockTestPart } from '../pages/mock/registry'
import { bandScore, isCorrect, multiSelectScore } from '../pages/mock/types'
import { useAuth } from './useAuth'
import { useDeadlineCountdown } from './useDeadlineCountdown'
import { saveMockRecord } from './useMockHistory'

export function useMockSession(kind: 'reading' | 'listening', resetPage: () => void, stopMedia: () => void = () => {}) {
  const route = useRoute()
  const { currentUser } = useAuth()
  const testId = computed(() => typeof route.query.test === 'string' ? route.query.test : 'cam21-test1')
  const testPair = ref<MockTestSelection | null>(null)
  const loading = ref(true)
  const loadError = ref(false)
  const started = ref(false)
  const answers = ref<Record<string, string>>({})
  const submitted = ref(false)
  let owner = currentUser.value
  let loadSeq = 0
  let disposed = false
  const clock = useDeadlineCountdown(submit)
  const timeLeft = clock.secondsLeft
  const allQuestions = computed<MockQuestion[]>(() => {
    const pair = testPair.value
    if (!pair)
      return []
    return kind === 'reading' ? pair.reading?.passages.flatMap(p => p.questions) ?? [] : pair.listening?.parts.flatMap(p => p.questions) ?? []
  })
  // 满分题数（多选题按答案个数计）
  const scoredTotal = computed(() =>
    allQuestions.value.reduce((s, q) => s + (q.type === 'multi-select' && Array.isArray(q.answer) ? q.answer.length : 1), 0),
  )

  const correctCount = computed(() => {
    if (!submitted.value)
      return 0
    return allQuestions.value.reduce((sum, q) => {
      const ans = answers.value[q.id] ?? ''
      return sum + (q.type === 'multi-select' ? multiSelectScore(q, ans) : (isCorrect(q, ans) ? 1 : 0))
    }, 0)
  })

  const band = computed(() => bandScore(correctCount.value))

  function setAnswer(qid: string, val: string) {
    if (!submitted.value)
      answers.value[qid] = val
  }

  function toggleMultiSelect(qid: string, idx: number) {
    if (submitted.value)
      return
    const current = new Set((answers.value[qid] ?? '').split(',').filter(Boolean))
    const s = String(idx)
    if (current.has(s))
      current.delete(s)
    else {
      const q = allQuestions.value.find(q => q.id === qid)
      const limit = q && Array.isArray(q.answer) ? q.answer.length : 1
      if (current.size >= limit)
        return
      current.add(s)
    }
    answers.value[qid] = [...current].join(',')
  }

  function questionStatus(q: MockQuestion): 'correct' | 'wrong' | 'partial' | 'unanswered' {
    if (!submitted.value)
      return 'unanswered'
    const userAns = answers.value[q.id] ?? ''
    if (!userAns)
      return 'unanswered'
    if (q.type === 'multi-select') {
      const score = multiSelectScore(q, userAns)
      const max = Array.isArray(q.answer) ? q.answer.length : 1
      if (score === max)
        return 'correct'
      return score > 0 ? 'partial' : 'wrong'
    }
    return isCorrect(q, userAns) ? 'correct' : 'wrong'
  }


  function clearSession() {
    clock.reset(0)
    stopMedia()
    started.value = false
    submitted.value = false
    answers.value = {}
    owner = currentUser.value
    resetPage()
  }
  async function loadTest() {
    const seq = ++loadSeq
    clearSession()
    testPair.value = null
    loading.value = true
    loadError.value = false
    try {
      const pair = await loadMockTestPart(testId.value, kind)
      if (seq === loadSeq && !disposed)
        testPair.value = pair
    }
    catch {
      if (seq === loadSeq && !disposed)
        loadError.value = true
    }
    finally {
      if (seq === loadSeq && !disposed)
        loading.value = false
    }
  }
  function startTest() {
    if (!testPair.value || started.value || loading.value)
      return
    clearSession()
    started.value = true
    clock.start(testPair.value[kind]!.timeLimit)
  }
  function submit() {
    if (submitted.value || !started.value || owner !== currentUser.value)
      return
    submitted.value = true
    clock.pause()
    stopMedia()
    saveMockRecord({ id: testId.value, label: testPair.value?.label ?? testId.value,
      kind, score: correctCount.value, total: scoredTotal.value, band: band.value })
  }
  watch(testId, loadTest)
  watch(currentUser, clearSession, { flush: 'sync' })
  onMounted(loadTest)
  onUnmounted(() => { disposed = true; loadSeq++; stopMedia() })
  return { testId, testPair, loading, loadError, started, timeLeft, answers, submitted,
    allQuestions, scoredTotal, correctCount, band, loadTest, startTest, submit, setAnswer, toggleMultiSelect, questionStatus }
}

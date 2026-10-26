import type { Ref } from 'vue'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { onBeforeLogout, readJson, useAuth, writeJson } from './useAuth'
import { useDeadlineCountdown } from './useDeadlineCountdown'
import { useEssayDraft } from './useEssayDraft'
import { nsKey } from './useStudyData'

export function useEssayHistory<T extends { id: number }>(task: 1 | 2) {
  const base = `task${task}_essays_v1`
  const history = ref<T[]>([]) as Ref<T[]>
  function loadHistory() { history.value = readJson<T[]>(nsKey(base), [], base) }
  function saveEssay(essay: T) {
    history.value = [essay, ...history.value].slice(0, 50)
    return writeJson(nsKey(base), history.value)
  }
  function removeEssay(id: number) {
    history.value = history.value.filter(essay => essay.id !== id)
    writeJson(nsKey(base), history.value)
  }
  loadHistory()
  return { history, loadHistory, saveEssay, removeEssay }
}

/** Task-specific questions and grading stay in the pages; lifecycle stays here. */
export function useWritingSession<P extends { id: string }>(task: 1 | 2, loadHistory: () => void) {
  const timeLimit = task === 1 ? 1200 : 2400
  const view = ref<'home' | 'write' | 'result'>('home')
  const prompt = shallowRef<P | null>(null)
  const essayText = ref('')
  const timeUp = ref(false)
  const clock = useDeadlineCountdown(() => { timeUp.value = true })
  clock.reset(timeLimit)
  const secondsLeft = clock.secondsLeft
  const timerOn = clock.running
  const draft = useEssayDraft(task, essayText, secondsLeft)
  const { currentUser } = useAuth()
  const offLogout = onBeforeLogout(() => { clock.pause(); draft.close() })
  watch(currentUser, () => {
    clock.pause()
    draft.discardActive()
    essayText.value = ''
    prompt.value = null
    timeUp.value = false
    view.value = 'home'
    loadHistory()
  }, { flush: 'sync' })
  onUnmounted(() => { clock.pause(); draft.close(); offLogout() })

  const wordCount = computed(() => essayText.value.trim().split(/\s+/).filter(Boolean).length)
  const timeText = computed(() => {
    const seconds = Math.max(0, secondsLeft.value)
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  })
  function startWrite(next: P) {
    clock.pause()
    draft.close()
    prompt.value = next
    draft.open(next.id, timeLimit)
    timeUp.value = secondsLeft.value === 0
    view.value = 'write'
  }
  function toggleTimer() { if (timerOn.value) clock.pause(); else clock.resume() }
  function resetTimer() { clock.reset(timeLimit); timeUp.value = false }
  function backHome() { clock.pause(); draft.close(); view.value = 'home'; loadHistory() }
  return { view, prompt, essayText, timeUp, clock, secondsLeft, timerOn, draft, wordCount, timeText, startWrite, toggleTimer, resetTimer, backHome }
}

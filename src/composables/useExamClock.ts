import { onUnmounted } from 'vue'
import type { Ref } from 'vue'

export function useExamClock(
  timeLeft: Ref<number>,
  finish: () => void,
  onPause?: () => void,
) {
  let endAt = 0
  let timer: ReturnType<typeof setInterval> | null = null
  const remaining = () =>
    endAt
      ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      : timeLeft.value
  function pause() {
    timeLeft.value = remaining()
    endAt = 0
    if (timer)
      clearInterval(timer)
    timer = null
    onPause?.()
  }
  function start() {
    if (timer)
      clearInterval(timer)
    endAt = Date.now() + timeLeft.value * 1000
    timer = setInterval(() => {
      timeLeft.value = remaining()
      if (!timeLeft.value) {
        pause()
        finish()
      }
    }, 1000)
  }
  onUnmounted(pause)
  return { start, pause, remaining }
}

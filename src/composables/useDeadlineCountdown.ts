import { onScopeDispose, ref } from 'vue'

/** The interval refreshes the display; the deadline remains the source of truth. */
export function useDeadlineCountdown(onExpire: () => void) {
  const secondsLeft = ref(0)
  const running = ref(false)
  let deadline = 0
  let timer: ReturnType<typeof setInterval> | undefined
  function stop() {
    clearInterval(timer)
    timer = undefined
    running.value = false
  }
  function refresh() {
    if (!running.value)
      return
    secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (!secondsLeft.value) {
      stop()
      onExpire()
    }
  }
  function pause() {
    refresh()
    stop()
  }
  function reset(seconds: number) {
    stop()
    secondsLeft.value = Math.max(0, Math.floor(seconds))
  }
  function resume() {
    if (running.value || secondsLeft.value <= 0)
      return
    deadline = Date.now() + secondsLeft.value * 1000
    running.value = true
    timer = setInterval(refresh, 250)
  }
  function start(seconds: number) {
    reset(seconds)
    resume()
  }
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('pageshow', refresh)
  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('pageshow', refresh)
  })
  return { secondsLeft, running, start, reset, pause, resume, refresh }
}

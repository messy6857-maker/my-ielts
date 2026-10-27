import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useStudyTimer } from '../src/composables/useStudyTimer'
import { useAuth } from '../src/composables/useAuth'

const timers: ReturnType<typeof useStudyTimer>[] = []
function make() {
  const t = useStudyTimer()
  timers.push(t)
  return t
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  localStorage.clear()
  useAuth().currentUser.value = 'alice'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
})
afterEach(() => {
  timers.splice(0).forEach(t => t.dispose())
  vi.useRealTimers()
})
it('unions overlapping study intervals from two tabs on one device', () => {
  const a = make()
  const b = make()
  a.start()
  vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 5))
  b.start()
  vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 20))
  a.pause()
  b.pause()
  a.refresh()
  expect(a.dailySeconds.value).toBe(20)
})
it('splits a session at midnight without charging yesterday to today', () => {
  vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 50))
  const a = make()
  a.start()
  vi.setSystemTime(new Date(2026, 9, 28, 0, 0, 10))
  a.pause()
  expect(a.dailySeconds.value).toBe(10)
})
it('stops and saves a timer before the active identity changes', () => {
  const a = make()
  a.start()
  vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 10))
  useAuth().currentUser.value = 'bob'
  expect(a.running.value).toBe(false)
  expect(a.dailySeconds.value).toBe(0)
  useAuth().currentUser.value = 'alice'
  a.refresh()
  expect(a.dailySeconds.value).toBe(10)
})

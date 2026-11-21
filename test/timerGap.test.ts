import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import { useStudyTimer } from '../src/composables/useStudyTimer'

const timers: ReturnType<typeof useStudyTimer>[] = []
function make() {
  const t = useStudyTimer()
  timers.push(t)
  return t
}
const T0 = new Date(2026, 9, 27, 12).getTime()
const HOURS_3 = 3 * 3600 * 1000
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
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

it('电脑睡眠期间不计时，醒来后继续计时', () => {
  const t = make()
  t.start()
  vi.advanceTimersByTime(30_000)
  // 睡眠：墙钟前进 3 小时，但计时器回调没有执行
  vi.setSystemTime(T0 + 30_000 + HOURS_3)
  vi.advanceTimersByTime(10_000)
  expect(t.dailySeconds.value).toBe(39)
  t.pause()
  expect(t.dailySeconds.value).toBe(39)
})

it('醒来后还没计时就直接暂停，也不计入睡眠时间', () => {
  const t = make()
  t.start()
  vi.advanceTimersByTime(30_000)
  vi.setSystemTime(T0 + 30_000 + HOURS_3)
  expect(t.pause()).toBe(30)
  expect(t.dailySeconds.value).toBe(30)
})

it('正常连续计时不受影响', () => {
  const t = make()
  t.start()
  vi.advanceTimersByTime(5 * 60_000)
  t.pause()
  expect(t.dailySeconds.value).toBe(300)
})

import { createGlobalState, useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { studyDate } from '../utils/studyDate'
import { studyPrefix } from '../utils/studyStorage'
import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey } from './useStudyData'

// One clock for all cached decks, including pages that remain open overnight.
export const useStudyDay = createGlobalState(() => {
  const now = ref(new Date())
  const day = computed(() => studyDate(now.value))
  const refresh = () => {
    now.value = new Date()
  }
  useIntervalFn(refresh, 1000)
  useEventListener(document, 'visibilitychange', refresh)
  return { now, day, refresh }
})

export function createDailyCounter(namespace: string) {
  const { currentUser } = useAuth()
  const clock = useStudyDay()
  const goalBase = `${namespace}_daily_goal_v1`
  const countBase = `${namespace}_daily_new_v1`
  const goal = ref(30)
  const count = ref(0)
  let countDate = ''
  let owner = currentUser.value
  const countKey = () => `${studyPrefix(owner)}${countBase}`

  function resetForDay(today: string) {
    if (countDate !== today) {
      countDate = today
      count.value = 0
      writeJson(countKey(), { date: today, count: 0 })
    }
  }

  function ensureToday() {
    clock.refresh()
    resetForDay(clock.day.value)
  }

  function load() {
    owner = currentUser.value
    goal.value = readJson<number>(nsKey(goalBase), 30, goalBase)
    const saved = readJson<{ date: string; count: number }>(nsKey(countBase), { date: '', count: 0 }, countBase)
    countDate = saved.date
    count.value = saved.count
    ensureToday()
  }
  load()
  watch(currentUser, load, { flush: 'sync' })
  watch(clock.day, resetForDay, { flush: 'sync' })

  return {
    goal,
    dailyCount: count,
    remaining: computed(() => Math.max(0, goal.value - count.value)),
    setGoal(value: number) {
      if (!Number.isFinite(value))
        return
      goal.value = Math.min(500, Math.max(1, Math.round(value)))
      writeJson(nsKey(goalBase), goal.value)
    },
    recordNewWord() {
      ensureToday()
      count.value++
      writeJson(countKey(), { date: countDate, count: count.value })
    },
  }
}

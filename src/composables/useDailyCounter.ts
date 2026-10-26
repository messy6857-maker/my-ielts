import type { DailyPart } from '../utils/dailyStorage'
import { createGlobalState, useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { dailyTotal, readDailyParts } from '../utils/dailyStorage'
import { studyDate } from '../utils/studyDate'
import { studyPrefix, writeStudyBatch  } from '../utils/studyStorage'
import { registerStudyWriter } from '../utils/studyWriteQueue'
import { notifyLocalWrite, onBeforeLogout, readJson, storageFailures, useAuth, writeJson } from './useAuth'
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

  const partId = crypto.randomUUID()
  const pending = new Map<string, DailyPart>()

  function snapshot(key: string, date: string) {
    const data = readDailyParts(key, countBase, date)
    for (const [k, part] of pending) {
      if (k.startsWith(`${key}__part_`) && part.date === date) data.parts.set(k, part)
    }
    return data
  }
  function savePart(key: string, partKey: string, part: DailyPart) {
    const data = snapshot(key, part.date)
    data.parts.set(partKey, part)
    const total = dailyTotal([...data.parts.values()], data.fallback)
    try {
      writeStudyBatch([[partKey, JSON.stringify(part)], [key, JSON.stringify({ date: part.date, count: total })]])
      pending.delete(partKey)
      storageFailures.value = storageFailures.value.filter(k => k !== key)
      notifyLocalWrite()
    }
    catch {
      pending.set(partKey, part)
      if (!storageFailures.value.includes(key)) storageFailures.value = [...storageFailures.value, key]
    }
    return total
  }
  function flush() {
    for (const [key, part] of [...pending]) savePart(key.slice(0, key.lastIndexOf('__part_')), key, part)
  }
  function resetForDay(today: string) {
    const key = countKey()
    const data = snapshot(key, today)
    countDate = today
    count.value = dailyTotal([...data.parts.values()], data.fallback)
    const saved = readJson<{ date: string }>(key, { date: '' }, countBase)
    if (saved.date !== today) writeJson(key, { date: today, count: count.value })
  }
  function ensureToday() {
    clock.refresh()
    resetForDay(clock.day.value)
  }
  function load() {
    flush()
    owner = currentUser.value
    goal.value = readJson<number>(nsKey(goalBase), 30, goalBase)
    ensureToday()
  }
  load()
  watch(currentUser, load, { flush: 'sync' })
  watch(clock.day, resetForDay, { flush: 'sync' })
  useEventListener(window, 'storage', (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === null || event.key === countKey() || event.key.startsWith(`${countKey()}__part_`))) ensureToday()
  })
  useEventListener(window, 'pagehide', flush)
  const offWriter = registerStudyWriter(flush)
  const offLogout = onBeforeLogout(flush)
  if (getCurrentScope()) onScopeDispose(() => { flush(); offWriter(); offLogout() })

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
    recordNewWord(id?: string | number) {
      ensureToday()
      const key = countKey()
      const data = snapshot(key, countDate)
      const word = id === undefined ? undefined : String(id)
      if (word !== undefined && [...data.parts.values()].some(part => part.words.includes(word))) return
      const partKey = `${key}__part_${partId}`
      const previous = data.parts.get(partKey)
      const createdAt = [...data.parts.values()].reduce((max, part) => Math.max(max, part.createdAt + 1), Date.now())
      const part: DailyPart = previous
        ? { ...previous, words: [...previous.words] }
        : { date: countDate, seed: count.value, count: 0, words: [], createdAt }
      if (word === undefined) part.count++
      else part.words.push(word)
      count.value = savePart(key, partKey, part)
    },
  }
}

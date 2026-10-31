import { computed, effectScope, ref } from 'vue'
import {
  entryKey,
  readRecord,
  saveEnvelope,
  subscribeStorage,
  writerId,
} from '../utils/storage'
import { useRecordMap } from './useRecordData'
import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey, studyDay } from './useStudyData'

interface DailyPart {
  ns: string
  date: string
  word: string | null
  count: number
  actor: string
  epoch: string
}
const stores = new Map<string, ReturnType<typeof createDaily>>()
function createDaily(ns: string) {
  const { currentUser } = useAuth()
  const records = useRecordMap<DailyPart>('daily_parts_v2')
  const resets = useRecordMap<{
    epoch: string
  }>('daily_resets_v2')
  const day = ref(studyDay())
  const refreshDay = () => {
    day.value = studyDay()
  }
  setInterval(refreshDay, 30000)
  document.addEventListener('visibilitychange', refreshDay)
  const goalBase
    = ns === 'vocabulary' ? 'flashcard_daily_goal_v1' : `${ns}_daily_goal_v1`
  const legacyBase
    = ns === 'vocabulary' ? 'flashcard_daily_new_v1' : `${ns}_daily_new_v1`
  const goal = ref(readJson(nsKey(goalBase), 30))
  const load = () => {
    refreshDay()
    goal.value = readJson(nsKey(goalBase), 30)
    migrate()
  }
  function migrate() {
    const old = readJson<{
      date: string
      count: number
    } | null>(nsKey(legacyBase), null)
    if (!old || !old.count || !old.date)
      return
    const id = `${ns}|${old.date}|legacy`
    const key = entryKey('daily_parts_v2', id, currentUser.value)
    if (localStorage.getItem(key) === null) {
      saveEnvelope(
        key,
        {
          __ielts: 2,
          stamp: [0, 'legacy'],
          value: {
            ns,
            date: old.date,
            word: null,
            count: old.count,
            actor: 'legacy',
            epoch: '',
          },
        },
        'remote',
      )
    }
  }
  migrate()
  subscribeStorage((key) => {
    if (!key || key === nsKey(goalBase) || key === nsKey(legacyBase))
      load()
  })
  watch(currentUser, load, { flush: 'sync' })
  const dailyCount = computed(() => {
    const epoch = resets.state.value[`${ns}|${day.value}`]?.epoch ?? ''
    const parts = Object.values(records.state.value).filter(
      p =>
        p.ns === ns && p.date === day.value && p.epoch === epoch && p.count > 0,
    )
    return Math.max(
      0,
      parts.filter(p => p.word === null).reduce((n, p) => n + p.count, 0)
        + new Set(parts.flatMap(p => (p.word ? [p.word] : []))).size,
    )
  })
  function recordNewWord(id: string | number = crypto.randomUUID()) {
    refreshDay()
    const epoch
      = readRecord<{ epoch: string }>(
        'daily_resets_v2',
        `${ns}|${day.value}`,
        currentUser.value,
      )?.epoch ?? ''
    const key = `${ns}|${day.value}|${String(id)}|${writerId()}`
    records.set(key, {
      ns,
      date: day.value,
      word: String(id),
      count: 1,
      actor: writerId(),
      epoch,
    })
    return day.value
  }
  function decrementNewWord(id?: string | number, date = studyDay()) {
    refreshDay()
    if (id !== undefined)
      records.set(`${ns}|${date}|${String(id)}|${writerId()}`, undefined)
  }
  function resetDaily() {
    refreshDay()
    resets.set(`${ns}|${day.value}`, {
      epoch: crypto.randomUUID(),
      date: day.value,
    } as { epoch: string })
  }
  function setGoal(n: number) {
    if (Number.isFinite(n)) {
      goal.value = Math.min(500, Math.max(1, Math.round(n)))
      writeJson(nsKey(goalBase), goal.value)
    }
  }
  return {
    goal,
    dailyCount,
    remaining: computed(() => Math.max(0, goal.value - dailyCount.value)),
    setGoal,
    recordNewWord,
    decrementNewWord,
    resetDaily,
    reload: load,
  }
}
export function useDailyStore(ns: string) {
  let store = stores.get(ns)
  if (!store) {
    store = effectScope(true).run(() => createDaily(ns))!
    stores.set(ns, store)
  }
  return store
}

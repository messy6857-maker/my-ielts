// 单词间隔重复：简化 SM-2
// 认识 -> 拉长复习间隔；模糊 -> 明天再见；不认识 -> 本轮内高频复现
// 调度数据按账号隔离存储
import { computed } from 'vue'
import { migrateCheckins } from '../utils/migrateStudy'
import { useAuth } from './useAuth'
import { useRecordMap } from './useRecordData'
import { useDailyStore } from './useDailyStore'

export interface WordSchedule {
  ease: number // 记忆强度系数
  interval: number // 下次复习间隔（天）
  dueAt: number // 到期时间戳（毫秒）
  reps: number // 连续答对次数
  lapses: number // 累计答错次数
}
// 5 = 认识，3 = 模糊，0 = 不认识
export type Grade = 0 | 3 | 5
const DAY = 86400000
function todayStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
export function gradeSchedule(
  prev: WordSchedule | undefined,
  grade: Grade,
  now = Date.now(),
): WordSchedule {
  const s: WordSchedule = prev ?? {
    ease: 2.5,
    interval: 0,
    dueAt: 0,
    reps: 0,
    lapses: 0,
  }
  if (grade === 5) {
    const reps = s.reps + 1
    const interval
      = reps === 1 ? 1 : Math.max(1, Math.round(s.interval * s.ease))
    return {
      ease: Math.min(3, s.ease + 0.1),
      interval,
      dueAt: now + interval * DAY,
      reps,
      lapses: s.lapses,
    }
  }
  if (grade === 3) {
    return {
      ease: Math.max(1.3, s.ease - 0.15),
      interval: 1,
      dueAt: now + DAY,
      reps: s.reps,
      lapses: s.lapses,
    }
  }
  return {
    ease: Math.max(1.3, s.ease - 0.2),
    interval: 0,
    dueAt: now,
    reps: 0,
    lapses: s.lapses + 1,
  }
}
// Daily counters are partitioned by date, word and writer; initialization never writes zero.
export const useDailyGoal = () => useDailyStore('vocabulary')
export const useCheckin = createGlobalState(() => {
  const store = useRecordMap<boolean>('flashcard_checkin_v1')
  migrateCheckins(useAuth().currentUser.value)
  const years = useRecordMap<number[]>('checkin_years_v2')
  const dates = computed(() => {
    const all = new Set(
      Object.keys(store.state.value).filter(d => store.state.value[d]),
    )
    for (const [year, days] of Object.entries(years.state.value)) {
      for (const day of days) {
        const d = new Date(Number(year), 0, 1 + day)
        all.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
      }
    }
    return [...all]
  })
  function checkin() {
    store.set(todayStr(), true)
    migrateCheckins(useAuth().currentUser.value)
    years.reload()
  }
  const totalDays = computed(() => dates.value.length)
  const streak = computed(() => {
    let n = 0
    let offset = dates.value.includes(todayStr()) ? 0 : 1
    while (dates.value.includes(todayStr(offset++))) n++
    return n
  })
  const weekDots = computed(() =>
    [6, 5, 4, 3, 2, 1, 0].map(offset => ({
      label: offset ? todayStr(offset).split('-').slice(1).join('/') : '今天',
      checked: dates.value.includes(todayStr(offset)),
    })),
  )
  return { dates, totalDays, checkin, streak, weekDots, reload: store.reload }
})
export const useWordSchedule = createGlobalState(() => {
  const store = useRecordMap<WordSchedule>('sr_vocabulary_v1')
  const keyOf = (id: string | number) => `vocab:${id}`
  const get = (id: string | number) => store.state.value[keyOf(id)]
  const set = (id: string | number, value: WordSchedule) =>
    store.set(keyOf(id), value)
  const remove = (id: string | number) => store.set(keyOf(id), undefined)
  const clear = () => {
    for (const id of Object.keys(store.state.value)) store.set(id, undefined)
  }
  return {
    schedules: store.state,
    get,
    set,
    remove,
    clear,
    reload: store.reload,
  }
})

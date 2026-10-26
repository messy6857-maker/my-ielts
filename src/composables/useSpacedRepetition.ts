// 单词间隔重复：简化 SM-2
// 认识 -> 拉长复习间隔；模糊 -> 明天再见；不认识 -> 本轮内高频复现
// 调度数据按账号隔离存储

import { readJson, writeJson } from './useAuth'
import { nsKey } from './useStudyData'
import { createDailyCounter, useStudyDay } from './useDailyCounter'

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
  const d = new Date(useStudyDay().now.value)
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function gradeSchedule(prev: WordSchedule | undefined, grade: Grade, now = Date.now()): WordSchedule {
  const s: WordSchedule = prev ?? { ease: 2.5, interval: 0, dueAt: 0, reps: 0, lapses: 0 }
  if (grade === 5) {
    const reps = s.reps + 1
    const interval = reps === 1 ? 1 : Math.max(1, Math.round(s.interval * s.ease))
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

// 每日学习目标：每天学 N 个新词（复习的词不占名额），按账号隔离、按天清零
export const useDailyGoal = createGlobalState(() => createDailyCounter('flashcard'))

// 每天打卡：完成一轮学习即记一天，按账号隔离
export const useCheckin = createGlobalState(() => {
  const { currentUser } = useAuth()
  const dates = ref<string[]>([])

  function load() {
    dates.value = readJson<string[]>(nsKey('flashcard_checkin_v1'), [], 'flashcard_checkin_v1')
  }
  load()

  watch(currentUser, load)

  function checkin() {
    const t = todayStr()
    if (!dates.value.includes(t)) {
      dates.value = [...dates.value, t]
      writeJson(nsKey('flashcard_checkin_v1'), dates.value)
    }
  }

  // 连续打卡天数：今天没打就从昨天开始算
  const streak = computed(() => {
    let n = 0
    let offset = dates.value.includes(todayStr(0)) ? 0 : 1
    while (dates.value.includes(todayStr(offset))) {
      n++
      offset++
    }
    return n
  })

  // 最近 7 天打卡点
  const weekDots = computed(() => {
    return [6, 5, 4, 3, 2, 1, 0].map((offset) => {
      const d = new Date(useStudyDay().now.value)
      d.setDate(d.getDate() - offset)
      return {
        label: offset === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`,
        checked: dates.value.includes(todayStr(offset)),
      }
    })
  })

  return { dates, checkin, streak, weekDots }
})

export const useWordSchedule = createGlobalState(() => {
  const { currentUser } = useAuth()
  const schedules = ref<Record<string, WordSchedule>>({})

  function load() {
    schedules.value = readJson<Record<string, WordSchedule>>(nsKey('sr_vocabulary_v1'), {}, 'sr_vocabulary_v1')
  }
  load()

  watch(currentUser, load)
  watch(schedules, v => writeJson(nsKey('sr_vocabulary_v1'), v), { deep: true })

  function keyOf(id: string | number) {
    return `vocab:${id}`
  }

  function get(id: string | number): WordSchedule | undefined {
    return schedules.value[keyOf(id)]
  }

  function set(id: string | number, s: WordSchedule) {
    schedules.value[keyOf(id)] = s
  }

  return { schedules, get, set }
})

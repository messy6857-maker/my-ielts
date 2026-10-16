// 单词间隔重复：简化 SM-2
// 认识 -> 拉长复习间隔；模糊 -> 明天再见；不认识 -> 本轮内高频复现
// 调度数据按账号隔离存储

import { readJson, writeJson } from './useAuth'
import { nsKey } from './useStudyData'

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
export const useDailyGoal = createGlobalState(() => {
  const { currentUser } = useAuth()
  const goal = ref(30)
  const dailyCount = ref(0) // 今天已学的新词数

  function todayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  function load() {
    goal.value = readJson<number>(nsKey('flashcard_daily_goal_v1'), 30)
    const saved = readJson<{ date: string, count: number }>(
      nsKey('flashcard_daily_new_v1'),
      { date: '', count: 0 },
    )
    if (saved.date === todayStr()) {
      dailyCount.value = saved.count
    }
    else {
      dailyCount.value = 0
      writeJson(nsKey('flashcard_daily_new_v1'), { date: todayStr(), count: 0 })
    }
  }
  load()

  watch(currentUser, load)

  function setGoal(n: number) {
    goal.value = n
    writeJson(nsKey('flashcard_daily_goal_v1'), n)
  }

  // 学完一个新词时调用（同一词一天内只计一次，由调用方用 counted 标记去重）
  function recordNewWord() {
    dailyCount.value += 1
    writeJson(nsKey('flashcard_daily_new_v1'), { date: todayStr(), count: dailyCount.value })
  }

  // 今天还能学几个新词
  const remaining = computed(() => Math.max(0, goal.value - dailyCount.value))

  return { goal, dailyCount, remaining, setGoal, recordNewWord }
})

export const useWordSchedule = createGlobalState(() => {
  const { currentUser } = useAuth()
  const schedules = ref<Record<string, WordSchedule>>({})

  function load() {
    schedules.value = readJson<Record<string, WordSchedule>>(nsKey('sr_vocabulary_v1'), {})
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

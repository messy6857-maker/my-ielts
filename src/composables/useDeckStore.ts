// 通用自测卡片的状态工厂：按 namespace 隔离 SM-2 调度 + 每日新词目标
// 数据按账号隔离（经 nsKey），同一 ns 返回同一实例
// 供听力 179 / 阅读 538 等独立卡片使用（词汇卡片沿用 useSpacedRepetition 的单例）

import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey } from './useStudyData'
import { onSyncApplied } from './syncClient'
import type { WordSchedule } from './useSpacedRepetition'

function todayStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export interface DeckStores {
  getSchedule(id: string | number): WordSchedule | undefined
  setSchedule(id: string | number, s: WordSchedule): void
  removeSchedule(id: string | number): void
  clear(): void
  reload(): void
  goal: Ref<number>
  dailyCount: Ref<number>
  remaining: ComputedRef<number>
  setGoal(n: number): void
  recordNewWord(): void
  decrementNewWord(): void
  resetDaily(): void
}

const cache = new Map<string, DeckStores>()
export function useDeckStore(ns: string): DeckStores {
  const hit = cache.get(ns)
  if (hit)
    return hit

  const { currentUser } = useAuth()
  const schedules = ref<Record<string, WordSchedule>>({})
  const goal = ref(30)
  const dailyCount = ref(0)

  const SKEY = `${ns}_sr_v1`
  const GKEY = `${ns}_daily_goal_v1`
  const NKEY = `${ns}_daily_new_v1`

  function load() {
    schedules.value = readJson<Record<string, WordSchedule>>(nsKey(SKEY), {})
    goal.value = readJson<number>(nsKey(GKEY), 30)
    const saved = readJson<{ date: string, count: number }>(nsKey(NKEY), { date: '', count: 0 })
    if (saved.date === todayStr()) {
      dailyCount.value = saved.count
    }
    else {
      dailyCount.value = 0
      writeJson(nsKey(NKEY), { date: todayStr(), count: 0 })
    }
  }
  load()

  watch(currentUser, load)
  // 拉取后 reload：云端新数据写进 localStorage 后，内存里的旧快照不能再写回覆盖它
  onSyncApplied(load)
  watch(schedules, v => writeJson(nsKey(SKEY), v), { deep: true })

  function keyOf(id: string | number) {
    return `${ns}:${id}`
  }

  const stores: DeckStores = {
    getSchedule(id: string | number) {
      return schedules.value[keyOf(id)]
    },
    setSchedule(id: string | number, s: WordSchedule) {
      schedules.value[keyOf(id)] = s
    },
    removeSchedule(id: string | number) {
      delete schedules.value[keyOf(id)]
    },
    clear() {
      schedules.value = {}
    },
    reload() {
      load()
    },
    goal,
    dailyCount,
    remaining: computed(() => Math.max(0, goal.value - dailyCount.value)),
    setGoal(n: number) {
      if (!Number.isFinite(n))
        return
      const v = Math.min(500, Math.max(1, Math.round(n)))
      goal.value = v
      writeJson(nsKey(GKEY), v)
    },
    recordNewWord() {
      dailyCount.value += 1
      writeJson(nsKey(NKEY), { date: todayStr(), count: dailyCount.value })
    },
    decrementNewWord() {
      dailyCount.value = Math.max(0, dailyCount.value - 1)
      writeJson(nsKey(NKEY), { date: todayStr(), count: dailyCount.value })
    },
    resetDaily() {
      dailyCount.value = 0
      writeJson(nsKey(NKEY), { date: todayStr(), count: 0 })
    },
  }
  cache.set(ns, stores)
  return stores
}

export interface DeckItem {
  id: string | number
}

export interface QueuePlan<T extends DeckItem> {
  reviews: T[]
  dueCount: number
  newWords: T[]
}

/**
 * 组牌：复习配额 = 3 × 每日新词目标（1:3）
 * 到期复习优先排前；不足配额时从已学未到期的词里补（记错次数多、到期早优先）；
 * 新词按今日剩余名额取
 */
export function planQueue<T extends DeckItem>(
  all: T[],
  getSchedule: (id: string | number) => WordSchedule | undefined,
  goal: number,
  newRemaining: number,
  now = Date.now(),
): QueuePlan<T> {
  const due: T[] = []
  const learned: T[] = []
  const fresh: T[] = []
  for (const c of all) {
    const s = getSchedule(c.id)
    if (!s)
      fresh.push(c)
    else if (s.dueAt <= now)
      due.push(c)
    else
      learned.push(c)
  }
  due.sort((a, b) => (getSchedule(a.id)?.dueAt ?? 0) - (getSchedule(b.id)?.dueAt ?? 0))
  learned.sort((a, b) => {
    const sa = getSchedule(a.id)!
    const sb = getSchedule(b.id)!
    return sb.lapses - sa.lapses || sa.dueAt - sb.dueAt
  })
  const reviews = [...due, ...learned].slice(0, Math.max(0, goal) * 3)
  return {
    reviews,
    dueCount: Math.min(due.length, reviews.length),
    newWords: fresh.slice(0, Math.max(0, newRemaining)),
  }
}

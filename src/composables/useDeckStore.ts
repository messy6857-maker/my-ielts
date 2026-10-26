// 通用自测卡片的状态工厂：按 namespace 隔离 SM-2 调度 + 每日新词目标
// 数据按账号隔离（经 nsKey），同一 ns 返回同一实例
// 供听力 179 / 阅读 538 等独立卡片使用（词汇卡片沿用 useSpacedRepetition 的单例）

import type { WordSchedule } from './useSpacedRepetition'
import { effectScope } from 'vue'
import { useAccountData } from './useAccountData'
import { createDailyCounter } from './useDailyCounter'

export interface DeckStores {
  getSchedule: (id: string | number) => WordSchedule | undefined
  setSchedule: (id: string | number, s: WordSchedule) => void
  goal: Ref<number>
  dailyCount: Ref<number>
  remaining: ComputedRef<number>
  setGoal: (n: number) => void
  recordNewWord: () => void
}

const cache = new Map<string, DeckStores>()
export function useDeckStore(ns: string): DeckStores {
  const hit = cache.get(ns)
  if (hit)
    return hit

  // The cache outlives a page. Its watchers must have the same lifetime.
  const stores = effectScope(true).run(() => createDeckStore(ns))!
  cache.set(ns, stores)
  return stores
}

function createDeckStore(ns: string): DeckStores {
  const schedules = useAccountData<Record<string, WordSchedule>>(`${ns}_sr_v1`, () => ({}))
  const daily = createDailyCounter(ns)

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
    ...daily,
  }
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

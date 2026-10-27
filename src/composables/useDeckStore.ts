import { effectScope } from 'vue'
import { useRecordMap } from './useRecordData'
import { useDailyStore } from './useDailyStore'
import type { WordSchedule } from './useSpacedRepetition'

const cache = new Map<string, ReturnType<typeof createDeck>>()
function createDeck(ns: string) {
  const store = useRecordMap<WordSchedule>(`${ns}_sr_v1`)
  const daily = useDailyStore(ns)
  return {
    getSchedule: (id: string | number) => store.state.value[`${ns}:${id}`],
    setSchedule: (id: string | number, value: WordSchedule) =>
      store.set(`${ns}:${id}`, value),
    removeSchedule: (id: string | number) =>
      store.set(`${ns}:${id}`, undefined),
    clear: () => store.clear(),
    ...daily,
    reload: () => {
      store.reload()
      daily.reload()
    },
  }
}
export type DeckStores = ReturnType<typeof createDeck>
export function useDeckStore(ns: string): DeckStores {
  let store = cache.get(ns)
  if (!store) {
    store = effectScope(true).run(() => createDeck(ns))!
    cache.set(ns, store)
  }
  return store
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
    else learned.push(c)
  }
  due.sort(
    (a, b) => (getSchedule(a.id)?.dueAt ?? 0) - (getSchedule(b.id)?.dueAt ?? 0),
  )
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

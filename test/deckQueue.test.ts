import { describe, expect, it } from 'vitest'
import { planQueue } from '../src/composables/useDeckStore'
import type { WordSchedule } from '../src/composables/useSpacedRepetition'

const NOW = 1_000_000_000_000
const DAY = 86_400_000

function sched(partial: Partial<WordSchedule>): WordSchedule {
  return {
    ease: 2.5,
    interval: 1,
    dueAt: NOW + DAY,
    reps: 1,
    lapses: 0,
    ...partial,
  }
}

const cards = [
  { id: 'due1' },
  { id: 'due2' },
  { id: 'learned1' },
  { id: 'learned2' },
  { id: 'fresh1' },
  { id: 'fresh2' },
  { id: 'fresh3' },
]

describe('planQueue（复习:新词 = 1:3）', () => {
  it('复习配额为目标 3 倍，到期优先', () => {
    const store: Record<string, WordSchedule> = {
      due1: sched({ dueAt: NOW - 1000 }),
      due2: sched({ dueAt: NOW - 2000 }),
      learned1: sched({ dueAt: NOW + DAY }),
      learned2: sched({ dueAt: NOW + DAY }),
    }
    // 目标 1 → 复习配额 3：2 个到期 + 1 个已学补足
    const plan = planQueue(cards, id => store[id as string], 1, 10, NOW)
    expect(plan.reviews.map(c => c.id)).toEqual(['due2', 'due1', 'learned1'])
    expect(plan.dueCount).toBe(2)
    expect(plan.reviews).toHaveLength(3)
  })

  it('补足时记错多的优先', () => {
    const store: Record<string, WordSchedule> = {
      learned1: sched({ dueAt: NOW + DAY, lapses: 0 }),
      learned2: sched({ dueAt: NOW + DAY, lapses: 5 }),
    }
    const plan = planQueue(cards, id => store[id as string], 1, 10, NOW)
    // 配额 3：无到期，补 3 个已学…只有 2 个已学
    expect(plan.reviews.map(c => c.id)).toEqual(['learned2', 'learned1'])
    expect(plan.dueCount).toBe(0)
  })

  it('新词按剩余名额取，不足配额不硬凑', () => {
    const plan = planQueue(cards, () => undefined, 30, 2, NOW)
    expect(plan.reviews).toHaveLength(0)
    expect(plan.newWords.map(c => c.id)).toEqual(['due1', 'due2'])
  })

  it('目标 30 → 复习 90', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `w${i}` }))
    const store: Record<string, WordSchedule> = {}
    many.forEach((c, i) => {
      store[c.id] = sched({ dueAt: i < 100 ? NOW - 1 : NOW + DAY })
    })
    const plan = planQueue(many, id => store[id as string], 30, 30, NOW)
    expect(plan.reviews).toHaveLength(90)
    expect(plan.newWords).toHaveLength(0)
  })
})

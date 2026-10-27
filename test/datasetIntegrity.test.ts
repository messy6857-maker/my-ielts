import { expect, it } from 'vitest'
import { loadMockTest, mockTestList } from '../src/pages/mock/registry'
import { bandScore, multiSelectScore } from '../src/pages/mock/types'
import type { MockQuestion } from '../src/pages/mock/types'

const kinds = [
  'multiple-choice',
  'multi-select',
  'tfng',
  'fill-blank',
  'map-label',
]
it.each(mockTestList)(
  '$id keeps all 40 listening and reading score points',
  async ({ id }) => {
    const pair = await loadMockTest(id)
    for (const sections of [pair.listening.parts, pair.reading.passages]) {
      const questions: MockQuestion[] = sections.flatMap(p => p.questions)
      const points = questions.reduce(
        (n, q) =>
          n
          + (q.type === 'multi-select' && Array.isArray(q.answer)
            ? q.answer.length
            : 1),
        0,
      )
      expect(points).toBe(40)
      expect(new Set(questions.map(q => q.id)).size).toBe(questions.length)
      for (const q of questions) {
        expect(kinds).toContain(q.type)
        expect(q.answer).toBeDefined()
        expect(q.question).toBeTruthy()
      }
    }
  },
)
it('partial multi-select scores differ from zero and full credit', () => {
  const q: MockQuestion = {
    id: 'Q1-2',
    type: 'multi-select',
    question: 'Choose TWO',
    options: ['a', 'b', 'c'],
    answer: [0, 1],
  }
  expect(multiSelectScore(q, '0')).toBe(1)
  expect(multiSelectScore(q, '0,1')).toBe(2)
  expect(multiSelectScore(q, '2')).toBe(0)
})
it('band conversion is monotonic and full marks remain 9', () => {
  let previous = 0
  for (let i = 0; i <= 40; i++) {
    const band = bandScore(i)
    expect(band).toBeGreaterThanOrEqual(previous)
    previous = band
  }
  expect(bandScore(40)).toBe(9)
})
it('the four formerly duplicated-blank prompts expose exactly one blank each', async () => {
  const a = await loadMockTest('cam20-test3')
  const b = await loadMockTest('cam18-test3')
  for (const [pair, ids] of [
    [a, ['Q5', 'Q9', 'Q10']],
    [b, ['Q32']],
  ] as const) {
    for (const id of ids) {
      const q = pair.listening.parts
        .flatMap(p => p.questions)
        .find(q => q.id === id)!
      expect(q.question.match(/_{2,}/g)).toHaveLength(1)
    }
  }
})

import { expect, it } from 'vitest'
import { loadMockTest, mockTestList } from '../src/pages/mock/registry'
import { isCorrect, multiSelectScore } from '../src/pages/mock/types'

for (const item of mockTestList) {
  for (const kind of ['reading', 'listening'] as const) {
    it(`${item.id}/${kind}: unique IDs, valid answer options, maximum 40 points`, async () => {
      const pair = await loadMockTest(item.id)
      const groups = kind === 'reading' ? pair.reading.passages : pair.listening.parts
      const questions = groups.flatMap(group => group.questions)
      expect(new Set(questions.map(q => q.id)).size).toBe(questions.length)
      let total = 0
      for (const q of questions) {
        if (q.type === 'multi-select') {
          const answer = (q.answer as number[]).join(',')
          expect(multiSelectScore(q, answer)).toBe((q.answer as number[]).length)
          total += (q.answer as number[]).length
        }
        else {
          const answer = String(Array.isArray(q.answer) ? q.answer[0] : q.answer)
          expect(isCorrect(q, answer)).toBe(true)
          if (typeof q.answer === 'number') {
            expect(q.answer).toBeGreaterThanOrEqual(0)
            expect(q.answer).toBeLessThan(q.options?.length ?? 0)
          }
          total++
        }
      }
      expect(total).toBe(40)
    })
  }
}

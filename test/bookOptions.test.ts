import { expect, it } from 'vitest'
import { cam18Test2Reading } from '../src/pages/mock/cam18-test2-reading'
import { cam21Test2Reading } from '../src/pages/mock/cam21-test2-reading'
import { cam21Test3Reading } from '../src/pages/mock/cam21-test3-reading'
import { cam20Test3Reading } from '../src/pages/mock/cam20-test3-reading'

const groups = [
  {
    test: cam18Test2Reading,
    first: 24,
    answers: ['C', 'A', 'E'],
    options: [
      'medical practitioners',
      'specialised tasks',
      'available resources',
      'reduced illness',
      'professional authority',
      'technology experts',
    ],
  },
  {
    test: cam21Test2Reading,
    first: 30,
    answers: ['F', 'G', 'I', 'C', 'A', 'D'],
    options: [
      'reliability',
      'funding',
      'skills',
      'prejudices',
      'computers',
      'equality',
      'framework',
      'confidentiality',
      'approval',
    ],
  },
  {
    test: cam21Test3Reading,
    first: 31,
    answers: ['E', 'F', 'D', 'B'],
    options: [
      'Homo sapiens emerged at an earlier point in time than experts previously believed.',
      'previous assumptions about who had power in the prehistoric world were inaccurate.',
      'gender roles in extinct hominin species were different from those in Homo sapiens societies.',
      'experts may have been mistaken about who looked for food in early human communities.',
      'Homo sapiens was probably not the only species capable of sophisticated workmanship.',
      'other species managed to survive in harsh environments before the arrival of Homo sapiens.',
    ],
  },
  {
    test: cam20Test3Reading,
    first: 34,
    answers: ['C', 'B', 'D'],
    options: [
      'robots to explore outer space.',
      'advances made in machine intelligence so far.',
      'changes made to other planets for our own benefit.',
      'the harm already done by artificial intelligence.',
    ],
  },
]
for (const group of groups) {
  for (const [offset, answer] of group.answers.entries()) {
    it(`${group.test.id} Q${group.first + offset}: stored options and answer-letter regression snapshot`, () => {
      const question = group.test.passages
        .flatMap(p => p.questions)
        .find(q => q.id === `Q${group.first + offset}`)!
      expect(question.answer).toBe(answer)
      expect(question.options).toEqual(group.options)
    })
  }
}

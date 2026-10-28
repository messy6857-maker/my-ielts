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
it.each(mockTestList)(
  '$id time limits are 2400s listening and 3600s reading',
  async ({ id }) => {
    const pair = await loadMockTest(id)
    expect(pair.listening.timeLimit).toBe(2400)
    expect(pair.reading.timeLimit).toBe(3600)
  },
)
it.each(mockTestList)(
  '$id map-label answers are one letter or a roman numeral, option letters in range',
  async ({ id }) => {
    const pair = await loadMockTest(id)
    for (const sections of [pair.listening.parts, pair.reading.passages]) {
      for (const q of sections.flatMap(p => p.questions)) {
        if (q.type !== 'map-label')
          continue
        expect(typeof q.answer).toBe('string')
        const a = q.answer as string
        const isLetter = /^[A-Z]$/.test(a)
        const isRoman = a === a.toLowerCase() && /^[iv]+$/.test(a) && a.length <= 4
        expect(isLetter || isRoman).toBe(true)
        if (q.options?.length && isLetter)
          expect(a.charCodeAt(0) - 65).toBeLessThan(q.options.length)
      }
    }
  },
)
it.each(mockTestList)(
  '$id media list is complete: 4 listening audios, all images under mock/',
  async ({ id }) => {
    const pair = await loadMockTest(id)
    expect(pair.listening.parts).toHaveLength(4)
    const audios = pair.listening.parts.map(p => p.audio)
    expect(new Set(audios).size).toBe(4)
    for (const audio of audios)
      expect(audio).toMatch(/^mock\/.+\.mp3$/)
    const images = [
      ...pair.listening.parts.map(p => p.image).filter(Boolean),
      ...pair.reading.passages.map(p => p.image).filter(Boolean),
    ] as string[]
    for (const image of images)
      expect(image).toMatch(/^mock\//)
  },
)
it('heading-match answers resolve against the heading list', async () => {
  // 剑 20 Test 3 Passage 2：文本版 headings，6 道题答案须全部在列表内，
  // 唯一未用干扰项为 i（7 标题 / 6 段）。
  const cam20 = await loadMockTest('cam20-test3')
  const coral = cam20.reading.passages.find(p => p.headings?.length)!
  expect(coral).toBeDefined()
  const numerals = new Set(coral.headings!.map(h => h.split('.')[0]))
  const romanQs = coral.questions.filter(q => q.type === 'map-label')
  expect(romanQs).toHaveLength(6)
  for (const q of romanQs)
    expect(numerals.has(q.answer as string)).toBe(true)
  expect([...numerals].filter(n => !romanQs.some(q => q.answer === n))).toEqual(['i'])
  // 剑 18 Test 3：标题列表为图片，图内文字无法机核；守卫只断言题组答案
  // 均为罗马数字且该 Passage 确实挂了标题图片（MOCK-KEY-IMG 转用户实测）。
  const cam18 = await loadMockTest('cam18-test3')
  const steam = cam18.reading.passages.find(p => p.image?.includes('headings'))!
  expect(steam).toBeDefined()
  const steamRoman = steam.questions.filter(q => q.type === 'map-label')
  expect(steamRoman).toHaveLength(7)
  for (const q of steamRoman)
    expect(q.answer as string).toMatch(/^[iv]+$/)
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

import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  isValidEssayGrade,
  repairSavedGrade,
  roundHalf,
} from '../src/composables/useAISettings'
import sentences from '../src/pages/writing/100sentences'
import { analyzeEssay } from '../src/pages/writing/task1/grader'

const byNo = (no: number) => (sentences as any[]).find(s => s.no === no)

it('w1: 100-sentences ChatGPT field mistranslations are corrected', () => {
  expect(byNo(32).chatgpt).toBe(
    'The troublesome children should be allowed to be removed from the classroom by the teachers',
  )
  expect(byNo(45).chatgpt).toContain('threat to social cohesion')
  expect(byNo(45).chatgpt).not.toContain('thread to social cohesion')
})

it('w1: 100-sentences ChatGPT fields carry no Chinese commentary any more', () => {
  for (const entry of sentences as any[]) {
    if (typeof entry.chatgpt === 'string')
      expect(entry.chatgpt).not.toMatch(/[\u4E00-\u9FFF]/)
  }
  expect(byNo(29).chatgpt).toBe(
    'Rural areas provide people with opportunities to escape pressure and noise of modern life',
  )
  expect(byNo(42).chatgpt).toBe(
    'Many children are exposed to violent content on a daily basis',
  )
  expect(byNo(47).chatgpt).toBe(
    'Some people do not support genetically modified (GM) foods',
  )
  expect(byNo(52).chatgpt).toBe(
    'At times. The use of animal experiments does not reveal the adverse effects of medications',
  )
  expect(byNo(84).chatgpt).toBe(
    'The achievements of celebrities inspire young people to study hard and persevere',
  )
})

it('w1: sentence 89 keeps its Gemini provenance in data, label is fixed at the page', () => {
  expect(byNo(89).chatgpt).toContain('from Gemini')
  const src = readFileSync('src/pages/writing/index.vue', 'utf8')
  expect(src).toContain('from Gemini')
  expect(src).toContain('aiSource(currentPractice)')
  expect(src).toContain('aiSource(item)')
})

it('w2: sentence-initial that is a demonstrative, not a subordinate clause', () => {
  expect(analyzeEssay('That rose in 2020.').complexRatio).toBe(0)
  expect(analyzeEssay('That was the highest figure.').complexRatio).toBe(0)
  expect(
    analyzeEssay('The country that recorded the highest figure was China.').complexRatio,
  ).toBeGreaterThan(0)
  expect(
    analyzeEssay('The chart shows that sales rose in 2020.').complexRatio,
  ).toBeGreaterThan(0)
})

it('w3: irregular passives count as complex sentences', () => {
  for (const s of [
    'The figure was taken from the chart.',
    'The figure was built in 2020.',
    'The figure was shown in the chart.',
    'The figure was given to us.',
    'The figure was increased in 2020.',
  ])
    expect(analyzeEssay(s).complexRatio).toBeGreaterThan(0)
})

it('w4: a wrong self-grade un-masters the sentence in the same flow', () => {
  const src = readFileSync('src/pages/writing/index.vue', 'utf8')
  expect(src).toContain('if (isMastered(item.no))')
})

it('w5: sentence list keys are unique across items and chapter headers', () => {
  const src = readFileSync('src/pages/writing/index.vue', 'utf8')
  expect(src).toMatch(/:key="item\.no \?\? `sec-\$\{item\.title\}`"/)
  const rows = sentences as any[]
  expect(rows.filter(s => s.no == null)).toHaveLength(12)
  const keys = rows.map(s => s.no ?? `sec-${s.title}`)
  expect(new Set(keys).size).toBe(keys.length)
})

it('w6: book answers and remarks typos are corrected', () => {
  expect(byNo(21).sentence).not.toMatch(/^\s/)
  expect(byNo(31).sentence).not.toMatch(/^\s/)
  expect(byNo(92).translationFromBook).not.toMatch(/^\s/)
  expect(byNo(58).translationFromBook).toContain('the economic outlook')
  expect(byNo(83).translationFromBook).toContain('students\' concentration')
  expect(byNo(83).translationFromBook).not.toContain('students\'s')
  expect(byNo(41).translationFromBook).toBe(
    'Most environmental degradation is attributed to human activities.',
  )
  expect(byNo(51).translationFromBook).toContain('low-cost carriers')
  expect(byNo(91).translationFromBook).toContain('cut down on the use of energy')
  expect(byNo(91).translationFromBook).not.toContain('reduce cut down')
  expect(byNo(37).remark).toContain('well-being')
  expect(byNo(37).remark).not.toContain('well-bing')
})

function essayGrade(overall: number, first = 6) {
  return {
    scores: {
      ta: first,
      cc: 6,
      lr: 6,
      gra: 6,
      overall,
    },
    comments: { ta: 'a', cc: 'b', lr: 'c', gra: 'd' },
    corrections: [],
    suggestion: 's',
  }
}

it('w7: essay overall must be consistent with the four criteria', () => {
  expect(isValidEssayGrade(essayGrade(6), 'task1')).toBe(true)
  expect(isValidEssayGrade(essayGrade(6.5), 'task1')).toBe(true)
  expect(isValidEssayGrade(essayGrade(7), 'task1')).toBe(false)
  expect(isValidEssayGrade(essayGrade(9), 'task1')).toBe(false)
  expect(roundHalf(6.25)).toBe(6.5)
  expect(repairSavedGrade(essayGrade(9) as any, 'task1')!.scores.overall).toBe(6)
  expect(repairSavedGrade(essayGrade(7) as any, 'task1')!.scores.overall).toBe(6)
  const uneven = {
    scores: {
      ta: 6,
      cc: 6,
      lr: 6,
      gra: 7,
      overall: 9,
    },
    comments: { ta: 'a', cc: 'b', lr: 'c', gra: 'd' },
    corrections: [],
    suggestion: 's',
  }
  expect(repairSavedGrade(uneven as any, 'task1')!.scores.overall).toBe(6.5)
  const task2 = {
    scores: {
      tr: 6,
      cc: 6,
      lr: 6,
      gra: 6,
      overall: 9,
    },
    comments: { tr: 'a', cc: 'b', lr: 'c', gra: 'd' },
    corrections: [],
    suggestion: 's',
  }
  expect(isValidEssayGrade(task2, 'task2')).toBe(false)
  const repaired2 = repairSavedGrade(task2 as any, 'task2')!
  expect(repaired2.scores.overall).toBe(6)
  expect((repaired2.scores as any).ta).toBe(6)
})

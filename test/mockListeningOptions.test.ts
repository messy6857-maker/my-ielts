import { expect, it } from 'vitest'
import { cam19Test2Listening } from '../src/pages/mock/cam19-test2-listening'
import { cam20Test4Listening } from '../src/pages/mock/cam20-test4-listening'

const FOOTWEAR_OPTIONS = [
  'one shoe was missing',
  'the colour of one shoe had faded',
  'one shoe had a hole in it',
  'the shoes were brand new',
  'the shoes were too dirty',
  'the stitching on the shoes was broken',
]
const FOOTBALL_OPTIONS = [
  'The introduction of pay for the players',
  'a change to the design of the goal',
  'the first use of lights for matches',
  'the Introduction of goalkeepers',
  'the first International match',
  'two changes to the rules of the game',
  'the introduction of a fee for spectators',
  'an agreement on the length of a game',
]

function groupOf(test: any, ids: string[]) {
  const all = test.parts.flatMap((p: any) => p.questions)
  return ids.map(id => all.find((q: any) => q.id === id)!)
}

it('cam19-test2 听力 Q25-28 组内每题均有配对选项框（B4）', () => {
  const group = groupOf(cam19Test2Listening, ['Q25', 'Q26', 'Q27', 'Q28'])
  for (const q of group) {
    expect(q.type).toBe('map-label')
    expect(q.options).toEqual(FOOTWEAR_OPTIONS)
  }
  // 选项文本不带字母前缀（渲染层自加 A. B. …），避免双字母。
  for (const opt of FOOTWEAR_OPTIONS)
    expect(opt).not.toMatch(/^[A-F] /)
  expect(group.map(q => q.answer)).toEqual(['E', 'B', 'A', 'C'])
  expect(group[0].question).toContain('Reasons:')
  expect(group[1].question).toBe('the ankle boots')
  expect(group[2].question).toBe('the baby shoes')
  expect(group[3].question).toBe('the trainers')
})

it('cam20-test4 听力 Q15-20 组内每题均有配对选项框（B4）', () => {
  const group = groupOf(cam20Test4Listening, ['Q15', 'Q16', 'Q17', 'Q18', 'Q19', 'Q20'])
  for (const q of group) {
    expect(q.type).toBe('map-label')
    expect(q.options).toEqual(FOOTBALL_OPTIONS)
  }
  for (const opt of FOOTBALL_OPTIONS)
    expect(opt).not.toMatch(/^[A-H] /)
  expect(group.map(q => q.answer)).toEqual(['D', 'F', 'B', 'H', 'C', 'G'])
  expect(group[0].question).toContain('Choose from the box:')
  for (const q of group.slice(1))
    expect(q.question).toContain('See box in Q15')
})

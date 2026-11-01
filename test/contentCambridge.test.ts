import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { cam20Writing } from '../src/pages/writing/cam20'
import { cam21Test1Reading } from '../src/pages/mock/cam21-test1-reading'
import reading538 from '../src/pages/reading/reading538words'

function count(hay: string, needle: string) {
  return hay.split(needle).length - 1
}

it('C1: cam20 Test1 Task2 prompt has no duplicated instruction or reasons line', () => {
  const task = cam20Writing.find(t => t.id === 'c20-t1-task2')!
  expect(count(task.promptEn, 'You should spend about 40 minutes')).toBe(1)
  expect(count(task.promptEn, 'Give reasons for your answer')).toBe(1)
  expect(count(task.promptEn, 'Write at least 250 words')).toBe(1)
  const order = [
    'You should spend about 40 minutes',
    'Write about the following topic:',
    'Access to clean water',
    'Do you agree or disagree?',
    'Give reasons for your answer',
    'Write at least 250 words',
  ]
  let last = -1
  for (const frag of order) {
    const i = task.promptEn.indexOf(frag)
    expect(i).toBeGreaterThan(last)
    last = i
  }
})

it('C2: writing chart and reading passage images fail with a message, not a broken icon', () => {
  const taskOne = readFileSync('src/pages/writing/task1/TaskOne.vue', 'utf8')
  expect(taskOne).toContain('@error="imageFailed = true"')
  expect(taskOne).toContain('图表加载失败，请检查网络后刷新页面')
  const reading = readFileSync('src/pages/mock/reading-test.vue', 'utf8')
  expect(reading).toContain('passageImageFailed[pi] = true')
  expect(reading).toContain('passageImageFailed[activePassage] = true')
  expect(count(reading, '示意图加载失败，请检查网络后刷新页面')).toBe(2)
})

it('C3: writing comments point at the media station, not public/writing', () => {
  for (const f of [
    'src/pages/writing/cam18.ts',
    'src/pages/writing/cam19.ts',
    'src/pages/writing/cam20.ts',
    'src/pages/writing/cam21.ts',
  ]) {
    const src = readFileSync(f, 'utf8')
    expect(src).toContain('MEDIA_BASE')
    expect(src).not.toContain('public/writing')
  }
  const cambridge = readFileSync('src/pages/writing/cambridge.ts', 'utf8')
  expect(cambridge).toContain('媒体站路径')
  expect(cambridge).not.toContain('public 路径')
})

it('C4: reading-test comment no longer claims there are no options fields', () => {
  const src = readFileSync('src/pages/mock/reading-test.vue', 'utf8')
  expect(src).not.toContain('尚无 options 字段')
  expect(src).toContain('已有 map-label options 字段')
})

it('C5: evidence comments are narrowed to the questions the evidence set covers', () => {
  const heads: Array<[string, string]> = [
    ['src/pages/mock/cam18-test2-reading.ts', '仅 Q24-26'],
    ['src/pages/mock/cam20-test3-reading.ts', '仅 Q34-36'],
    ['src/pages/mock/cam21-test2-reading.ts', '仅 Q30-35'],
    ['src/pages/mock/cam21-test3-reading.ts', '仅 Q31-34'],
  ]
  for (const [file, scope] of heads) {
    const src = readFileSync(file, 'utf8')
    expect(src).toContain(scope)
    expect(src).toContain('其余题仅转录自 PDF + 书后 key')
  }
  expect(readFileSync('src/pages/mock/cam18-test2-reading.ts', 'utf8')).not.toContain('全部 40 题逐题核对')
  expect(readFileSync('src/pages/mock/cam18-test2-listening.ts', 'utf8')).not.toContain('全部 80 题逐题核对')
  // 精确到书页的“verified against printed page”备注是已采信的证据表述，不动
  expect(readFileSync('src/pages/mock/cam21-test3-reading.ts', 'utf8')).toContain('verified against printed page')
  expect(readFileSync('src/pages/mock/cam20-test3-reading.ts', 'utf8')).toContain('verified against printed page')
})

it('C7: reading flashcards carry the remark the vocabulary page shows', () => {
  const flashcard = readFileSync('src/pages/reading/flashcard.vue', 'utf8')
  expect(flashcard).toContain('remark: w[5]')
  const component = readFileSync('src/components/KeywordFlashcard.vue', 'utf8')
  expect(component).toContain('remark?: string')
  expect(component).toContain('studying.remark')
})

it('C8: reading vocabulary fixes and phrase labels', () => {
  const all = (reading538 as unknown as Array<{ words: Array<[number, string, string[], string[], string[], string]> }>).flatMap(c => c.words)
  const entry102 = all.find(w => w[0] === 102)!
  expect(entry102[2]).toEqual(['v.'])
  expect(entry102[3]).toEqual(['查阅,商量,请教,咨询'])
  const empty = all.filter(w => w[2].length === 0 || (w[2].length === 1 && w[2][0] === ''))
  expect(empty).toHaveLength(14)
  expect(empty.every(w => w[1].includes(' '))).toBe(true)
  expect(readFileSync('src/pages/reading/538keyword.md', 'utf8')).toContain('## 第 2 类考点词')
  expect(readFileSync('src/pages/reading/538keyword.md', 'utf8')).not.toContain('## 第 2 类观点词')
  const index = readFileSync('src/pages/reading/index.vue', 'utf8')
  expect(index).toContain('!w[2].join(\' \').trim()')
  expect(readFileSync('src/pages/reading/flashcard.vue', 'utf8')).toContain('|| \'短语\'')
})

it('C9: star markers never reach pronunciation audio or dictionary URLs', () => {
  const all = (reading538 as unknown as Array<{ words: Array<[number, string, string[], string[], string[], string]> }>).flatMap(c => c.words)
  expect(all.filter(w => w[1].includes('*')).map(w => w[1])).toEqual([
    'that*',
    'and*',
    'rather than*',
    'thanks to*',
  ])
  const flashcard = readFileSync('src/pages/reading/flashcard.vue', 'utf8')
  expect(flashcard).toContain('word.replace(/\\*/g, \'\')')
  const index = readFileSync('src/pages/reading/index.vue', 'utf8')
  expect(index).toContain('w[1].replace(/\\*/g, \'\')')
  expect(index).toContain('word.replace(/\\*/g, \'\')')
})

it('C10: cam21-test1 reading header matches current stored answers, without claiming verification', () => {
  const questions = cam21Test1Reading.passages.flatMap(p => p.questions)
  const answerOf = (id: string) => questions.find(q => q.id === id)!.answer
  expect([answerOf('Q14'), answerOf('Q15'), answerOf('Q16'), answerOf('Q17')]).toEqual(['C', 'B', 'A', 'G'])
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
  const q31to36 = ['Q31', 'Q32', 'Q33', 'Q34', 'Q35', 'Q36'].map(id => letters[answerOf(id) as number])
  expect(q31to36).toEqual(['H', 'E', 'I', 'A', 'G', 'C'])
  const src = readFileSync('src/pages/mock/cam21-test1-reading.ts', 'utf8')
  expect(src).toContain('Q14-17 为段落配对（A-G），答案存为字母')
  expect(src).not.toContain('Q14-17 为段落配对（A-G），答案存为下标')
  expect(src).not.toContain('33.A/34.G/35.A')
  expect(src).toContain('仍待与书后 key 核对')
})

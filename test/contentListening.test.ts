import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import corpusData from '../src/pages/listening/spelling_convention'
import words179 from '../src/pages/listening/listening179.json'
import { cam19Test1ListeningTranscript } from '../src/pages/mock/cam19-test1-listening-transcript'
import { transcriptSentenceEntries } from '../src/utils/text'

interface Chapter { rows: string[][] }
const chapters = corpusData as unknown as Record<string, Chapter>
const ch2 = chapters['Chapter2 拼写规范'].rows
const ch4 = chapters['Chapter4 形容词副词'].rows

it('L1: corpus British spellings are criticise and skilful, not the misspellings', () => {
  const joined = ch2.map(r => r.join(' | '))
  expect(joined.some(r => r.includes('critcise') || r.includes('critcize'))).toBe(false)
  // skilful 本身以 skilfu 开头，必须按逗号切分的整词比对，不能用子串
  expect(ch2.some(r => r[0].split(', ').includes('skilfu'))).toBe(false)
  expect(ch2.find(r => r[0].includes('criticise'))?.[0]).toBe('criticise, criticize')
  expect(ch2.find(r => r[0] === 'skilful')?.[1]).toBe('skillful, skilful')
})

it('L2: corpus has no duplicate rows and totals 211 after dedup', () => {
  const all = Object.values(chapters).flatMap(c => c.rows.map(r => JSON.stringify(r)))
  expect(new Set(all).size).toBe(all.length)
  expect(all.length).toBe(211)
  expect(ch4.filter(r => r[0] === 'immense')).toHaveLength(1)
  expect(ch4.filter(r => r[0] === 'tedious')).toHaveLength(1)
  // 不凭空补 immensely/tediously：副词原形仍待对书确认，只删确定的重复行
  expect(ch4.map(r => r[0])).not.toContain('immensely')
  expect(ch4.map(r => r[0])).not.toContain('tediously')
})

it('L2+L9: Chapter4 first cells are unique, so word-based card ids cannot collide', () => {
  const firsts = ch4.map(r => r[0])
  expect(new Set(firsts).size).toBe(firsts.length)
  expect(firsts.every(w => !/[\s,]/.test(w))).toBe(true)
})

it('L9: corpus table key is the joined spelling string, not the split array object', () => {
  const src = readFileSync('src/pages/listening/corpus.vue', 'utf8')
  expect(src).toContain(':key="row[0].join(\', \')"')
  expect(src).not.toContain(':key="row[0]"')
})

it('L10: punctual is an adjective, punctually the adverb', () => {
  expect(ch4.find(r => r[0] === 'punctual')?.[1]).toBe('adj.')
  expect(ch4.find(r => r[0] === 'punctually')?.[1]).toBe('adv.')
})

it('L3: MARIE is recognised as a speaker and not read aloud as text', () => {
  const entries = transcriptSentenceEntries('MARIE: Hello there. COLIN: Hi.')
  expect(entries.map(e => e.speaker)).toEqual(['MARIE', 'COLIN'])
  expect(entries[0].text).toBe('Hello there.')
  expect(entries[0].display).toBe('MARIE: Hello there.')
})

it('L3: real cam19-test1 part3 separates MARIE and COLIN turns with no label leaks', () => {
  // 白名单与分隔符缺一不可：只补白名单时，part3 的字面 \\n 分隔符仍会让
  // (?:^|\\s) 锚点失效，全部句子挂在首个 COLIN 名下并漏出 MARIE: 前缀
  const entries = transcriptSentenceEntries(cam19Test1ListeningTranscript.part3)
  expect(entries.some(e => e.speaker === 'MARIE')).toBe(true)
  expect(entries.some(e => e.speaker === 'COLIN')).toBe(true)
  expect(entries.filter(e => e.text.includes('MARIE:') || e.text.includes('COLIN:'))).toHaveLength(0)
  // part3 运行时文本应为真换行，不含任何字面反斜杠转义残留
  expect(cam19Test1ListeningTranscript.part3).toContain('\n')
  expect(cam19Test1ListeningTranscript.part3).not.toContain('\\')
})

it('L4: cam21 question markers and PART titles are not sentences', () => {
  const entries = transcriptSentenceEntries(
    'She was very friendly. Q1\nPART 1\nWe discussed skills. Q2 Q3\nThe chart shows growth. Q21/22',
  )
  expect(entries.map(e => e.text)).toEqual([
    'She was very friendly.',
    'We discussed skills.',
    'The chart shows growth.',
  ])
})

it('L4: the marker filter does not eat real sentences mentioning Q or Part', () => {
  const entries = transcriptSentenceEntries(
    'The Q1 report was long. Part 1: Introduction to the topic.',
  )
  expect(entries.map(e => e.text)).toEqual([
    'The Q1 report was long.',
    'Part 1: Introduction to the topic.',
  ])
})

it('L5: 179 main-word comparison folds whitespace on both sides', () => {
  const src = readFileSync('src/pages/listening/179practice.vue', 'utf8')
  expect(src).toContain('cw.form.word.trim().toLowerCase().replace(/\\s+/g, \' \')')
  expect(src).toContain('cw.word.trim().toLowerCase().replace(/\\s+/g, \' \')')
})

it('L6: 179 progress records each row studied (D-2, not furthest reached)', () => {
  const src = readFileSync('src/pages/listening/179practice.vue', 'utf8')
  expect(src).toContain('markListening179RowStudied(cw.index)')
  expect(src).not.toContain('Math.max(getProgress(\'listening\').done, index + 1)')
})

it('L7: no 179 word lists itself as its own synonym', () => {
  for (const w of words179 as unknown as Array<{ word: string; replace: string[] }>) {
    expect(w.replace).not.toContain(w.word)
    expect(w.replace.length).toBeGreaterThan(0)
  }
  const decrease = (words179 as unknown as Array<{ word: string; replace: string[] }>).find(w => w.word === 'decrease')!
  const ancient = (words179 as unknown as Array<{ word: string; replace: string[] }>).find(w => w.word === 'ancient')!
  expect(decrease.replace).toEqual(['lower', 'reduce', 'fewer', 'drop', 'fall'])
  expect(ancient.replace).toEqual(['medieval', 'in the past', 'once', 'historical', 'old', 'former'])
})

it('L8: every empty-type 179 word is a phrase, and both views label it 短语', () => {
  const empty = (words179 as unknown as Array<{ word: string; type: string }>).filter(w => !w.type)
  expect(empty).toHaveLength(17)
  expect(empty.every(w => w.word.includes(' '))).toBe(true)
  expect(readFileSync('src/pages/listening/keyword.vue', 'utf8')).toContain('{{ w.type || \'短语\' }}')
  expect(readFileSync('src/pages/listening/flashcard.vue', 'utf8')).toContain('pos: w.type || \'短语\'')
})

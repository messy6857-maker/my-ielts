import { describe, expect, it } from 'vitest'
import { synonymPosData } from '../src/pages/vocabulary/synonymPos'

// 2026-10-27 Datamuse 全表重建后的回归：旧表把一批常见形容词标成 n./v.。
describe('synonymPosData (Datamuse rebuild)', () => {
  it.each([
    ['difficult', 'adj.'],
    ['easy', 'adj.'],
    ['eat', 'v.'],
    ['happy', 'adj.'],
    ['big', 'adj.'],
    ['small', 'adj.'],
    ['early', 'adj.'],
    ['bad', 'adj.'],
    ['late', 'adj.'],
    ['fast', 'adv.'],
    ['aberrant', 'adj.'],
    ['abject', 'adj.'],
  ])('%s is %s', (word, pos) => {
    expect(synonymPosData[word]).toBe(pos)
  })
  it('only uses known part-of-speech values', () => {
    const allowed = new Set(['n.', 'v.', 'adj.', 'adv.', 'interj.', 'pron.', 'prep.'])
    for (const [word, pos] of Object.entries(synonymPosData))
      expect(allowed.has(pos), `${word}: ${pos}`).toBe(true)
  })
  it('keeps 7781 entries after the 2026-10-27 rebuild (7795 minus 14 Datamuse-unmatched)', () => {
    expect(Object.keys(synonymPosData).length).toBe(7781)
  })
})

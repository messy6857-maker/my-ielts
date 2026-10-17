import { describe, expect, it } from 'vitest'
import { getWordInfo, getWordInfoWithFallback } from '../src/composables/useWordInfo'
import type { WordSentence } from '../src/pages/vocabulary/wordSentences'

const DATA: Record<string, WordSentence> = {
  atmosphere: {
    ex: ['The atmosphere for the football match was great.'],
    exFrom: '',
    syn: ['ambiance', 'air'],
  },
  horizon: { ex: [], exFrom: '', syn: ['skyline'] },
  horizontal: {
    ex: ['The horizon is horizontal.'],
    exFrom: '',
    syn: [],
  },
}

describe('getWordInfo', () => {
  it('命中返回例句和同义词', () => {
    const info = getWordInfo('atmosphere', DATA)
    expect(info).not.toBeNull()
    expect(info!.examples).toEqual(['The atmosphere for the football match was great.'])
    expect(info!.synonyms).toEqual(['ambiance', 'air'])
    expect(info!.word).toBe('atmosphere')
  })

  it('大小写与空格不敏感', () => {
    expect(getWordInfo(' Atmosphere ', DATA)!.word).toBe('atmosphere')
  })

  it('exFrom 指向派生词时 word 为派生词', () => {
    const data: Record<string, WordSentence> = {
      ...DATA,
      horizon: { ex: ['A horizontal line.'], exFrom: 'horizontal', syn: [] },
    }
    expect(getWordInfo('horizon', data)!.word).toBe('horizontal')
  })

  it('无数据返回 null', () => {
    expect(getWordInfo('xyz', DATA)).toBeNull()
    expect(getWordInfo('', DATA)).toBeNull()
  })
})

describe('getWordInfoWithFallback', () => {
  it('本词无例句时用派生词的例句', () => {
    // horizon 本身无例句 → 用 horizontal 的
    const info = getWordInfoWithFallback(['horizon', 'horizontal'], DATA)
    expect(info!.word).toBe('horizontal')
    expect(info!.examples).toEqual(['The horizon is horizontal.'])
  })

  it('本词有例句时优先本词', () => {
    const info = getWordInfoWithFallback(['atmosphere', 'horizontal'], DATA)
    expect(info!.word).toBe('atmosphere')
  })

  it('都没有例句时返回有同义词的', () => {
    const info = getWordInfoWithFallback(['horizon', 'xyz'], DATA)
    expect(info!.word).toBe('horizon')
    expect(info!.examples).toEqual([])
    expect(info!.synonyms).toEqual(['skyline'])
  })

  it('全无返回 null', () => {
    expect(getWordInfoWithFallback(['xyz', 'abc'], DATA)).toBeNull()
  })
})

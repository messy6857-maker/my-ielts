import { describe, expect, it, vi } from 'vitest'
import {
  deinflect,
  lookupVocabularyMeaning,
} from '../src/pages/vocabulary/loadVocabulary'

describe('deinflect', () => {
  it('复数还原', () => {
    expect(deinflect('changes')).toContain('change')
    expect(deinflect('watches')).toContain('watch')
    expect(deinflect('studies')).toContain('study')
    expect(deinflect('cats')).toContain('cat')
  })
  it('过去式/进行时还原', () => {
    expect(deinflect('walked')).toContain('walk')
    expect(deinflect('liked')).toContain('like')
    expect(deinflect('stopped')).toContain('stop')
    expect(deinflect('making')).toContain('make')
    expect(deinflect('running')).toContain('run')
    expect(deinflect('tried')).toContain('try')
  })
  it('原形不产生候选', () => {
    expect(deinflect('change')).toEqual([])
    expect(deinflect('walk')).toEqual([])
  })
})

describe('lookupVocabularyMeaning', () => {
  it('精确命中返回释义和词性', async () => {
    const hit = await lookupVocabularyMeaning('atmosphere')
    expect(hit).not.toBeNull()
    expect(hit!.meaning).toContain('大气层')
    expect(hit!.pos).toBe('n.')
  })
  it('大小写不敏感', async () => {
    const hit = await lookupVocabularyMeaning('Atmosphere')
    expect(hit).not.toBeNull()
    expect(hit!.meaning).toContain('大气层')
  })
  it('复数/过去式去词形后命中', async () => {
    const plural = await lookupVocabularyMeaning('atmospheres')
    expect(plural).not.toBeNull()
    expect(plural!.meaning).toContain('大气层')
    const past = await lookupVocabularyMeaning('cultivated')
    expect(past).not.toBeNull()
    expect(past!.meaning).toContain('耕')
  })
  it('词库没有的词返回 null', async () => {
    const hit = await lookupVocabularyMeaning('zzznothere')
    expect(hit).toBeNull()
  })
  it('空字符串返回 null', async () => {
    await expect(lookupVocabularyMeaning('')).resolves.toBeNull()
    await expect(lookupVocabularyMeaning('  ')).resolves.toBeNull()
  })
})

it('retries after a chapter loader fails instead of caching an empty dictionary', async () => {
  vi.resetModules()
  vi.doMock('../src/pages/vocabulary/chapters/01_自然地理.json', () => {
    throw new Error('chapter load failed')
  })
  const { lookupVocabularyMeaning: lookup } = await import('../src/pages/vocabulary/loadVocabulary')
  try {
    await expect(lookup('atmosphere')).rejects.toThrow()
  }
  finally {
    vi.doUnmock('../src/pages/vocabulary/chapters/01_自然地理.json')
  }
  await expect(lookup('atmosphere')).resolves.toMatchObject({ pos: 'n.' })
})

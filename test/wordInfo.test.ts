import { describe, expect, it } from 'vitest'
import { extractWordInfo } from '../src/composables/useWordInfo'

const FIXTURE = [
  {
    word: 'atmosphere',
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          {
            definition: 'The gases surrounding the Earth.',
            example: 'The atmosphere is composed of nitrogen and oxygen.',
            synonyms: ['air'],
          },
          {
            definition: 'A mood.',
            example: 'The atmosphere was tense.',
            synonyms: ['mood', 'ambience', 'air'],
          },
        ],
        synonyms: ['aerosphere'],
      },
    ],
  },
]

describe('extractWordInfo', () => {
  it('抽出例句与同义词，含词例句优先', () => {
    const info = extractWordInfo('atmosphere', FIXTURE)
    expect(info).not.toBeNull()
    expect(info!.word).toBe('atmosphere')
    // 两条例句都含 atmosphere，去重后保留
    expect(info!.examples.length).toBe(2)
    expect(info!.examples[0]).toContain('atmosphere')
    // 同义词去重（air 出现两次只保留一次）
    expect(info!.synonyms).toEqual(['aerosphere', 'air', 'mood', 'ambience'])
  })

  it('无例句无同义词返回 null', () => {
    expect(extractWordInfo('xyz', [{ word: 'xyz', meanings: [] }])).toBeNull()
    expect(extractWordInfo('xyz', {})).toBeNull()
    expect(extractWordInfo('xyz', [])).toBeNull()
  })

  it('例句最多 3 条、同义词最多 8 个', () => {
    const defs = Array.from({ length: 10 }, (_, i) => ({
      definition: `d${i}`,
      example: `example sentence ${i}`,
      synonyms: [`syn${i}`, `common`],
    }))
    const info = extractWordInfo('test', [{ word: 'test', meanings: [{ definitions: defs }] }])
    expect(info!.examples.length).toBe(3)
    expect(info!.synonyms.length).toBe(8)
  })
})

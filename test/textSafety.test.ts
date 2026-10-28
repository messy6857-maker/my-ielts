import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TextHighlights from '../src/components/TextHighlights.vue'
import { extractJson, highlightPieces, splitSentences } from '../src/utils/text'
import { resolveMediaUrl } from '../src/composables/useAudio'

describe('text parsing and presentation', () => {
  it.each([
    ['prefix {"a":1} {"b":2}', { a: 1 }],
    ['{"text":"a } b { \\\" quoted"} trailing }', { text: 'a } b { " quoted' }],
    ['```json\n{"nested":{"a":2}}\n``` note }', { nested: { a: 2 } }],
  ])('extracts the first complete JSON from %s', (raw, expected) => {
    expect(JSON.parse(extractJson(raw))).toEqual(expected)
  })
  it('reports missing JSON', () =>
    expect(() => extractJson('nothing')).toThrow())
  it('does not split titles, decimals, times or initialisms', () =>
    expect(
      splitSentences('Dr. Smith paid 2.30 at 2:30 p.m. today. Next sentence!'),
    ).toEqual(['Dr. Smith paid 2.30 at 2:30 p.m. today.', 'Next sentence!']))
  it('splits an unlabelled monologue', () =>
    expect(
      splitSentences('First sentence. Second sentence? Last sentence!'),
    ).toHaveLength(3))
  it('does not highlight English words inside other words, but keeps Chinese substring matching', () => {
    const pieces = highlightPieces('The art in this part will fall, falling fast', ['art', 'fall'])
    expect(pieces.filter(p => p.highlighted).map(p => p.text)).toEqual(['art', 'fall'])
    const cn = highlightPieces('学习中文艺术', ['中文'])
    expect(cn.filter(p => p.highlighted).map(p => p.text)).toEqual(['中文'])
    const phrase = highlightPieces('hello world, say hello worldwide', ['hello world'])
    expect(phrase.filter(p => p.highlighted).map(p => p.text)).toEqual(['hello world'])
  })
  it('keeps original text through overlapping highlights', () => {
    const text = 'hello world mark <img src=x onerror=alert(1)>'
    expect(
      highlightPieces(text, ['hello world', 'world', 'mark'])
        .map(p => p.text)
        .join(''),
    ).toBe(text)
    const w = mount(TextHighlights, {
      props: { text, words: ['hello world', 'world', 'mark'] },
    })
    expect(w.text()).toBe(text)
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('mark mark').exists()).toBe(false)
    w.unmount()
  })
  it('encodes reserved filename characters and normalizes leading slash', () => {
    const url = new URL(resolveMediaUrl('/folder/a#b?c d.mp3'))
    expect(url.hash).toBe('')
    expect(url.search).toBe('')
    expect(url.pathname).toContain('/folder/a%23b%3Fc%20d.mp3')
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureWordPhonetics, phonetic } from '../src/pages/vocabulary/vocabExtras'
import { wordPhonetics } from '../src/pages/vocabulary/wordPhonetics'

describe('内置音标表', () => {
  it('每条都是 /…/ 包起来的音标，不含中文', () => {
    for (const [word, p] of Object.entries(wordPhonetics)) {
      expect(word, word).toBe(word.trim().toLowerCase())
      expect(p, word).toMatch(/^\/[^/]+\/$/)
      expect(p, word).not.toMatch(/[一-鿿]/)
    }
  })

  it('词汇表里绝大多数单词都有音标', () => {
    const dir = join(__dirname, '../src/pages/vocabulary/chapters')
    const words = new Set<string>()
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const group of data.words) {
        for (const w of group)
          words.add(w.word[0].trim().toLowerCase())
      }
    }
    const missing = [...words].filter(w => !wordPhonetics[w])
    expect(missing.length / words.size).toBeLessThan(0.02)
  })

  it('phonetic() 不分大小写，查不到返回空', async () => {
    await ensureWordPhonetics()
    expect(phonetic('  Atmosphere ')).toBe(wordPhonetics.atmosphere)
    expect(phonetic('not-a-real-word-xyz')).toBe('')
  })
})

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { nsKey, useMistakes } from '../src/composables/useStudyData'
import corpusData from '../src/pages/listening/spelling_convention'
import { buildCorpusWords, closestSpelling, markMissed, matchSpelling, pickRound } from '../src/utils/corpusSpelling'

const words = buildCorpusWords(corpusData as any)
const byWord = (w: string) => words.find(x => x.word === w)!

describe('corpus words and checking', () => {
  it('reads all three chapters with the same ids as the self-test cards', () => {
    const raw = corpusData as any
    expect(words.filter(w => w.chapter === 'ch2')).toHaveLength(raw['Chapter2 拼写规范'].rows.length)
    expect(words.filter(w => w.chapter === 'ch3')).toHaveLength(raw['Chapter3 特别名词'].rows.length)
    expect(words.filter(w => w.chapter === 'ch4')).toHaveLength(raw['Chapter4 形容词副词'].rows.length)
    expect(new Set(words.map(w => w.id)).size).toBe(words.length)
    expect(byWord('acknowledgement')).toMatchObject({
      id: 'ch2-0',
      accepted: ['acknowledgement', 'acknowledgment'],
      meaning: '承认；谢礼',
    })
    expect(byWord('accommodation')).toMatchObject({ chapter: 'ch3', note: '双 c 双 m' })
    expect(byWord('convenient')).toMatchObject({ id: 'ch4-convenient', pos: 'adj.' })
    // 一格里有两种写法
    expect(byWord('annex').accepted).toEqual(['annex', 'annexe'])
  })

  it('british and American spellings both count; case and spaces are ignored', () => {
    const w = byWord('aluminium')
    expect(matchSpelling('Aluminium ', w)).toBe('aluminium')
    expect(matchSpelling('aluminum', w)).toBe('aluminum')
    expect(matchSpelling('aluminim', w)).toBeNull()
    expect(matchSpelling('  ', w)).toBeNull()
  })

  it('marks exactly the letters that were missed or wrong', () => {
    const marked = (input: string, answer: string) => markMissed(input, answer).map(c => c.ok
      ? c.char
      : `[${c.char}]`).join('')
    expect(marked('acommodation', 'accommodation')).toBe('ac[c]ommodation')
    expect(marked('acomodation', 'accommodation')).toBe('ac[c]om[m]odation')
    expect(marked('Rythm', 'rhythm')).toBe('r[h]ythm')
    expect(marked('', 'cat')).toBe('[c][a][t]')
    // 对照最接近的写法：写成美式少个 u 时对照 aluminum
    expect(closestSpelling('aluminm', byWord('aluminium'))).toBe('aluminum')
  })

  it('a round is a shuffled subset of the chosen words', () => {
    const round = pickRound(words, 10)
    expect(round).toHaveLength(10)
    expect(new Set(round.map(w => w.id)).size).toBe(10)
    expect(pickRound(words.slice(0, 3))).toHaveLength(3)
  })
})

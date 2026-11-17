import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { useDeckStore } from '../src/composables/useDeckStore'
import { nsKey, useMistakes, useProgress } from '../src/composables/useStudyData'
import listening179 from '../src/pages/listening/listening179.json'
import corpusData from '../src/pages/listening/spelling_convention'
import SpellPage from '../src/pages/study/spell.vue'
import * as loader from '../src/pages/vocabulary/loadVocabulary'
import {
  diffSpelling,
  matchSpelling,
  missingSynonyms,
  mistakenCards,
  pickSpellRound,
  spellMistake,
  todayCards,
  typedWrong,
} from '../src/utils/spellPractice'
import { readRecords, saveValue } from '../src/utils/storage'
import { corpusCards, listeningCards, vocabularyCards } from '../src/utils/studyDeck'
import { addToWordList, readWordList } from '../src/utils/wordList'

const listening = listeningCards(listening179 as any)
const corpus = corpusCards(corpusData as any)
const vocab = (word: string[], id = 1, chapter = '01_x') => vocabularyCards({ [chapter]: { words: [[{ id, word, pos: 'n.', meaning: '释义', example: 'An example.' }]] } }, () => chapter)[0]

describe('one set of checking rules for every way of practising', () => {
  it('case and extra spaces are ignored; every accepted spelling counts', () => {
    const card = vocab(['colour', 'color'])
    expect(matchSpelling('  COLOR ', card)).toBe('color')
    expect(matchSpelling('colour', card)).toBe('colour')
    expect(matchSpelling('colr', card)).toBeNull()
    expect(matchSpelling('   ', card)).toBeNull()
    const phrase = listening.find(c => c.word.includes(' '))!
    expect(matchSpelling(phrase.word.replace(' ', '   '), phrase)).toBe(phrase.word)
    const british = corpus.find(c => c.spellings.length > 1)!
    for (const s of british.spellings)
      expect(matchSpelling(s.toUpperCase(), british)).toBe(s)
  })

  it('a wrong answer is compared with the closest accepted spelling and the missed letters are marked', () => {
    const card = vocab(['colour', 'color'])
    expect(diffSpelling('colr', card).map(c => c.char).join('')).toBe('color')
    expect(diffSpelling('colr', card).filter(c => !c.ok).map(c => c.char)).toEqual(['o'])
  })

  it('synonyms: every 179 row passes when its synonyms are written in lower case, with either comma', () => {
    for (const card of listening) {
      expect(missingSynonyms(card.synonyms.join(', ').toLowerCase(), card)).toEqual([])
      expect(missingSynonyms(card.synonyms.join('，  '), card)).toEqual([])
    }
    const multi = listening.find(c => c.synonyms.length > 1)!
    expect(missingSynonyms(multi.synonyms[0], multi)).toEqual(multi.synonyms.slice(1))
  })

  it('typing along: a wrong letter anywhere in what was typed counts', () => {
    const card = vocab(['Atmosphere'])
    expect(typedWrong('atmos', card)).toBe(false)
    expect(typedWrong('atx', card)).toBe(true)
    expect(typedWrong('atmospheres', card)).toBe(true)
  })

  it('mistakes go to the group each practice used before', () => {
    const v = vocab(['colour', 'color'], 7)
    expect(spellMistake(v, 'dictation')).toMatchObject({ module: 'vocabulary', entry: { key: 'spelling:7', title: 'colour / color', hint: 'An example.' } })
    expect(spellMistake(v, 'meaning')!.entry.key).toBe('spelling:7')
    expect(spellMistake(v, 'typing')).toMatchObject({ module: 'typing', entry: { key: 'typing:colour', title: 'colour' } })
    expect(spellMistake(listening[0], 'synonym')).toMatchObject({ module: 'listening', entry: { key: 'listening179:1' } })
    expect(spellMistake(listening[0], 'synonym')!.entry.detail).toContain('同义替换：book')
    expect(spellMistake(corpus[0], 'meaning')).toMatchObject({ module: 'corpus', entry: { key: `corpus:${corpus[0].id}` } })
  })

  it('word sources: misspelt words, words studied today, round order', () => {
    const a = vocab(['alpha'], 1)
    const b = vocab(['beta'], 2)
    const copy = vocab(['alpha'], 3, '02_y')
    const all = [a, b, copy, listening[0], corpus[0]]
    const m = (key: string) => ({ key } as any)
    expect(mistakenCards(all, [m('typing:alpha'), m('spelling:2'), m('listening179:1'), m('flashcard:1')])).toEqual([a, b, listening[0]])
    const now = Date.now()
    const today = { ease: 2.5, interval: 1, dueAt: now + 86400000 - 1000, reps: 1, lapses: 0 }
    const old = { ...today, dueAt: now - 5 * 86400000 }
    expect(todayCards(all, c => c === b ? today : c === a ? old : undefined, now)).toEqual([b])
    expect(pickSpellRound([a, b, copy], 2, { answered: c => c === a })).toEqual([b, copy])
    expect(pickSpellRound([a, b, copy], 0, { answered: c => c === a })).toEqual([b, copy, a])
    expect(pickSpellRound(all, 3)).toHaveLength(3)
    expect(new Set(pickSpellRound(all, 0))).toEqual(new Set(all))
  })
})

describe('练拼写: choose first, one word at a time', () => {
  const wrappers: any[] = []
  beforeEach(() => {
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    useAuth().currentUser.value = null
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(public text: string) {}
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => {
    wrappers.splice(0).forEach(w => w.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  async function until(check: () => boolean) {
    for (let i = 0; i < 200 && !check(); i++) {
      await new Promise(r => setTimeout(r, 5))
      await flushPromises()
    }
    expect(check()).toBe(true)
  }
  async function open(query = '') {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<p />' } }] })
    await router.push(`/study/spell${query}`)
    const w = mount(SpellPage, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(w)
    await until(() => w.find('[data-start]').exists())
    return w
  }
  const state = (w: any) => w.vm.$.setupState
  async function choose(w: any, source: string, mode: string, size = 10) {
    await w.find(`[data-source="${source}"]`).trigger('click')
    await w.find(`[data-mode="${mode}"]`).trigger('click')
    await w.find(`[data-size="${size}"]`).trigger('click')
    await w.find('[data-start]').trigger('click')
    await flushPromises()
  }
  async function answer(w: any, text: string, synonyms?: string) {
    await w.find('input[aria-label="拼写"]').setValue(text)
    if (synonyms !== undefined)
      await w.find('input[aria-label="同义替换"]').setValue(synonyms)
    await w.find('form').trigger('submit')
    await flushPromises()
  }
  async function next(w: any) {
    await w.findAll('button').find((b: any) => /^(?:下一个|查看结果)$/.test(b.text()))!.trigger('click')
    await flushPromises()
  }

  it('opens on the choice screen; reading keywords are not offered; synonyms only with the 179 list', async () => {
    const w = await open()
    expect(w.find('[data-question]').exists()).toBe(false)
    expect(w.find('[data-back]').attributes('href')).toBe('/study')
    expect(w.findAll('[data-source]').map((b: any) => b.attributes('data-source'))).toEqual(['vocabulary', 'listening179', 'corpus', 'mistakes', 'today', 'custom'])
    expect(w.findAll('[data-mode]').map((b: any) => b.attributes('data-mode'))).toEqual(['dictation', 'meaning', 'typing'])
    await w.find('[data-source="listening179"]').trigger('click')
    expect(w.findAll('[data-mode]').map((b: any) => b.attributes('data-mode'))).toEqual(['dictation', 'meaning', 'typing', 'synonym'])
    expect(w.find('[data-preview]').text()).toContain('一共 179 个词')
    await w.find('[data-mode="synonym"]').trigger('click')
    await w.find('[data-source="corpus"]').trigger('click')
    expect(w.find('[data-mode="meaning"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-mode="synonym"]').exists()).toBe(false)
  })

  it('vocabulary, see-the-meaning: answers are saved like the word table, mistakes recorded once, missed words come back', async () => {
    const w = await open()
    await choose(w, 'vocabulary', 'meaning')
    const s = state(w)
    const chapter = s.settings.chapter
    const first = s.current
    expect(w.find('[data-meaning]').text()).toContain(first.meaning)
    expect(w.find('[data-progress]').text()).toContain('1 / 10')
    await answer(w, first.word.toUpperCase())
    expect(w.find('[data-answer]').text()).toContain('拼对了')
    expect(readRecords<string>('vocabulary_spell_v2', null)[`${chapter}|${first.id}`]).toBe(first.word.toLowerCase())
    expect(useProgress().modules.value.find(m => m.module === `spelling:${chapter}`)?.done).toBe(1)
    await next(w)
    const second = s.current
    await answer(w, 'zzzz')
    expect(w.find('[data-answer]').text()).toContain('没拼对')
    expect(w.find('[data-diff]').text()).toBe(second.word)
    const key = `spelling:${second.id}`
    expect(useMistakes().mistakes.value.find(m => m.key === key)?.count).toBe(1)
    expect(s.queue).toHaveLength(11)
    for (let i = 2; i < 10; i++) {
      await next(w)
      await answer(w, s.current.word)
    }
    await next(w)
    expect(s.current.id).toBe(second.id)
    expect(w.find('[data-progress]').text()).toContain('再考一次')
    await answer(w, 'zzzz')
    expect(useMistakes().mistakes.value.find(m => m.key === key)?.count).toBe(1)
    expect(s.queue).toHaveLength(11)
    await next(w)
    expect(w.find('[data-done]').text()).toContain('10 个词，一次就对 9 个')
    expect(w.find('[data-done]').text()).toContain(second.word)
    // 再来一轮：没拼过的排前面
    await w.findAll('button').find((b: any) => b.text() === '再来一轮')!.trigger('click')
    await flushPromises()
    expect(Object.keys(readRecords<string>('vocabulary_spell_v2', null)).includes(`${chapter}|${s.current.id}`)).toBe(false)
    // 返回选择
    await w.find('[data-back]').trigger('click')
    expect(w.find('[data-setup]').exists()).toBe(true)
  })

  it('dictation hides the meaning until the word is checked', async () => {
    const w = await open()
    await choose(w, 'vocabulary', 'dictation')
    expect(w.find('[data-meaning]').exists()).toBe(false)
    await answer(w, state(w).current.word)
    expect(w.find('[data-meaning]').exists()).toBe(true)
  })

  it('typing along: a slip is one mistake in 打字练习, a clean word is none, progress follows the round', async () => {
    const w = await open()
    await choose(w, 'vocabulary', 'typing')
    const s = state(w)
    const first = s.current.word
    expect(w.find('[data-target]').text()).toBe(first)
    const input = w.find('input[aria-label="拼写"]')
    await input.setValue('#')
    await input.setValue(first)
    await new Promise(r => setTimeout(r, 230))
    await flushPromises()
    expect(useMistakes().mistakes.value.find(m => m.key === `typing:${first}`)?.module).toBe('typing')
    expect(useProgress().modules.value.find(m => m.module === 'typing')).toMatchObject({ done: 1, total: 10 })
    expect(s.index).toBe(1)
    const second = s.current.word
    await w.find('input[aria-label="拼写"]').setValue(second.toUpperCase())
    await new Promise(r => setTimeout(r, 230))
    expect(useMistakes().mistakes.value.some(m => m.key === `typing:${second}`)).toBe(false)
    expect(s.firstTry).toBe(1)
    expect(Object.keys(readRecords<string>('vocabulary_spell_v2', null))).toHaveLength(0)
  })

  it('switching account before a typed word advances writes nothing to the next account', async () => {
    useAuth().currentUser.value = 'alice'
    const w = await open()
    await choose(w, 'vocabulary', 'typing')
    const s = state(w)
    const word = s.current.word
    const input = w.find('input[aria-label="拼写"]')
    await input.setValue('#')
    await input.setValue(word)
    useAuth().currentUser.value = 'bob'
    await new Promise(r => setTimeout(r, 230))
    await flushPromises()
    expect(useMistakes().mistakes.value.some(m => m.key === `typing:${word}`)).toBe(false)
    expect(useProgress().modules.value.some(m => m.module === 'typing')).toBe(false)
    expect(s.stage).toBe('setup')
    useAuth().currentUser.value = null
  })

  it('179 with synonyms: both the word and its synonyms are checked; the row counts as studied', async () => {
    const w = await open('?source=listening179&mode=synonym')
    expect(w.find('[data-source="listening179"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-mode="synonym"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-size="10"]').trigger('click')
    await w.find('[data-start]').trigger('click')
    await flushPromises()
    const s = state(w)
    const first = s.current
    await answer(w, first.word, first.synonyms.join('，').toLowerCase())
    expect(w.find('[data-answer]').text()).toContain('拼对了')
    expect(Object.keys(readRecords('listening179_done_v1', null))).toEqual([String(first.id)])
    await next(w)
    const second = s.current
    await answer(w, second.word, '')
    expect(w.find('[data-answer]').text()).toContain('没拼对')
    expect(w.find('[data-synonyms]').text()).toContain(`没写出来：${second.synonyms.join(' / ')}`)
    expect(useMistakes().mistakes.value.find(m => m.key === `listening179:${second.id}`)?.module).toBe('listening')
    // 拼写练习不改复习进度
    expect(Object.keys(useDeckStore('listening179').schedules.value)).toHaveLength(0)
  })

  it('corpus: chapters can be unticked, British and American spellings both count, special nouns show their note as the hint', async () => {
    const w = await open()
    await w.find('[data-source="corpus"]').trigger('click')
    const total = state(w).pool.length
    await w.find('[data-corpus="ch2"]').setValue(false)
    await w.find('[data-corpus="ch4"]').setValue(false)
    const ch3 = corpus.filter(c => String(c.id).startsWith('ch3-'))
    expect(state(w).pool.length).toBe(ch3.length)
    expect(ch3.length).toBeLessThan(total)
    await choose(w, 'corpus', 'meaning', 0)
    const s = state(w)
    const noted = s.queue.findIndex((c: any) => c.note)
    expect(noted).toBeGreaterThanOrEqual(0)
    s.index = noted
    await flushPromises()
    await w.findAll('button').find((b: any) => b.text() === '提示')!.trigger('click')
    expect(w.find('[data-hint]').text()).toBe(s.current.note)
    await answer(w, 'zzzz')
    expect(useMistakes().mistakes.value.find(m => m.key === `corpus:${s.current.id}`)?.module).toBe('corpus')
    // 选择会记住
    w.unmount()
    wrappers.pop()
    const again = await open()
    expect(again.find('[data-source="corpus"]').attributes('aria-pressed')).toBe('true')
    expect((again.find('[data-corpus="ch2"]').element as HTMLInputElement).checked).toBe(false)
    expect((again.find('[data-corpus="ch3"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('misspelt words and 我的词单 are sources of their own, with a count', async () => {
    const all = await loader.loadAllVocabulary()
    const word = (Object.values(all)[0] as any).words[0][0]
    useMistakes().addMistake('typing', { key: `typing:${word.word[0]}`, title: word.word[0], detail: '' })
    useMistakes().addMistake('corpus', { key: `corpus:${corpus[0].id}`, title: corpus[0].word, detail: '' })
    useMistakes().addMistake('flashcard', { key: 'flashcard:99', title: 'x', detail: '' })
    saveValue(nsKey('dungeon_wordlist_v1'), [`vocab:${word.id}`, 'listening179:2', 'reading538:anything'])
    const w = await open()
    expect(w.find('[data-source="mistakes"]').text()).toContain('（2）')
    expect(w.find('[data-source="custom"]').text()).toContain('（2）')
    expect(w.find('[data-source="today"]').text()).toContain('（0）')
    await w.find('[data-source="today"]').trigger('click')
    expect(w.find('[data-start]').attributes('disabled')).toBeDefined()
    await choose(w, 'custom', 'meaning', 0)
    expect(state(w).queue.map((c: any) => c.key).sort()).toEqual(['listening179:2', `vocabulary:${word.id}`])
  })

  it('a failed recording falls back to reading the word aloud', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('missing'))
    const w = await open()
    await choose(w, 'listening179', 'dictation')
    await flushPromises()
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
  })
})

describe('我的词单 from dictation, and old addresses', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuth().currentUser.value = null
  })
  it('finds vocabulary entries by spelling, also for inflected forms; adding twice keeps one', async () => {
    const all = await loader.loadAllVocabulary()
    const word = (Object.values(all)[0] as any).words[0][0]
    const hit = await loader.lookupVocabularyWord(`${word.word[0].toUpperCase()}s`)
    expect(hit).toMatchObject({ id: word.id, word: word.word[0] })
    expect(await loader.lookupVocabularyWord('zzzzqq')).toBeNull()
    expect(addToWordList([`vocab:${word.id}`, `vocab:${word.id}`])).toBe(1)
    expect(addToWordList([`vocab:${word.id}`])).toBe(0)
    expect(readWordList()).toEqual([`vocab:${word.id}`])
  })
  it('the old practice addresses redirect to 练拼写 with the list and mode chosen', () => {
    const main = readFileSync('src/main.ts', 'utf8')
    expect(main).toContain('path: \'/vocabulary/typing\', redirect: \'/study/spell?source=vocabulary&mode=typing\'')
    expect(main).toContain('path: \'/listening/179practice\', redirect: \'/study/spell?source=listening179&mode=synonym\'')
    expect(main).toContain('path: \'/listening/corpus-spelling\', redirect: \'/study/spell?source=corpus&mode=meaning\'')
  })
})

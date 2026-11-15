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

describe('the practice page', () => {
  const wrappers: any[] = []
  beforeEach(() => {
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    useAuth().currentUser.value = null
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
    })
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
  async function open() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/:p(.*)*',
          component: { template: '<p />' },
        },
      ],
    })
    await router.push('/listening/corpus-spelling')
    const Page = (await import('../src/pages/listening/corpus-spelling.vue')).default
    const w = mount(Page, {
      attachTo: document.body,
      global: {
        plugins: [router],
      },
    })
    wrappers.push(w)
    await flushPromises()
    return w
  }
  const state = (w: any) => w.vm.$.setupState
  const button = (w: any, text: string | RegExp) => w.findAll('button').find((b: any) => typeof text === 'string'
    ? b.text() === text
    : text.test(b.text()))
  async function answer(w: any, text: string) {
    await w.find('input[aria-label="拼写"]').setValue(text)
    await w.find('form').trigger('submit')
    await nextTick()
  }
  async function next(w: any) {
    await button(w, /^(?:下一个|查看结果)$/).trigger('click')
    await nextTick()
  }

  it('a round of ten: right answers count, the round ends with a summary', async () => {
    const w = await open()
    expect(w.text()).toContain(`共 ${words.length} 个词`)
    await button(w, '开始').trigger('click')
    const s = state(w)
    expect(s.queue).toHaveLength(20)
    s.queue = s.queue.slice(0, 10)
    s.roundSize = 10
    for (let i = 0; i < 10; i++) {
      await answer(w, s.current.accepted.at(-1).toUpperCase())
      expect(s.result).toBe('right')
      await next(w)
    }
    expect(s.stage).toBe('done')
    expect(w.text()).toContain('一次拼对 10 / 10')
    expect(useMistakes().mistakes.value).toHaveLength(0)
  })

  it('a wrong answer marks the missed letters, goes to the mistake book once and comes back at the end', async () => {
    const w = await open()
    await w.find('button[data-size="10"]').trigger('click')
    await button(w, '开始').trigger('click')
    const s = state(w)
    s.queue = [
      byWord('accommodation'),
      byWord('rhythm'),
    ]
    s.roundSize = 2
    await s.enter()
    await answer(w, 'acommodation')
    expect(s.result).toBe('wrong')
    const marked = w.findAll('[data-answer] span').filter((x: any) => x.classes().includes('underline')).map((x: any) => x.text())
    expect(marked).toEqual(['c'])
    expect(w.text()).toContain('注意：双 c 双 m')
    expect(useMistakes().mistakes.value.map(m => [m.module, m.key, m.count])).toEqual([
      ['corpus', `corpus:${byWord('accommodation').id}`, 1],
    ])
    await next(w)
    await answer(w, 'rhythm')
    await next(w)
    // 重考：再错也不重复记、不再排进队尾
    expect(w.text()).toContain('重考 1 / 1')
    await answer(w, 'acomodation')
    expect(s.queue).toHaveLength(3)
    expect(useMistakes().mistakes.value[0].count).toBe(1)
    await next(w)
    expect(s.stage).toBe('done')
    expect(w.text()).toContain('一次拼对 1 / 2')
    await button(w, '再练拼错的 1 个').trigger('click')
    expect(s.queue.map((x: any) => x.word)).toEqual(['accommodation'])
  })

  it('the hint shows the special-noun note or the first letter; settings are remembered', async () => {
    const w = await open()
    await w.find('button[data-chapter="ch2"]').trigger('click')
    await w.find('button[data-chapter="ch4"]').trigger('click')
    expect(w.text()).toContain(`共 ${words.filter(x => x.chapter === 'ch3').length} 个词`)
    await w.find('button[data-size="0"]').trigger('click')
    await button(w, '开始').trigger('click')
    const s = state(w)
    expect(s.queue).toHaveLength(words.filter(x => x.chapter === 'ch3').length)
    await button(w, '提示').trigger('click')
    expect(w.find('[data-hint]').text()).toBe(`注意：${s.current.note}`)
    expect(JSON.parse(localStorage.getItem(nsKey('corpus_spelling_v1'))!)).toEqual({
      chapters: ['ch3'],
      size: 0,
    })
    s.queue = [
      byWord('convenient'),
    ]
    s.index = 0
    await s.enter()
    await button(w, '提示').trigger('click')
    expect(w.find('[data-hint]').text()).toBe('首字母 c，共 10 个字母')
    expect(w.text()).toContain('adj.')
  })

  it('a correct alternative spelling is accepted and the other spellings are shown', async () => {
    const w = await open()
    await button(w, '开始').trigger('click')
    const s = state(w)
    s.queue = [
      byWord('aluminium'),
    ]
    s.roundSize = 1
    s.index = 0
    await s.enter()
    await answer(w, 'aluminum')
    expect(s.result).toBe('right')
    expect(w.text()).toContain('aluminium 也算对')
  })
})

import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { useDeckStore } from '../src/composables/useDeckStore'
import { useDailyGoal, useWordSchedule } from '../src/composables/useSpacedRepetition'
import { useMistakes } from '../src/composables/useStudyData'
import LearnPage from '../src/pages/study/learn.vue'
import { listeningCards, mistakeHint, mistakeKey, readingCards } from '../src/utils/studyDeck'

const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  useAuth().currentUser.value = null
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [],
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function settle() {
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
  }
}
// 学新词进来先是选择页；start 为 true 时顺手点“开始”进到卡片
async function mountLearn(query: string, start = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/:p(.*)*',
        component: { template: '<p />' },
      },
    ],
  })
  await router.push(`/study/learn?${query}`)
  const w = mount(LearnPage, {
    attachTo: document.body,
    global: {
      plugins: [router],
    },
  })
  wrappers.push(w)
  await settle()
  if (start) {
    await w.find('[data-start]').trigger('click')
    await settle()
  }
  return { w, router }
}
const button = (w: any, text: string) => w.findAll('button').find((b: any) => b.text().trim() === text)

describe('card builders keep each deck’s own fields', () => {
  it('reading cards carry pos, synonyms and remark; phrases get a 短语 label', () => {
    const [a, b] = readingCards([
      {
        title: 'T',
        words: [
          [
            1,
            'consult',
            ['v.'],
            ['查阅', '咨询'],
            ['refer to'],
            '备注',
          ],
          [
            2,
            'in charge of',
            [],
            ['负责'],
            [],
            '',
          ],
        ] as any,
      },
    ])
    expect(a).toMatchObject({
      key: 'reading538:T-1',
      pos: 'v.',
      meaning: '查阅；咨询',
      synonyms: ['refer to'],
      remark: '备注',
    })
    expect(b.pos).toBe('短语')
    expect(mistakeKey(a)).toBe('reading538:T-1')
    expect(mistakeHint(a)).toBe('refer to')
  })
  it('listening cards use the 179 index as id', () => {
    const [c] = listeningCards([
      {
        index: 7,
        word: 'fee',
        meaning: '费用',
        replace: ['charge'],
      },
    ])
    expect(c).toMatchObject({
      key: 'listening179:7',
      pos: '短语',
      synonyms: ['charge'],
    })
  })
})

describe('学新词 writes back to each deck’s original records', () => {
  it('reading deck: grade, mistake, new-word count and undo all use the old keys', async () => {
    const { w } = await mountLearn('deck=reading538')
    expect(w.text()).toContain('学新词 · 阅读考点词')
    const word = w.find('[data-word]').text()
    expect(word).not.toBe('')
    await button(w, '不认识').trigger('click')
    await flushPromises()
    expect(w.find('[data-study]').exists()).toBe(true)
    const deck = useDeckStore('reading538')
    const keys = Object.keys(deck.schedules.value)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^reading538:/)
    expect(deck.dailyCount.value).toBe(1)
    const mistake = useMistakes().mistakes.value.find(m => m.key === keys[0])
    expect(mistake?.title).toBe(word)
    // 返回上一个：进度、新词计数、错题都还原
    await button(w, '↩ 返回上一个，重新测试').trigger('click')
    await flushPromises()
    expect(Object.keys(deck.schedules.value).filter(k => deck.schedules.value[k])).toHaveLength(0)
    expect(deck.dailyCount.value).toBe(0)
    expect(useMistakes().mistakes.value.find(m => m.key === keys[0])).toBeUndefined()
    expect(w.find('[data-word]').text()).toBe(word)
  })

  it('vocabulary deck uses sr_vocabulary_v1 and the vocabulary daily goal', async () => {
    const { w } = await mountLearn('deck=vocabulary', false)
    expect(w.find('select[aria-label="章节"]').exists()).toBe(true)
    await w.find('[data-start]').trigger('click')
    await settle()
    expect(w.text()).toContain('学新词 · 词汇表')
    await button(w, '认识').trigger('click')
    await flushPromises()
    const keys = Object.keys(useWordSchedule().schedules.value)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^vocab:/)
    expect(useDailyGoal().dailyCount.value).toBe(1)
    expect(useDeckStore('reading538').dailyCount.value).toBe(0)
  })

  it('an existing old-format schedule is shown as a review card, not a new word', async () => {
    const due = {
      ease: 2.5,
      interval: 1,
      dueAt: Date.now() - 1000,
      reps: 1,
      lapses: 0,
    }
    useDeckStore('listening179').setSchedule(1, due as any)
    const { w } = await mountLearn('deck=listening179')
    expect(w.text()).toContain('复习 1（到期 1）')
    expect(w.find('[data-card]').text()).toContain('复习')
  })

  it('switching deck rebuilds the round and updates the address', async () => {
    const { w, router } = await mountLearn('deck=reading538', false)
    expect(w.find('select[aria-label="章节"]').exists()).toBe(false)
    await w.find('[data-deck-choice="corpus"]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.deck).toBe('corpus')
    await w.find('[data-start]').trigger('click')
    await settle()
    expect(w.text()).toContain('学新词 · 听力语料库')
    expect(w.find('[data-word]').exists()).toBe(true)
  })

  it('no deck in the address: opens the list studied last time', async () => {
    const first = await mountLearn('deck=listening179')
    expect(first.w.text()).toContain('学新词 · 听力 179')
    first.w.unmount()
    wrappers.pop()
    const { w, router } = await mountLearn('')
    expect(w.text()).toContain('学新词 · 听力 179')
    expect(router.currentRoute.value.query.deck).toBe('listening179')
  })

  it('an unknown deck falls back to the vocabulary list', async () => {
    const { w } = await mountLearn('deck=nope')
    expect(w.text()).toContain('学新词 · 词汇表')
  })
})

describe('学新词 starts only after you choose, and every screen can go back', () => {
  it('opens on the choice screen: nothing is recorded and no card shows until 开始', async () => {
    const { w } = await mountLearn('deck=reading538', false)
    expect(w.find('[data-setup]').exists()).toBe(true)
    expect(w.find('[data-card]').exists()).toBe(false)
    expect(w.find('[data-back]').attributes('href')).toBe('/study')
    expect(w.find('[data-deck-choice="reading538"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-preview]').text()).toMatch(/新词 [1-9]\d* 个/)
    expect(Object.keys(useDeckStore('reading538').schedules.value)).toHaveLength(0)
    await w.find('[data-start]').trigger('click')
    await settle()
    expect(w.find('[data-setup]').exists()).toBe(false)
    expect(w.find('[data-card]').exists()).toBe(true)
  })

  it('the card screen goes back to the choice screen, where another list can be picked', async () => {
    const { w } = await mountLearn('deck=reading538')
    await w.findAll('button').find((b: any) => b.text().includes('返回选择'))!.trigger('click')
    await button(w, '退出').trigger('click')
    await settle()
    expect(w.find('[data-setup]').exists()).toBe(true)
    await w.find('[data-deck-choice="listening179"]').trigger('click')
    await settle()
    await w.find('[data-start]').trigger('click')
    await settle()
    expect(w.text()).toContain('学新词 · 听力 179')
  })

  it('the vocabulary table (opened from 练拼写) and the dungeon have a way back', () => {
    const source = (p: string) => readFileSync(p, 'utf8')
    expect(source('src/pages/vocabulary/index.vue')).toContain('<StudyBack to="/study/spell" label="练拼写" />')
    expect(source('src/pages/study/spell.vue')).toContain('<StudyBack to="/study" label="背单词" />')
    expect(source('src/pages/game.vue')).toContain('← 返回选词')
  })
})

describe('学新词: how far to learn each word', () => {
  it('three levels; reading keywords have no spelling, the corpus has no related words; the choice is remembered', async () => {
    const levels = (w: any) => w.findAll('[data-practice]').map((b: any) => b.attributes('data-practice'))
    const { w } = await mountLearn('deck=vocabulary', false)
    expect(levels(w)).toEqual(['recognize', 'spell', 'related'])
    expect(w.find('[data-practice="recognize"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-practice="spell"]').trigger('click')
    await w.find('[data-deck-choice="reading538"]').trigger('click')
    await settle()
    expect(levels(w)).toEqual(['recognize', 'related'])
    expect(w.find('[data-practice="recognize"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-deck-choice="corpus"]').trigger('click')
    await settle()
    expect(levels(w)).toEqual(['recognize', 'spell'])
    expect(w.find('[data-practice="spell"]').attributes('aria-pressed')).toBe('true')
    w.unmount()
    wrappers.pop()
    const again = await mountLearn('deck=listening179', false)
    expect(again.w.find('[data-practice="spell"]').attributes('aria-pressed')).toBe('true')
  })

  it('会拼写: after the entry the word is hidden and typed once; a miss goes to the spelling mistakes, the self-rating stays', async () => {
    const { w } = await mountLearn('deck=listening179', false)
    await w.find('[data-practice="spell"]').trigger('click')
    await w.find('[data-start]').trigger('click')
    await settle()
    const word = w.find('[data-word]').text()
    await button(w, '认识').trigger('click')
    await flushPromises()
    expect(button(w, '下一个')).toBeUndefined()
    expect(w.find('[data-study-word]').text()).toBe(word)
    const store = useDeckStore('listening179')
    const key = Object.keys(store.schedules.value)[0]
    const rated = JSON.stringify(store.schedules.value[key])
    await button(w, '拼一遍').trigger('click')
    await flushPromises()
    expect(w.find('[data-study-word]').text()).toBe('？？？')
    expect(w.find('[data-synonyms]').exists()).toBe(false)
    await w.find('input[aria-label="拼写"]').setValue('zzzz')
    await w.find('form[data-spell]').trigger('submit')
    expect(w.find('[data-spell-result]').text()).toContain('没拼对')
    expect(w.find('[data-study-word]').text()).toBe(word)
    expect(useMistakes().mistakes.value.find(m => m.key === key)?.module).toBe('listening')
    expect(JSON.stringify(store.schedules.value[key])).toBe(rated)
    await button(w, '再拼一次').trigger('click')
    await flushPromises()
    await w.find('input[aria-label="拼写"]').setValue(word.toUpperCase())
    await w.find('form[data-spell]').trigger('submit')
    expect(w.find('[data-spell-result]').text()).toContain('拼对了')
    expect(useMistakes().mistakes.value.find(m => m.key === key)?.count).toBe(1)
    await button(w, '下一个').trigger('click')
    await flushPromises()
    expect(w.find('[data-card]').exists()).toBe(true)
  })

  it('认意思 keeps the plain flow; 关联词 marks the synonyms as this round’s focus', async () => {
    const plain = await mountLearn('deck=reading538')
    await button(plain.w, '认识').trigger('click')
    await flushPromises()
    expect(button(plain.w, '拼一遍')).toBeUndefined()
    expect(button(plain.w, '下一个')).toBeTruthy()
    plain.w.unmount()
    wrappers.pop()
    const { w } = await mountLearn('deck=listening179', false)
    await w.find('[data-practice="related"]').trigger('click')
    await w.find('[data-start]').trigger('click')
    await settle()
    await button(w, '认识').trigger('click')
    await flushPromises()
    expect(w.find('[data-synonyms]').text()).toContain('这一轮重点记')
    expect(button(w, '下一个')).toBeTruthy()
  })

  it('关联词 on a vocabulary card lists synonyms and extension words with their meanings up front', async () => {
    const Hints = (await import('../src/components/VocabCardHints.vue')).default
    const card = {
      key: 'vocabulary:1',
      deck: 'vocabulary',
      id: 1,
      word: 'big',
      spellings: ['big'],
      pos: 'adj.',
      meaning: '大的',
      chapter: 'c',
      synonyms: [],
      remark: '',
      note: '',
      example: 'A big house.',
      extra: 'huge adj. 巨大的',
      hintWords: [],
    }
    const info = {
      word: 'big',
      examples: [],
      synonyms: ['large'],
    }
    const focus = mount(Hints, {
      props: {
        card,
        phase: 'post',
        wordInfo: info,
        related: true,
      } as any,
    })
    wrappers.push(focus)
    expect(focus.find('[data-related]').text()).toContain('large')
    expect(focus.find('[data-related]').text()).toContain('huge')
    expect(focus.find('[data-related]').text()).toContain('巨大的')
    expect(focus.text().match(/huge/g)).toHaveLength(1)
    const plain = mount(Hints, {
      props: { card, phase: 'post', wordInfo: info } as any,
    })
    wrappers.push(plain)
    expect(plain.find('[data-related]').exists()).toBe(false)
    expect(plain.text()).toContain('拓展词汇')
  })
})

describe('old addresses', () => {
  it('the old keyword card URLs redirect to 学新词 with the deck chosen', () => {
    const main = readFileSync('src/main.ts', 'utf8')
    expect(main).toContain('{ path: \'/reading/flashcard\', redirect: \'/study/learn?deck=reading538\' }')
    expect(main).toContain('{ path: \'/listening/flashcard\', redirect: \'/study/learn?deck=listening179\' }')
    expect(main).toContain('{ path: \'/listening/corpus-flashcard\', redirect: \'/study/learn?deck=corpus\' }')
  })
})

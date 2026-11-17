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

async function mountLearn(query: string) {
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
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
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
    const { w } = await mountLearn('deck=vocabulary')
    expect(w.text()).toContain('学新词 · 词汇表')
    expect(w.find('select[aria-label="章节"]').exists()).toBe(true)
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
    const { w, router } = await mountLearn('deck=reading538')
    await w.find('select[aria-label="词库"]').setValue('corpus')
    for (let i = 0; i < 5; i++) {
      await flushPromises()
      await new Promise(r => setTimeout(r, 0))
    }
    expect(router.currentRoute.value.query.deck).toBe('corpus')
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

describe('old addresses', () => {
  it('the old keyword card URLs redirect to 学新词 with the deck chosen', () => {
    const main = readFileSync('src/main.ts', 'utf8')
    expect(main).toContain('{ path: \'/reading/flashcard\', redirect: \'/study/learn?deck=reading538\' }')
    expect(main).toContain('{ path: \'/listening/flashcard\', redirect: \'/study/learn?deck=listening179\' }')
    expect(main).toContain('{ path: \'/listening/corpus-flashcard\', redirect: \'/study/learn?deck=corpus\' }')
  })
})

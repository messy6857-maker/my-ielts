import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import TheHeader from '../src/components/TheHeader.vue'
import { useAuth } from '../src/composables/useAuth'
import { useDeckStore } from '../src/composables/useDeckStore'
import { useDailyGoal, useWordSchedule } from '../src/composables/useSpacedRepetition'
import IndexPage from '../src/pages/index.vue'
import StudyPage from '../src/pages/study/index.vue'
import SpellPage from '../src/pages/study/spell.vue'

const DAY = 86400000
const wrappers: any[] = []
const blank = { template: '<p />' }

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  useAuth().currentUser.value = null
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  localStorage.clear()
})

async function mountAt(component: any, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:p(.*)*', component: blank },
    ],
  })
  await router.push(path)
  const w = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router],
    },
  })
  wrappers.push(w)
  await flushPromises()
  return w
}
function seed() {
  const due = {
    ease: 2.5,
    interval: 1,
    dueAt: Date.now() - 1000,
    reps: 1,
    lapses: 0,
  }
  const later = { ...due, dueAt: Date.now() + DAY }
  const vocab = useWordSchedule()
  vocab.set(1, due)
  vocab.set(2, due)
  vocab.set(3, later)
  useDeckStore('reading538').setSchedule('类-1', due)
  useDeckStore('listening179').setSchedule(5, later)
  useDailyGoal().recordNewWord(3)
}

describe('背单词 hub', () => {
  it('one entry per task: no per-list duplicates, choices are made inside', async () => {
    seed()
    const w = await mountAt(StudyPage, '/study')
    expect(w.find('[data-summary]').text()).toContain('一共有 3 个词到期')
    const entries = w.findAll('[data-entry]')
    expect(entries.map((a: any) => [a.attributes('data-entry'), a.attributes('href')])).toEqual([
      ['learn', '/study/learn'],
      ['review', '/vocabulary/flashcard?review=due'],
      ['spell', '/study/spell'],
      ['game', '/game'],
    ])
    expect(w.findAll('a')).toHaveLength(4)
    expect(w.text()).not.toContain('卡片自测 →')
    expect(w.find('[data-entry="learn"] [data-badge]').text()).toBe('今天已学 1 个新词')
    expect(w.find('[data-entry="review"] [data-badge]').text()).toBe('2 个到期')
  })

  it('练拼写 lists the spelling modes; reading keywords are not among them', async () => {
    const w = await mountAt(SpellPage, '/study/spell')
    expect(w.findAll('[data-spell]').map((a: any) => a.attributes('href'))).toEqual([
      '/vocabulary?practice=1',
      '/vocabulary/typing',
      '/listening/179practice',
      '/listening/corpus-spelling',
    ])
    expect(w.findAll('a').some((a: any) => a.attributes('href') === '/study')).toBe(true)
  })

  it('nothing due: suggests learning new words', async () => {
    const w = await mountAt(StudyPage, '/study')
    expect(w.find('[data-summary]').text()).toContain('今天没有到期要复习的词')
  })

  it('the home page counts due words of every list and sends you to the hub', async () => {
    seed()
    const w = await mountAt(IndexPage, '/')
    const tile = w.findAll('a').find((a: any) => a.text().includes('今日到期复习'))!
    expect(tile.attributes('href')).toBe('/study')
    expect(tile.text()).toContain('3')
    const card = w.findAll('a').find((a: any) => a.attributes('href') === '/study' && a.text().includes('背单词'))
    expect(card).toBeTruthy()
    expect(w.findAll('a').some((a: any) => a.attributes('href') === '/vocabulary/typing')).toBe(false)
  })

  it('the menu has one 背单词 entry, lit on the hub and on every self-test page', async () => {
    for (const [path, lit] of [
      ['/study', true],
      ['/study/learn', true],
      ['/study/spell', true],
      ['/game', true],
      ['/listening/179practice', true],
      ['/reading', false],
    ] as const) {
      const w = await mountAt(TheHeader, path)
      const links = w.findAll('a').filter((a: any) => a.text().includes('背单词'))
      expect(links.length).toBeGreaterThan(0)
      expect(links[0].attributes('href')).toBe('/study')
      expect(links[0].classes().includes('text-primary-700')).toBe(lit)
      expect(w.text()).not.toContain('单词地牢')
    }
  })
})

describe('old entry buttons are gone; self-tests return to the hub', () => {
  it('no self-test or practice buttons are left on the vocabulary, reading and listening pages', () => {
    const source = (p: string) => readFileSync(p, 'utf8')
    expect(source('src/pages/vocabulary/index.vue')).not.toContain('to="/vocabulary/flashcard"')
    expect(source('src/components/ReadingTabs.vue')).not.toContain('/reading/flashcard')
    expect(source('src/pages/listening/keyword.vue')).not.toContain('/listening/flashcard')
    expect(source('src/pages/listening/keyword.vue')).not.toContain('179practice')
    expect(source('src/pages/listening/corpus.vue')).not.toContain('corpus-flashcard')
    expect(source('src/components/StudyCardSession.vue')).toContain('useGoBack(\'/study\')')
    expect(source('src/pages/vocabulary/flashcard.vue')).toContain('router.push(\'/study\')')
  })

  it('the vocabulary list opens in practice mode when coming from 拼写练习', async () => {
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
    })
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const Page = (await import('../src/pages/vocabulary/index.vue')).default
    const w = await mountAt(Page, '/vocabulary?practice=1')
    expect((w.vm as any).$.setupState.isTrainingModel).toBe(true)
    w.unmount()
    wrappers.pop()
    const plain = await mountAt(Page, '/vocabulary')
    expect((plain.vm as any).$.setupState.isTrainingModel).toBe(false)
    vi.unstubAllGlobals()
  })
})

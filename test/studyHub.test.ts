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
    expect(entries.map((a: any) => [
      a.attributes('data-entry'),
      a.attributes('href'),
    ])).toEqual([
      ['learn', '/study/learn'],
      ['review', '/study/review'],
      ['spell', '/study/spell'],
      ['game', '/game'],
    ])
    expect(w.findAll('[data-more] a').map((a: any) => a.attributes('href'))).toEqual(['/vocabulary', '/study/lists'])
    expect(w.findAll('a')).toHaveLength(6)
    expect(w.text()).not.toContain('卡片自测 →')
    expect(w.find('[data-entry="learn"] [data-badge]').text()).toBe('今天已学 1 个新词')
    expect(w.find('[data-entry="review"] [data-badge]').text()).toBe('3 个到期')
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
    // 首页入口：背单词、每日阅读、雅思考试、学习统计
    expect(w.findAll('[data-home-entry]').map((a: any) => a.attributes('href'))).toEqual([
      '/study',
      '/reading/daily',
      '/ielts',
      '/stats',
    ])
    // 错词本只在今日任务里出现一次；首页不再有学习进度（在学习统计里）
    expect(w.findAll('a').filter((a: any) => a.attributes('href') === '/mistakes')).toHaveLength(1)
    expect(w.find('[data-today-mistakes]').exists()).toBe(true)
    expect(w.text()).not.toContain('学习进度')
    expect(w.text()).not.toContain('我的 IELTS 备考中心')
  })

  it('the menu has four entries; each stays lit on every page under it', async () => {
    const lit = async (path: string) => {
      const w = await mountAt(TheHeader, path)
      const links = w.findAll('a').filter((a: any) => [
        '/',
        '/study',
        '/reading/daily',
        '/ielts',
      ].includes(a.attributes('href')) && a.classes().includes('text-primary-700'))
      const labels = [
        ...new Set(links.map((a: any) => a.attributes('href'))),
      ]
      w.unmount()
      return labels
    }
    const w = await mountAt(TheHeader, '/')
    const texts = w.findAll('a').map((a: any) => a.text().replace(/\d+$/, '').trim())
    for (const label of ['首页', '背单词', '每日阅读', '雅思考试'])
      expect(texts).toContain(label)
    for (const label of [
      '词汇',
      '语法',
      '听力',
      '口语',
      '阅读',
      '写作',
      '错词本',
      '学习统计',
    ])
      expect(texts).not.toContain(label)
    w.unmount()
    for (const path of ['/', '/mistakes', '/stats'])
      expect(await lit(path)).toEqual(['/'])
    for (const path of [
      '/study',
      '/study/learn',
      '/study/spell',
      '/study/review',
      '/study/lists',
      '/game',
      '/vocabulary',
      // 单词表在“背单词 → 查单词表”里
      '/reading',
      '/listening/keyword',
      '/listening/corpus',
    ])
      expect(await lit(path)).toEqual(['/study'])
    for (const path of [
      '/ielts',
      '/ielts/guide',
      '/listening/intensive',
      '/writing',
      '/speaking',
      '/grammar',
      '/mock/listening-test',
      '/mock/history',
      '/grading/history',
    ])
      expect(await lit(path)).toEqual(['/ielts'])
    // 每日阅读单独一个入口，不算雅思考试
    expect(await lit('/reading/daily')).toEqual(['/reading/daily'])
    expect(await lit('/settings')).toEqual([])
  })
})

describe('雅思考试', () => {
  it('one entry for practice by skill, the methods page, mock tests and records', async () => {
    const Hub = (await import('../src/pages/ielts/index.vue')).default
    const w = await mountAt(Hub, '/ielts')
    expect(w.findAll('[data-entry]').map((a: any) => [
      a.attributes('data-entry'),
      a.attributes('href'),
    ])).toEqual([
      ['listening', '/listening/intensive'],
      ['writing', '/writing'],
      ['speaking', '/speaking'],
      ['grammar', '/grammar'],
      ['guide', '/ielts/guide'],
      ['mock', '/mock/listening-test'],
      ['records', '/mock/history'],
    ])
  })

  it('做题方法 has listening, reading, writing and speaking; it can go back', async () => {
    const Guide = (await import('../src/pages/ielts/guide.vue')).default
    const w = await mountAt(Guide, '/ielts/guide')
    expect(w.find('[data-back]').attributes('href')).toBe('/ielts')
    expect(w.text()).toContain('Section 1')
    for (const [part, text] of [
      ['reading', '判断题'],
      ['writing', 'Task Response'],
      ['speaking', 'Part 2'],
      ['listening', 'Section 4'],
    ]) {
      await w.find(`[data-part="${part}"]`).trigger('click')
      await flushPromises()
      expect(w.text()).toContain(text)
    }
  })

  it('the listening and reading tabs no longer hold the method page or the mock tests; every page has a way back', () => {
    const source = (p: string) => readFileSync(p, 'utf8')
    expect(source('src/pages/reading/index.vue')).not.toContain('/mock/reading-test')
    for (const p of [
      'src/pages/listening.vue',
      'src/pages/writing/index.vue',
      'src/pages/speaking/index.vue',
      'src/pages/grammar/index.vue',
      'src/components/ExamTabs.vue',
      'src/pages/ielts/guide.vue',
    ])
      expect(source(p)).toContain('<StudyBack to="/ielts" label="雅思考试" />')
    for (const p of ['src/pages/mistakes.vue', 'src/pages/stats.vue'])
      expect(source(p)).toContain('<StudyBack to="/" label="首页" />')
    for (const p of ['src/pages/mock/listening-test.vue', 'src/pages/mock/reading-test.vue'])
      expect(source(p)).toContain('<ExamTabs group="mock" />')
    for (const p of ['src/pages/mock/history.vue', 'src/pages/grading/history.vue'])
      expect(source(p)).toContain('<ExamTabs group="records" />')
  })
})

describe('背单词 → 查单词表', () => {
  it('every word table is switched in one place, which goes back to 背单词', async () => {
    const Tabs = (await import('../src/components/WordTableTabs.vue')).default
    for (const path of [
      '/vocabulary',
      '/reading',
      '/listening/keyword',
      '/listening/corpus',
    ]) {
      const w = await mountAt(Tabs, path)
      expect(w.find('[data-back]').attributes('href')).toBe('/study')
      expect(w.findAll('[data-word-tables] a:not([data-back])').map((a: any) => [
        a.text(),
        a.classes().includes('bg-blue-600'),
      ])).toEqual([
        ['词汇表', path === '/vocabulary'],
        ['阅读考点词', path === '/reading'],
        ['听力 179 考点词', path === '/listening/keyword'],
        ['听力语料库', path === '/listening/corpus'],
      ])
      w.unmount()
    }
    const source = (p: string) => readFileSync(p, 'utf8')
    expect(source('src/pages/reading/index.vue')).toContain('<WordTableTabs />')
    expect(source('src/pages/vocabulary/index.vue')).toContain('<WordTableTabs v-else />')
    expect(source('src/pages/listening.vue')).toContain('<WordTableTabs v-if="isWordTable" />')
    expect(source('src/pages/listening/index.vue')).toContain('/ielts/guide?part=listening')
  })
})

describe('old entry buttons are gone; self-tests return to the hub', () => {
  it('no self-test or practice buttons are left on the vocabulary, reading and listening pages', () => {
    const source = (p: string) => readFileSync(p, 'utf8')
    expect(source('src/pages/vocabulary/index.vue')).not.toContain('to="/vocabulary/flashcard"')
    expect(source('src/pages/reading/index.vue')).not.toContain('/reading/flashcard')
    expect(source('src/pages/listening/keyword.vue')).not.toContain('/listening/flashcard')
    expect(source('src/pages/listening/keyword.vue')).not.toContain('179practice')
    expect(source('src/pages/listening/corpus.vue')).not.toContain('corpus-flashcard')
    expect(source('src/components/StudyCardSession.vue')).toContain('useGoBack(\'/study\')')
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

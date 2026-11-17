import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import StudyCardSession from '../src/components/StudyCardSession.vue'
import { useAuth } from '../src/composables/useAuth'
import { useDeckStore } from '../src/composables/useDeckStore'
import { useWordSchedule } from '../src/composables/useSpacedRepetition'
import { useMistakes } from '../src/composables/useStudyData'
import * as details from '../src/composables/useVocabularyDetails'
import * as wordInfo from '../src/composables/useWordInfo'
import reading538 from '../src/pages/reading/reading538words'
import LearnPage from '../src/pages/study/learn.vue'
import ReviewPage from '../src/pages/study/review.vue'
import * as loader from '../src/pages/vocabulary/loadVocabulary'

const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  useAuth().currentUser.value = null
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] })
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
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise(r => setTimeout(r, 5))
    await flushPromises()
  }
  expect(check()).toBe(true)
}
async function mountPage(Page: any, path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<p />' } }] })
  await router.push(path)
  const w = mount(Page, { attachTo: document.body, global: { plugins: [router] } })
  wrappers.push(w)
  await settle()
  return w
}
// 复习页：等词表加载完（出现“开始”按钮）
async function mountReview() {
  const w = await mountPage(ReviewPage, '/study/review')
  await until(() => w.find('[data-start]').exists())
  return w
}
async function start(w: any) {
  await w.find('[data-start]').trigger('click')
  await settle()
  return w.findComponent(StudyCardSession).vm.$.setupState as any
}
const button = (w: any, text: string) => w.findAll('button').find((b: any) => b.text().trim() === text)
const due = (dueAt: number) => ({ ease: 2.5, interval: 1, dueAt, reps: 1, lapses: 0 })
const readingCat = (reading538 as any)[0]
const readingId = `${readingCat.title}-${readingCat.words[0][0]}`
const readingWord = readingCat.words[0][1]

describe('复习到期的词: choose first, all word lists together', () => {
  it('opens on the choice screen with the lists that have due words ticked', async () => {
    useWordSchedule().set(1, due(1000))
    useWordSchedule().set(2, due(2000))
    useDeckStore('reading538').setSchedule(readingId, due(500))
    useDeckStore('listening179').setSchedule(1, due(Date.now() + 86400000))
    const w = await mountReview()
    expect(w.find('[data-card]').exists()).toBe(false)
    expect(w.find('[data-back]').attributes('href')).toBe('/study')
    const box = (d: string) => w.find(`[data-review-deck="${d}"]`).element as HTMLInputElement
    expect([box('vocabulary').checked, box('reading538').checked, box('listening179').checked, box('corpus').checked]).toEqual([true, true, false, false])
    expect(box('listening179').disabled).toBe(true)
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 3 个')
  })

  it('mixes the lists by due time, names each word’s list, and writes back to that list', async () => {
    useWordSchedule().set(1, due(1000))
    useDeckStore('reading538').setSchedule(readingId, due(500))
    const w = await mountReview()
    await start(w)
    expect(w.find('[data-word]').text()).toBe(readingWord)
    expect(w.find('[data-deck-label]').text()).toBe('来自 阅读考点词')
    await button(w, '模糊').trigger('click')
    await flushPromises()
    expect(useDeckStore('reading538').getSchedule(readingId)!.dueAt).toBeGreaterThan(Date.now())
    expect(useMistakes().mistakes.value.some(m => m.key === `reading538:${readingId}`)).toBe(true)
    expect(useWordSchedule().get(1)!.dueAt).toBe(1000)
    await button(w, '下一个').trigger('click')
    await flushPromises()
    expect(w.find('[data-deck-label]').text()).toContain('来自 词汇表 · ')
    await button(w, '认识').trigger('click')
    expect(useWordSchedule().get(1)!.dueAt).toBeGreaterThan(Date.now())
  })

  it('round size: 20 / 50 / all / a custom number, remembered next time; unticking a list leaves it out', async () => {
    for (const id of [1, 2, 3])
      useWordSchedule().set(id, due(id))
    useDeckStore('reading538').setSchedule(readingId, due(9))
    const w = await mountReview()
    expect(w.findAll('[data-count]').map((b: any) => b.text())).toEqual(['20 个', '50 个', '全部', '自定义数量'])
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 4 个')
    await w.find('[data-count="custom"]').trigger('click')
    const input = w.find('input[aria-label="自定义数量"]')
    await input.setValue('2')
    await input.trigger('change')
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 2 个，选中的词库一共 4 个到期')
    await w.find('[data-review-deck="vocabulary"]').setValue(false)
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 1 个')
    await w.find('[data-review-deck="vocabulary"]').setValue(true)
    const s = await start(w)
    expect(s.queue).toHaveLength(2)
    w.unmount()
    wrappers.pop()
    const again = await mountReview()
    expect(again.find('[data-count="custom"]').attributes('aria-pressed')).toBe('true')
    expect((again.find('input[aria-label="自定义数量"]').element as HTMLInputElement).value).toBe('2')
  })

  it('nothing due: says so and cannot start', async () => {
    const w = await mountReview()
    expect(w.find('[data-preview]').text()).toContain('今天没有到期要复习的词')
    expect(w.find('[data-start]').attributes('disabled')).toBeDefined()
  })

  it('the card screen goes back to the choice screen with fresh counts', async () => {
    useWordSchedule().set(1, due(1000))
    useWordSchedule().set(2, due(2000))
    const w = await mountReview()
    await start(w)
    await button(w, '认识').trigger('click')
    await w.findAll('button').find((b: any) => b.text().includes('返回选择'))!.trigger('click')
    await button(w, '退出').trigger('click')
    await settle()
    expect(w.find('[data-setup]').exists()).toBe(true)
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 1 个')
  })

  it('a word that appears in several chapters is one card; grading moves every copy and undo restores them', async () => {
    const all = await loader.loadAllVocabulary()
    const byWord = new Map<string, any[]>()
    for (const c of Object.values(all) as any[]) {
      for (const word of c.words.flat()) {
        const key = word.word[0].toLowerCase().trim()
        byWord.set(key, [...(byWord.get(key) || []), word])
      }
    }
    const duplicate = [...byWord.values()].find(words => words.length > 1)!
    const schedule = useWordSchedule()
    for (const word of duplicate)
      schedule.set(word.id, due(1))
    vi.spyOn(details, 'loadVocabularyDetails').mockResolvedValue({})
    vi.spyOn(wordInfo, 'loadWordInfoWithFallback').mockResolvedValue(null)
    const w = await mountReview()
    expect(w.find('[data-preview]').text()).toContain('这一轮复习 1 个')
    const s = await start(w)
    expect(s.queue).toHaveLength(1)
    expect(s.current.word.toLowerCase()).toBe(duplicate[0].word[0].toLowerCase())
    s.grade(5)
    for (const word of duplicate)
      expect(schedule.get(word.id)?.dueAt).toBeGreaterThan(Date.now())
    s.goBackOne()
    for (const word of duplicate)
      expect(schedule.get(word.id)?.dueAt).toBe(1)
    s.grade(5)
    s.restart()
    expect(s.queue).toHaveLength(0)
  })

  it('a vocabulary word plays the audio of its own chapter', async () => {
    const chapters = loader.listVocabularyChapters()
    const word = (await loader.loadVocabularyChapter(chapters[1]) as any).words[0][0]
    useWordSchedule().set(word.id, due(1))
    const w = await mountReview()
    const s = await start(w)
    expect(s.current.word).toBe(word.word[0])
    const play = vi.mocked(HTMLMediaElement.prototype.play)
    const el = play.mock.instances.at(-1) as unknown as HTMLAudioElement
    expect(decodeURIComponent(el.src)).toContain(`/${chapters[1]}/${word.word[0]}.mp3`)
  })
})

describe('vocabulary cards in 学新词 keep the old page’s detail handling', () => {
  async function learn() {
    const w = await mountPage(LearnPage, '/study/learn?deck=vocabulary')
    await until(() => w.find('[data-start]').attributes('disabled') === undefined)
    return { w, s: await start(w) }
  }

  it('details that arrive after a quick self-grade still land on the card being studied', async () => {
    let finish!: (data: any) => void
    vi.spyOn(details, 'loadVocabularyDetails').mockImplementation(() => new Promise<any>((resolve) => {
      finish = resolve
    }))
    const { s } = await learn()
    const id = s.current.id
    s.grade(5)
    await flushPromises()
    finish({ [String(id)]: { example: 'This verified example should be visible.', extra: 'useful notes' } })
    await flushPromises()
    expect(s.studying.id).toBe(id)
    expect(s.studying.example).toBe('This verified example should be visible.')
    expect(s.studying.extra).toBe('useful notes')
  })

  it('late details replace the mistake hint once without raising its count', async () => {
    let finish!: (data: any) => void
    vi.spyOn(details, 'loadVocabularyDetails').mockImplementation(() => new Promise<any>((resolve) => {
      finish = resolve
    }))
    vi.spyOn(wordInfo, 'loadWordInfoWithFallback').mockResolvedValue(null)
    const { s } = await learn()
    const id = s.current.id
    s.grade(0)
    const before = useMistakes().mistakes.value.find(m => m.key === `flashcard:${id}`)!
    expect(before.hint).toBeTruthy()
    finish({ [id]: { example: 'Independent late example.', extra: '' } })
    await flushPromises()
    const after = useMistakes().mistakes.value.find(m => m.key === `flashcard:${id}`)!
    expect(after.count).toBe(before.count)
    expect(after.hint).toBe('Independent late example.')
  })

  it('a failed detail load shows a retry and does not block the card', async () => {
    const load = vi.spyOn(details, 'loadVocabularyDetails').mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(wordInfo, 'loadWordInfoWithFallback').mockResolvedValue(null)
    const { s, w } = await learn()
    expect(s.cardDetailsError).toBe(true)
    expect(w.text()).toContain('重试加载')
    load.mockResolvedValue({ [String(s.current.id)]: { example: 'Recovered example.', extra: 'note' } })
    await s.retryWordInfo()
    await flushPromises()
    expect(s.cardDetailsError).toBe(false)
    expect(s.current.example).toBe('Recovered example.')
  })

  it('开始 is disabled while the chosen chapter is still loading', async () => {
    const w = await mountPage(LearnPage, '/study/learn?deck=vocabulary')
    await until(() => w.find('[data-start]').attributes('disabled') === undefined)
    let finish!: (data: any) => void
    const next = loader.listVocabularyChapters()[1]
    const real = await loader.loadVocabularyChapter(next)
    vi.spyOn(loader, 'loadVocabularyChapter').mockReturnValueOnce(new Promise<any>((resolve) => {
      finish = resolve
    }))
    await w.find('select[aria-label="章节"]').setValue(next)
    await flushPromises()
    expect(w.find('[data-start]').attributes('disabled')).toBeDefined()
    await w.find('[data-start]').trigger('click')
    expect(w.find('[data-card]').exists()).toBe(false)
    finish(real)
    await settle()
    expect(w.find('[data-start]').attributes('disabled')).toBeUndefined()
  })
})

describe('the old vocabulary card page is gone', () => {
  it('its address redirects: due review to 复习到期的词, the rest to 学新词', () => {
    const main = readFileSync('src/main.ts', 'utf8')
    expect(main).toContain('path: \'/vocabulary/flashcard\', redirect: to => to.query.review === \'due\' ? { path: \'/study/review\', query: {} } : { path: \'/study/learn\', query: { deck: \'vocabulary\' } }')
  })
})

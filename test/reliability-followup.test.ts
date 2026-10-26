import type { VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.doUnmock('../src/data/vocabulary/manifest')
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const chapter = { label: 'fixture', audio: '', groupCount: 1, wordCount: 1, words: [[{
  id: 1, word: ['fixture'], pos: 'n.', meaning: 'fixture meaning', example: 'local example', extra: '-', spellError: false, spellValue: '', showSource: false,
}]] }
const info = { sentences: { fixture: { ex: ['late dictionary example'], syn: [], exFrom: '' } }, positions: {}, meanings: {} }

it('loads base words even while optional information is pending, then retries information only', async () => {
  let reject!: (reason: Error) => void
  const words = vi.fn(async () => ({ default: chapter }))
  const resources = vi.fn().mockImplementationOnce(() => new Promise((_, rejectPromise) => { reject = rejectPromise })).mockResolvedValue({ default: info })
  vi.doMock('../src/data/vocabulary/manifest', () => ({ chapters: ['fixture'], chapterLoaders: { fixture: { words, info: resources } } }))
  const { useVocabularyChapter } = await import('../src/composables/useVocabularyChapter')
  let state!: ReturnType<typeof useVocabularyChapter>
  wrappers.push(mount({ setup() { state = useVocabularyChapter(ref('fixture'), true); return () => null } }))
  await flushPromises()
  const original = state.chapter.value
  expect(original?.words[0][0].word[0]).toBe('fixture')
  expect(state.loading.value).toBe(false)
  expect(state.infoLoading.value).toBe(true)
  reject(new Error('fixture network error'))
  await flushPromises()
  expect(state.error.value).toBe('')
  expect(state.infoError.value).toContain('本地词条')
  await state.reloadInfo()
  expect(state.chapter.value).toBe(original)
  expect(state.info.value.sentences.fixture.ex[0]).toContain('late dictionary')
  expect(words).toHaveBeenCalledOnce()
})

it('late information refreshes a flashcard without resetting its grading session', async () => {
  let finish!: (value: unknown) => void
  vi.doMock('../src/data/vocabulary/manifest', () => ({ chapters: ['fixture'], chapterLoaders: { fixture: {
    words: async () => ({ default: chapter }),
    info: () => new Promise(resolve => { finish = resolve }),
  } } }))
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const wrapper = mount(Page)
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain('local example')
  const grade = wrapper.findAll('button').find(button => button.text().trim() === '认识')!
  await grade.trigger('click')
  expect(wrapper.text()).toContain('fixture meaning')
  finish({ default: info })
  await flushPromises()
  expect(wrapper.text()).toContain('late dictionary example')
  // The expanded learning card and its grading remain in place.
  expect(wrapper.findAll('button').some(button => button.text().trim() === '认识')).toBe(false)
  const { useDailyGoal } = await import('../src/composables/useSpacedRepetition')
  expect(useDailyGoal().dailyCount.value).toBe(1)
})

describe('bounded draft persistence', () => {
  it('coalesces clock updates, persists within five seconds, and flushes the latest value on pagehide', async () => {
    vi.useFakeTimers()
    const { useEssayDraft } = await import('../src/composables/useEssayDraft')
    const { useDeadlineCountdown } = await import('../src/composables/useDeadlineCountdown')
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    let text!: Ref<string>
    let clock!: ReturnType<typeof useDeadlineCountdown>
    wrappers.push(mount({ setup() {
      text = ref('')
      clock = useDeadlineCountdown(() => {})
      useEssayDraft(1, text, clock.secondsLeft).open('fixture', 1200)
      text.value = 'latest essay'
      clock.start(1200)
      return () => null
    } }))
    await vi.advanceTimersByTimeAsync(4999)
    expect(localStorage.getItem('myielts_task1_drafts_v1')).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(localStorage.getItem('myielts_task1_drafts_v1')).toContain('latest essay')
    await vi.advanceTimersByTimeAsync(55000)
    expect(writes.mock.calls.filter(([key]) => key === 'myielts_task1_drafts_v1').length).toBeLessThanOrEqual(13)
    text.value = 'the final edit before navigation'
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem('myielts_task1_drafts_v1')).toContain('final edit')
  })

  it('flushes pending drafts during export and avoids claiming success before persistence', async () => {
    const { useEssayDraft } = await import('../src/composables/useEssayDraft')
    const { collectBackupData } = await import('../src/composables/useBackup')
    let text!: Ref<string>
    let draft!: ReturnType<typeof useEssayDraft>
    wrappers.push(mount({ setup() {
      text = ref('')
      draft = useEssayDraft(2, text, ref(2400))
      draft.open('fixture', 2400)
      return () => null
    } }))
    text.value = 'pending text'
    expect(draft.saving.value).toBe(true)
    const data = collectBackupData().data
    expect(JSON.parse(data.task2_drafts_v1).fixture.text).toBe('pending text')
    expect(draft.saving.value).toBe(false)
  })
})

it('accepts old writing mistakes and directs them to translation practice', async () => {
  const item = { key: 'writing:1', module: 'writing', title: '经常做运动会提高人的自信', detail: 'Regular exercise can increase one\'s self-confidence', count: 1, firstAt: 1, lastAt: 1 }
  localStorage.setItem('myielts_mistakes_v1', JSON.stringify([item]))
  const { useMistakes } = await import('../src/composables/useStudyData')
  expect(useMistakes().totalCount.value).toBe(1)
  const Mistakes = (await import('../src/pages/mistakes.vue')).default
  const wrapper = mount(Mistakes, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('写作翻译')
  expect(wrapper.find('a').attributes('href')).toBe('/writing?scope=mistakes')
  expect(wrapper.findAll('button').some(button => button.text().trim() === '开始复习')).toBe(false)
  const { createRouter, createMemoryHistory } = await import('vue-router')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/writing', component: { template: '<div />' } }] })
  await router.push('/writing?scope=mistakes')
  const Writing = (await import('../src/pages/writing/index.vue')).default
  const page = mount(Writing, { global: { plugins: [router] } })
  wrappers.push(page)
  await nextTick()
  expect(page.find('textarea').exists()).toBe(true)
  expect(page.text()).toContain('第 1 / 1 句')
})

it('preserves malformed legacy mock history for recovery without migrating it', async () => {
  localStorage.setItem('myielts_u_guest_mock_history_v1', '[null]')
  const { getMockHistory } = await import('../src/composables/useMockHistory')
  expect(getMockHistory()).toEqual([])
  expect(localStorage.getItem('myielts_u_guest_mock_history_v1')).toBe('[null]')
  expect(localStorage.getItem('myielts_u_guest_mock_history_v1__recovery')).toBe('[null]')
  expect(localStorage.getItem('myielts_mock_history_v1')).toBeNull()
})

it('uploads a flushed draft once without scheduling an identical follow-up snapshot', async () => {
  vi.useFakeTimers()
  const { useAuth } = await import('../src/composables/useAuth')
  const { setToken } = await import('../src/composables/syncClient')
  const { useSync } = await import('../src/composables/useSync')
  const { useEssayDraft } = await import('../src/composables/useEssayDraft')
  useAuth().currentUser.value = 'alice'
  setToken('fixture', 'alice')
  const sync = useSync()
  sync.ensureWired()
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
  vi.stubGlobal('fetch', fetchMock)
  wrappers.push(mount({ setup() {
    const text = ref('')
    const draft = useEssayDraft(1, text, ref(1200))
    draft.open('fixture', 1200)
    text.value = 'the snapshot includes this pending edit'
    return () => null
  } }))
  expect(await sync.pushNow()).toBe(true)
  await vi.advanceTimersByTimeAsync(8000)
  expect(fetchMock).toHaveBeenCalledOnce()
  const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
  expect(JSON.parse(body.data.myielts_u_alice_task1_drafts_v1).fixture.text).toContain('pending edit')
})

it('ignores optional information arriving from a previously selected chapter', async () => {
  let oldInfo!: (value: unknown) => void
  const secondInfo = { sentences: {}, positions: { second: 'n.' }, meanings: {} }
  vi.doMock('../src/data/vocabulary/manifest', () => ({ chapters: ['first', 'second'], chapterLoaders: {
    first: { words: async () => ({ default: chapter }), info: () => new Promise(resolve => { oldInfo = resolve }) },
    second: { words: async () => ({ default: { ...chapter, label: 'second' } }), info: async () => ({ default: secondInfo }) },
  } }))
  const { useVocabularyChapter } = await import('../src/composables/useVocabularyChapter')
  const selected = ref('first')
  let state!: ReturnType<typeof useVocabularyChapter>
  wrappers.push(mount({ setup() { state = useVocabularyChapter(selected, true); return () => null } }))
  selected.value = 'second'
  await flushPromises()
  oldInfo({ default: info })
  await flushPromises()
  expect(state.chapter.value?.label).toBe('second')
  expect(state.info.value.positions).toEqual({ second: 'n.' })
  expect(state.infoError.value).toBe('')
})

import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
// Regression coverage for the six findings reproduced against e655d33.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mockPage(kind: 'reading' | 'listening') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(`/mock/${kind}-test`)
  await router.isReady()
  const Component = kind === 'reading'
    ? (await import('../src/pages/mock/reading-test.vue')).default
    : (await import('../src/pages/mock/listening-test.vue')).default
  const wrapper = mount(Component, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await vi.dynamicImportSettled()
  await flushPromises()
  return wrapper
}

describe('account ownership of page sessions', () => {
  for (const kind of ['reading', 'listening'] as const) {
    it(`${kind} mock must discard the previous account answers on logout`, async () => {
      const { useAuth } = await import('../src/composables/useAuth')
      const auth = useAuth()
      auth.currentUser.value = 'alice'
      const wrapper = await mockPage(kind)
      await wrapper.findAll('button').find(button => button.text().includes('开始测试'))!.trigger('click')
      const answer = wrapper.find('input[placeholder="输入答案"]')
      await answer.setValue('alice-private-answer')
      auth.currentUser.value = null
      await nextTick()
      expect(wrapper.findAll('input').some(input => (input.element as HTMLInputElement).value === 'alice-private-answer')).toBe(false)
    })
  }

  it('keyword cards must rebuild new/review classification when the account changes', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    const { useDeckStore } = await import('../src/composables/useDeckStore')
    const deck = useDeckStore('listening179')
    deck.setSchedule('1', { ease: 2.5, interval: 1, dueAt: 0, reps: 1, lapses: 0 })
    const Component = (await import('../src/components/KeywordFlashcard.vue')).default
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/listening/flashcard')
    await router.isReady()
    const wrapper = mount(Component, { props: {
      ns: 'listening179', title: 'fixture', backTo: '/listening',
      cards: [{ id: '1', word: 'alpha', pos: 'n.', meaning: 'fixture', synonyms: [] }],
      audioFor: word => `https://example.invalid/${word}.mp3`,
      mistakeModule: 'listening', progressModule: 'listening_flashcard',
    }, global: { plugins: [router] } })
    wrappers.push(wrapper)
    auth.currentUser.value = null
    await nextTick()
    await wrapper.findAll('button').find(button => button.text() === '认识')!.trigger('click')
    expect(deck.dailyCount.value).toBe(1)
  })

  it('a mounted progress store must not persist an old queued write into another account', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { useProgress } = await import('../src/composables/useStudyData')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    const original = JSON.stringify({ reading: { done: 9, total: 40, updatedAt: 1 } })
    localStorage.setItem('myielts_u_bob_progress_v1', original)
    let progress!: ReturnType<typeof useProgress>
    wrappers.push(mount({ setup() { progress = useProgress(); return {} }, template: '<div />' }))
    progress.setProgress('reading', 1, 40)
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(localStorage.getItem('myielts_u_bob_progress_v1')).toBe(original)
  })
})

describe('listening normalization', () => {
  for (const word of ['press', 'online']) {
    it(`all documented synonyms for ${word} must be accepted`, async () => {
      const words = (await import('../src/pages/listening/listening179.json')).default
      const index = words.findIndex(item => item.word === word)
      const item = words[index]
      const Component = (await import('../src/pages/listening/179practice.vue')).default
      const wrapper = mount(Component)
      wrappers.push(wrapper)
      const row = wrapper.findAll('tbody tr')[index]
      const inputs = row.findAll('input')
      await inputs[0].setValue(item.word)
      await inputs[1].setValue(item.replace.join(', '))
      await inputs[1].trigger('keydown', { key: 'Enter' })
      const { useMistakes } = await import('../src/composables/useStudyData')
      expect(useMistakes().totalCount.value).toBe(0)
    })
  }
})

describe('recovered local data must produce restorable exports', () => {
  it('collected sync data must pass the matching cloud importer', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    localStorage.setItem('myielts_u_alice_mistakes_v1', 'null')
    const { useMistakes } = await import('../src/composables/useStudyData')
    expect(useMistakes().totalCount.value).toBe(0)
    const { collectSyncData, applySyncData } = await import('../src/composables/syncClient')
    const data = collectSyncData('alice')
    expect(() => applySyncData(data, 'alice')).not.toThrow()
  })

  it('an exported backup must pass the matching backup importer', async () => {
    localStorage.setItem('myielts_mistakes_v1', 'null')
    const { useMistakes } = await import('../src/composables/useStudyData')
    expect(useMistakes().totalCount.value).toBe(0)
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    const backup = collectBackupData()
    localStorage.clear()
    const result = await importBackup({ size: 100, text: async () => JSON.stringify(backup) } as File)
    expect(result.ok).toBe(true)
  })
})

describe('wall clock and network interruption', () => {
  it('reading countdown must include ten minutes elapsed while callbacks are delayed', async () => {
    const wrapper = await mockPage('reading')
    vi.useFakeTimers()
    // Move forward from mount time so Vue's stale-event timestamp guard does
    // not discard the synthetic click as an event from before mount.
    const start = Date.now() + 60000
    vi.setSystemTime(start)
    await wrapper.findAll('button').find(button => button.text().includes('开始测试'))!.trigger('click')
    vi.setSystemTime(start + 10 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(1000)
    const displayed = wrapper.findAll('span').map(span => span.text().match(/\d{2}:\d{2}/)?.[0]).find(Boolean)
    expect(displayed).toBe('49:59')
  })

  it('an indefinitely pending sync request must not prevent local logout for over a minute', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    setToken('fixture', 'alice')
    let finish!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve })))
    const pending = auth.logout()
    await vi.advanceTimersByTimeAsync(60000)
    const locallyLoggedOut = auth.currentUser.value === null
    finish({ ok: true, json: async () => ({ ok: true }) })
    await pending
    expect(locallyLoggedOut).toBe(true)
  })
})

import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const scopes: ReturnType<typeof effectScope>[] = []
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  scopes.splice(0).forEach(s => s.stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function scoped<T>(fn: () => T): T {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(fn)!
}

describe('owner-bound persistence', () => {
  it('settles multiple mutations once and flushes old account before switching', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { useAccountData } = await import('../src/composables/useAccountData')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    const state = scoped(() => useAccountData<Record<string, { done: number; total: number; updatedAt: number }>>('progress_v1', () => ({})))
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    for (let i = 1; i <= 20; i++) state.value.reading = { done: i, total: 40, updatedAt: i }
    auth.currentUser.value = 'bob'
    expect(JSON.parse(localStorage.getItem('myielts_u_alice_progress_v1')!).reading.done).toBe(20)
    expect(state.value).toEqual({})
    state.value.reading = { done: 3, total: 40, updatedAt: 30 }
    await nextTick()
    expect(writes.mock.calls.filter(([key]) => key === 'myielts_u_alice_progress_v1')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('myielts_u_bob_progress_v1')!).reading.done).toBe(3)
    auth.currentUser.value = 'alice'
    expect(state.value.reading.done).toBe(20)
  })

  it('exports pending changes even before the persistence microtask runs', async () => {
    const { useAccountData } = await import('../src/composables/useAccountData')
    const state = scoped(() => useAccountData<string[]>('reading_mastered_v1', () => []))
    state.value.push('fixture')
    const { collectBackupData } = await import('../src/composables/useBackup')
    expect(JSON.parse(collectBackupData().data.reading_mastered_v1)).toEqual(['fixture'])
  })

  it('refuses to upload an incomplete snapshot and preserves corrupt bytes in backup', async () => {
    const { useAuth, readJson, writeJson } = await import('../src/composables/useAuth')
    const { apiPush, collectSyncData } = await import('../src/composables/syncClient')
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    useAuth().currentUser.value = 'alice'
    localStorage.setItem('myielts_u_alice_mistakes_v1', 'broken original')
    readJson('myielts_u_alice_mistakes_v1', [], 'mistakes_v1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await apiPush(collectSyncData('alice'), 'fixture')
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    writeJson('myielts_u_alice_mistakes_v1', [])
    const backup = collectBackupData()
    expect(backup.recovery?.mistakes_v1).toBe('broken original')
    expect(JSON.parse(backup.data.mistakes_v1)).toEqual([])
    localStorage.clear()
    useAuth().currentUser.value = 'bob'
    expect((await importBackup({ size: 100, text: async () => JSON.stringify(backup) } as File)).ok).toBe(true)
    expect(localStorage.getItem('myielts_u_bob_mistakes_v1__recovery')).toBe('broken original')
    expect(localStorage.getItem('myielts_u_bob_mistakes_v1')).toBe('[]')
  })
})

describe('deadline clock and request deadlines', () => {
  it('counts real elapsed time, pauses, resumes and expires only once', async () => {
    vi.useFakeTimers()
    const { useDeadlineCountdown } = await import('../src/composables/useDeadlineCountdown')
    const expire = vi.fn()
    const clock = scoped(() => useDeadlineCountdown(expire))
    const start = Date.now()
    clock.start(120)
    vi.setSystemTime(start + 30000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.secondsLeft.value).toBe(90)
    clock.pause()
    await vi.advanceTimersByTimeAsync(60000)
    expect(clock.secondsLeft.value).toBe(90)
    clock.resume()
    await vi.advanceTimersByTimeAsync(90000)
    expect(clock.secondsLeft.value).toBe(0)
    expect(expire).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10000)
    expect(expire).toHaveBeenCalledOnce()
  })

  it('times out an uncooperative fetch and releases the upload queue', async () => {
    vi.useFakeTimers()
    const { apiPush } = await import('../src/composables/syncClient')
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn().mockImplementationOnce((_: unknown, options: RequestInit) => {
      signal = options.signal
      return new Promise(() => {})
    }).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const first = apiPush({}, 'fixture').catch(e => e as Error)
    const second = apiPush({}, 'fixture')
    await vi.advanceTimersByTimeAsync(15000)
    expect((await first as Error).message).toContain('超时')
    expect(signal?.aborted).toBe(true)
    expect((await second).ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('an old pending logout does not clear a new account session', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken, getToken } = await import('../src/composables/syncClient')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    setToken('alice-token', 'alice')
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const logout = auth.logout()
    auth.currentUser.value = 'bob'
    setToken('bob-token', 'bob')
    await vi.advanceTimersByTimeAsync(5000)
    await logout
    expect(auth.currentUser.value).toBe('bob')
    expect(getToken()).toBe('bob-token')
  })
})

describe('writing drafts', () => {
  for (const task of [1, 2] as const) {
    it(`Task ${task} restores drafts per prompt, pauses elapsed time and isolates accounts`, async () => {
      const { useAuth } = await import('../src/composables/useAuth')
      const { useEssayDraft } = await import('../src/composables/useEssayDraft')
      const auth = useAuth()
      auth.currentUser.value = 'alice'
      const text = ref('')
      const seconds = ref(100)
      const draft = scoped(() => useEssayDraft(task, text, seconds))
      draft.open('one', 100)
      text.value = 'private draft'
      seconds.value = 70
      draft.close()
      draft.open('two', 100)
      expect(text.value).toBe('')
      draft.open('one', 100)
      expect(text.value).toBe('private draft')
      expect(seconds.value).toBe(70)
      auth.currentUser.value = 'bob'
      text.value = ''
      draft.open('one', 100)
      expect(text.value).toBe('')
      text.value = 'bob draft'
      await nextTick()
      auth.currentUser.value = 'alice'
      draft.open('one', 100)
      expect(text.value).toBe('private draft')
      draft.discard()
      draft.open('one', 100)
      expect(text.value).toBe('')
      expect(localStorage.getItem(`myielts_u_bob_task${task}_drafts_v1`)).toContain('bob draft')
    })

    it(`Task ${task} recovers textarea after component unmount and remount`, async () => {
      const Component = task === 1
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
      const options = { global: { stubs: { AIGradePanel: true, TaskChart: true, ModelEssayView: true } } }
      let wrapper = mount(Component, options)
      wrappers.push(wrapper)
      const start = () => wrapper.findAll('button').find(button => /开始写|开始练|写作|练习/.test(button.text()) && !button.text().includes('评分'))!
      expect(start()).toBeDefined()
      await start().trigger('click')
      await wrapper.find('textarea').setValue('A recoverable essay draft with several words.')
      wrapper.unmount()
      wrappers.pop()
      await nextTick()
      wrapper = mount(Component, options)
      wrappers.push(wrapper)
      await start().trigger('click')
      expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('recoverable essay')
      expect(wrapper.text()).toContain('已恢复此题草稿')
    })
  }
})

describe('storage failure visibility', () => {
  it('shows a failed draft save when storage is full and clears it after retry', async () => {
    const { useEssayDraft } = await import('../src/composables/useEssayDraft')
    const text = ref('')
    const seconds = ref(100)
    const draft = scoped(() => useEssayDraft(1, text, seconds))
    draft.open('fixture', 100)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    const { flushStudyWrites } = await import('../src/utils/studyWriteQueue')
    text.value = 'cannot fit'
    flushStudyWrites()
    await nextTick()
    expect(draft.saveFailed.value).toBe(true)
    spy.mockRestore()
    text.value = 'now fits'
    flushStudyWrites()
    await nextTick()
    expect(draft.saveFailed.value).toBe(false)
    expect(localStorage.getItem('myielts_task1_drafts_v1')).toContain('now fits')
  })
})

describe('lazy vocabulary pages', () => {
  it('keeps all original chapter groups, words and stable IDs', async () => {
    const original = (await import('../src/pages/vocabulary/vocabulary')).default
    const { chapters, loadVocabularyChapter, loadChapterInfo } = await import('../src/composables/useVocabularyChapter')
    const { wordSentences } = await import('../src/pages/vocabulary/wordSentences')
    const { parseExtra } = await import('../src/pages/vocabulary/extraParser')
    expect([...chapters]).toEqual(Object.keys(original))
    for (const chapter of chapters) {
      const loaded = await loadVocabularyChapter(chapter)
      expect(loaded).toEqual(original[chapter])
      const info = await loadChapterInfo(chapter)
      for (const word of loaded.words.flat()) {
        for (const key of [...word.word, ...parseExtra(word.extra).map(e => e.word)].map(w => w.toLowerCase().trim())) {
          if (wordSentences[key]) expect(info.sentences[key]).toEqual(wordSentences[key])
        }
      }
      loaded.words[0][0].spellValue = 'mutated'
      expect((await loadVocabularyChapter(chapter)).words[0][0].spellValue).toBe('')
    }
  })

  it('renders chapter selector before data and retains only the latest selection', async () => {
    const Page = (await import('../src/pages/vocabulary/index.vue')).default
    const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } })
    wrappers.push(wrapper)
    const select = wrapper.find('select')
    expect(select.findAll('option')).toHaveLength(22)
    await select.setValue('02_植物研究')
    await select.setValue('01_自然地理')
    await vi.dynamicImportSettled()
    await flushPromises()
    expect(wrapper.text()).toContain('atmosphere')
    expect(wrapper.findAll('tbody')).toHaveLength(1)
  })
})

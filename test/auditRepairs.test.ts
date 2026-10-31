// Regressions for independently reproduced data-loss and synchronization failures.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { setToken } from '../src/composables/syncClient'
import {
  accountKey,
  readRecords,
  saveRecord,
  storageFailures,
} from '../src/utils/storage'
import { readDraft, saveDraft } from '../src/utils/drafts'
import { useMistakes } from '../src/composables/useStudyData'

const auth = useAuth()
const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function page(Page: any) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  })
  await router.push('/')
  await router.isReady()
  const w = mount(Page, {
    global: {
      plugins: [router],
      stubs: {
        AIGradePanel: true,
        ModelEssayView: true,
        TaskChart: true,
        ReadingTabs: true,
        ListeningTabs: true,
      },
    },
  })
  wrappers.push(w)
  await flushPromises()
  const s = (w.vm as any).$.setupState
  for (let i = 0; s.loading && i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
  return { w, s }
}
it.each(['task1', 'task2'])(
  '%s retains its draft when history storage fails',
  async (task) => {
    const { TASK1_PROMPTS } = await import(
      '../src/pages/writing/task1/prompts'
    )
    const { CAMBRIDGE_WRITING } = await import(
      '../src/pages/writing/cambridge'
    )
    const p
      = task === 'task1'
        ? TASK1_PROMPTS[0]
        : CAMBRIDGE_WRITING.find(p => p.task === 2)!
    const text = 'A complete sentence describes the change clearly. '.repeat(
      40,
    )
    saveDraft(task as any, 'alice', { promptId: p.id, text, secondsLeft: 500 })
    const Page
      = task === 'task1'
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
    const { s } = await page(Page)
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.includes(`${task}_essays_v1__entry_`))
        throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    s.submitEssay()
    expect(s.view).toBe('result')
    expect(readRecords(`${task}_essays_v1`, 'alice')).toEqual({})
    expect(readDraft(task as any, 'alice', p.id)?.text).toBe(text)
  },
)
it.each(['reading', 'listening'])(
  '%s submission preserves sibling tab drafts',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    const otherKey = `${accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')}__session_other`
    localStorage.setItem(
      otherKey,
      JSON.stringify({
        version: 1,
        kind,
        testId: 'cam21-test1',
        answers: { Q1: 'independent tab answer' },
        timeLeft: 777,
        updatedAt: Date.now() - 100,
      }),
    )
    s.submit()
    expect(JSON.parse(localStorage.getItem(otherKey)!).submitted).not.toBe(
      true,
    )
    await new Promise(resolve => setTimeout(resolve, 3))
    s.recovery.refresh()
    expect(localStorage.getItem(otherKey)).not.toBeNull()
  },
)
it.each(['reading', 'listening'])(
  '%s failed submission retains latest answers',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    s.answers.Q1 = 'answer not in history'
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.includes('mock_history_v1__entry_'))
        throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    s.submit()
    expect(readRecords('mock_history_v1', 'alice')).toEqual({})
    expect(s.recovery.draft.value.submitted).not.toBe(true)
    expect(s.recovery.draft.value.answers.Q1).toBe('answer not in history')
    // refresh rejects/deletes the snapshot if its millisecond equals the tombstone;
    // otherwise startTest explicitly ignores submitted snapshots. Both lose resume.
    expect(s.recovery.error.value).toContain('保存失败')
  },
)
it('179 guard sees outstanding failures on other devices', () => {
  const key = 'listening179:1'
  saveRecord(
    'mistake_parts_v2',
    `${key}|previous-session`,
    {
      key,
      module: 'listening',
      title: 'test',
      detail: '',
      count: 1,
      firstAt: Date.now(),
      lastAt: Date.now(),
      epoch: '',
      days: { '2026-10-31': 1 },
    },
    'alice',
  )
  expect(useMistakes().mistakeOutstanding(key).outstanding).toBe(true)
})
it('opening vocabulary preserves existing cloud progress', async () => {
  saveRecord('progress_v1', 'vocabulary', { done: 100, total: 241 }, 'alice')
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  await page(Page)
  expect(readRecords<any>('progress_v1', 'alice').vocabulary.done).toBe(100)
})
it('spelling tabs preserve answers in different chapters', async () => {
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const a = await page(Page)
  const b = await page(Page)
  const ac = a.s.category
  const bc = Object.keys(b.s.refVocabulary).find(c => c !== ac)!
  const wa = a.s.refVocabulary[ac].words[0][0]
  const wb = b.s.refVocabulary[bc].words[0][0]
  a.s.onInputFocusOut({ target: { id: 'first', value: wa.word[0] } }, wa)
  b.s.category = bc
  await nextTick()
  b.s.onInputFocusOut({ target: { id: 'second', value: wb.word[0] } }, wb)
  const saved = readRecords<string>('vocabulary_spell_v2', 'alice')
  expect(saved[`${ac}|${wa.id}`]).toBe(wa.word[0].toLowerCase())
  expect(saved[`${bc}|${wb.id}`]).toBe(wb.word[0].toLowerCase())
})
it('cross-chapter audio uses its original chapter', async () => {
  const { default: vocabulary } = await import(
    '../src/pages/vocabulary/vocabulary'
  )
  const chapters = Object.keys(vocabulary)
  const w = (vocabulary as any)[chapters[1]].words[0][0]
  saveRecord(
    'sr_vocabulary_v1',
    `vocab:${w.id}`,
    { ease: 2.5, interval: 1, dueAt: Date.now() - 1000, reps: 1, lapses: 0 },
    'alice',
  )
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s } = await page(Page)
  s.crossChapter = true
  await nextTick()
  expect(s.current.word).toBe(w.word[0])
  const play = vi.mocked(HTMLMediaElement.prototype.play)
  const el = play.mock.instances.at(-1) as unknown as HTMLAudioElement
  expect(decodeURIComponent(el.src)).toContain(
    `/${chapters[1]}/${w.word[0]}.mp3`,
  )
  expect(decodeURIComponent(el.src)).not.toContain(`/${chapters[0]}/`)
})
it('delayed review cannot delete another identity mistake', async () => {
  const m = useMistakes()
  m.addMistake('typing', { key: 'typing:example', title: 'example' })
  auth.currentUser.value = null
  m.addMistake('typing', { key: 'typing:example', title: 'example' })
  auth.currentUser.value = 'alice'
  const Page = (await import('../src/pages/mistakes.vue')).default
  const { w, s } = await page(Page)
  vi.useFakeTimers()
  s.startReview()
  s.reviewInput = 'example'
  s.submitAnswer()
  expect(s.reviewState).toBe('correct')
  setToken('bob-token', 'bob')
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'myielts_sync_token_v1' }),
  )
  expect(auth.currentUser.value).toBeNull()
  w.unmount()
  wrappers.splice(wrappers.indexOf(w), 1)
  await vi.advanceTimersByTimeAsync(800)
  expect(
    m.mistakes.value.find(x => x.key === 'typing:example'),
  ).toBeDefined()
  auth.currentUser.value = 'alice'
  expect(
    m.mistakes.value.find(x => x.key === 'typing:example'),
  ).toBeUndefined()
})
it('mistake review accepts alternate spelling', async () => {
  useMistakes().addMistake('vocabulary', {
    key: 'vocabulary:20',
    title: 'jeopardise / jeopardize',
  })
  const Page = (await import('../src/pages/mistakes.vue')).default
  const { s } = await page(Page)
  s.startReview()
  s.reviewInput = 'jeopardize'
  s.submitAnswer()
  expect(s.reviewState).toBe('correct')
})

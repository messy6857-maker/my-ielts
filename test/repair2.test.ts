// Correct-behavior regressions for the repair self-audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { emergencyWritingDrafts, listDrafts, readDraft, saveDraft } from '../src/utils/drafts'
import {
  accountNotice,
  accountNotices,
  useAuth,
} from '../src/composables/useAuth'
import {
  accountKey,
  entryKey,
  readRecords,
  saveEnvelope,
  saveRecord,
  storageFailures,
} from '../src/utils/storage'
import { previewStudyBackup, restoreStudyBackup } from '../src/utils/backup'
import { pruneCollectionData } from '../src/utils/retention'
import { getDeviceId, useStudyTimer } from '../src/composables/useStudyTimer'
import { studyDay, useMistakes } from '../src/composables/useStudyData'
import { setToken } from '../src/composables/syncClient'
import * as vocabularyDetails from '../src/composables/useVocabularyDetails'

const auth = useAuth()
const wrappers: any[] = []
beforeEach(() => {
  emergencyWritingDrafts.clear()
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  setToken('audit-local-only', 'alice')
  accountNotice.value = ''
  accountNotices.value = []
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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  for (let i = 0; s.loading && i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
  return { w, s, router }
}
it.each(['reading', 'listening'])(
  'D01 %s mock stores the same real score shown on screen',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    const q = s.allQuestions[0]
    s.answers[q.id] = Array.isArray(q.answer)
      ? String(q.answer[0])
      : String(q.answer)
    await s.submit()
    expect(s.correctCount).toBe(1)
    const records = Object.values(readRecords<any>('mock_history_v1', 'alice'))
    expect(records).toHaveLength(1)
    expect(records[0].score).toBe(1)
    expect(records[0].band).toBe(s.band)
  },
)
it.each(['task1', 'task2'])(
  'D02 %s retrying an older failed essay preserves a different unfinished draft',
  async (task) => {
    const { TASK1_PROMPTS } = await import(
      '../src/pages/writing/task1/prompts'
    )
    const { CAMBRIDGE_WRITING } = await import(
      '../src/pages/writing/cambridge'
    )
    const prompts
      = task === 'task1'
        ? TASK1_PROMPTS
        : CAMBRIDGE_WRITING.filter(p => p.task === 2)
    const a = prompts[0]
    const b = prompts[1]
    const text
      = 'The chart shows that sales rose steadily during the entire period. '.repeat(
        30,
      )
    saveDraft(task as any, 'alice', { promptId: a.id, text, secondsLeft: 500 })
    const Page
      = task === 'task1'
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
    const { s } = await page(Page)
    const original = Storage.prototype.setItem
    const failing = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key.includes(`${task}_essays_v1__entry_`))
          throw new DOMException('quota', 'QuotaExceededError')
        original.call(this, key, value)
      })
    s.submitEssay()
    expect(s.archiveError).toContain('存档失败')
    failing.mockRestore()
    s.backHome()
    s.startWrite(b)
    s.essayText = 'A different unfinished essay that must survive.'
    s.saveDraftNow()
    s.backHome()
    expect(readDraft(task as any, 'alice', b.id)?.text).toContain(
      'must survive',
    )
    s.retryArchive()
    expect(readDraft(task as any, 'alice', b.id)?.text).toContain(
      'must survive',
    )
  },
)
it.each(['reading', 'listening'])(
  'D03 %s retires a resumed former-tab attempt after successful submission',
  async (kind) => {
    const key = `${accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')}__session_former-tab`
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        kind,
        testId: 'cam21-test1',
        answers: { Q1: 'old attempt' },
        timeLeft: 500,
        updatedAt: Date.now(),
      }),
    )
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    await s.submit()
    s.recovery.refresh()
    expect(s.recovery.draft.value).toBeNull()
  },
)
it('D04 retains timer and overtime revisions even when the writing text is unchanged', () => {
  const old = `${accountKey('task1_draft_v1', 'alice')}__prompt_same__session_former`
  localStorage.setItem(
    old,
    JSON.stringify({
      promptId: 'same',
      text: 'unchanged original',
      secondsLeft: 500,
      overtime: false,
      editedAt: 100,
      updatedAt: 100,
    }),
  )
  readDraft('task1', 'alice', 'same')
  saveDraft('task1', 'alice', {
    promptId: 'same',
    text: 'unchanged original',
    secondsLeft: 0,
    overtime: true,
  })
  const restored = readDraft('task1', 'alice', 'same')
  expect(listDrafts('task1', 'alice')).toHaveLength(2)
  expect(restored?.secondsLeft).toBe(0)
  expect(restored?.overtime).toBe(true)
})
it('D05 importing a second-device yearly check-in backup preserves the union', () => {
  const key = entryKey('checkin_years_v2', '2026', 'alice')
  saveEnvelope(key, { __ielts: 2, stamp: [1, 'device-a'], value: [1, 2] })
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: {
        [key]: JSON.stringify({
          __ielts: 2,
          stamp: [2, 'device-b'],
          value: [3],
        }),
      },
    }),
  )
  expect(restoreStudyBackup(preview, 'alice').imported).toBe(1)
  expect(readRecords('checkin_years_v2', 'alice')['2026']).toEqual([1, 2, 3])
})
it('D06 deleted history never forces collection of a still-retained sole live essay', () => {
  const entries: Record<string, string> = {}
  const oldId = String(1700000000000)
  const old = entryKey('task1_essays_v1', oldId, 'alice')
  entries[old] = JSON.stringify({
    __ielts: 2,
    stamp: [1, 'writer'],
    value: { id: oldId, text: 'the only saved essay' },
  })
  for (let i = 1; i <= 101; i++) {
    entries[entryKey('task1_essays_v1', String(1700000000000 + i), 'alice')]
      = JSON.stringify({ __ielts: 2, stamp: [i, 'writer'], deleted: true })
  }
  const pruned = pruneCollectionData(entries, 'alice')
  expect(pruned[old]).toBeDefined()
  expect(
    Object.values(pruned).some(
      raw => JSON.parse(raw as string).value?.text === 'the only saved essay',
    ),
  ).toBe(true)
})
it('D07 live timer unions overlapping activity received from another tab', async () => {
  vi.useFakeTimers()
  const timer = useStudyTimer()
  timer.start()
  await vi.advanceTimersByTimeAsync(15000)
  expect(timer.dailySeconds.value).toBe(15)
  const now = Date.now()
  const key = entryKey('timer_sessions_v2', `other:${studyDay()}`, 'alice')
  saveRecord(
    'timer_sessions_v2',
    `other:${studyDay()}`,
    { date: studyDay(), device: getDeviceId(), start: now - 15000, end: now },
    'alice',
  )
  window.dispatchEvent(new StorageEvent('storage', { key }))
  expect(timer.dailySeconds.value).toBe(15)
  timer.dispose()
})
it('D08 valid capitalized spelling survives reload with immediately saved progress', async () => {
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const { s } = await page(Page)
  const item = s.refVocabulary[s.category].words[0][0]
  s.onSpellInput({ target: { value: item.word[0].toUpperCase() } }, item)
  s.restoreSpellValues()
  expect(item.spellError).toBe(false)
  expect(
    readRecords<any>('progress_v1', 'alice')[`spelling:${s.category}`].done,
  ).toBeGreaterThan(0)
  s.onInputFocusOut({ target: { id: 'word-1', value: item.spellValue } }, item)
  expect(item.spellError).toBe(false)
})
it('D09 quick self-grading preserves the pending notes for the card still being studied', async () => {
  let finish!: (data: any) => void
  vi.spyOn(vocabularyDetails, 'loadVocabularyDetails').mockImplementation(
    () =>
      new Promise<any>((resolve) => {
        finish = resolve
      }),
  )
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s } = await page(Page)
  const id = s.current.id
  s.grade(5)
  await nextTick()
  finish({
    [String(id)]: {
      example: 'This verified example should be visible.',
      extra: 'useful notes',
    },
  })
  await flushPromises()
  expect(s.studying.id).toBe(id)
  expect(s.studying.example).toBe('This verified example should be visible.')
  expect(s.studying.extra).toBe('useful notes')
})
it('D10 legacy table import reports failed writes accurately', () => {
  const key = accountKey('progress_v1', 'alice')
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: { [key]: JSON.stringify({ reading: { done: 1, total: 10 } }) },
    }),
  )
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key.includes('progress_v1__entry_'))
      throw new DOMException('quota', 'QuotaExceededError')
    original.call(this, key, value)
  })
  const result = restoreStudyBackup(preview, 'alice')
  expect(result).toEqual({ imported: 0, keptNewer: 0, failed: 1 })
  expect(readRecords('progress_v1', 'alice')).toEqual({})
})
it('D11 local undo decrements only its own mistake writer', () => {
  const m = useMistakes()
  const key = 'flashcard:1'
  const now = Date.now()
  const day = studyDay()
  m.addMistake('flashcard', { key, title: 'atmosphere' })
  saveRecord(
    'mistake_parts_v2',
    `${key}|other-writer`,
    {
      key,
      module: 'flashcard',
      title: 'atmosphere',
      detail: '',
      count: 1,
      epoch: '',
      firstAt: now,
      lastAt: now + 1000,
      days: { [day]: 1 },
    },
    'alice',
  )
  m.decrementMistake(key, day)
  const parts = readRecords<any>('mistake_parts_v2', 'alice')
  expect(parts[`${key}|other-writer`].count).toBe(1)
  expect(
    Object.entries(parts).find(([id]) => id !== `${key}|other-writer`)?.[1]
      .count,
  ).toBe(0)
})
it('D12 returning to the exam owner retires only its queued pause notice', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.startTest()
  auth.currentUser.value = 'bob'
  await nextTick()
  accountNotice.value = 'A later synchronization error'
  auth.currentUser.value = 'alice'
  await nextTick()
  expect(s.recovery.blocked.value).toBe(false)
  expect(s.recovery.error.value).toBe('')
  expect(
    accountNotices.value.some(n => n.message.includes('本次模考已暂停')),
  ).toBe(false)
})
it.each(['task1', 'task2'])(
  'D14 %s logout cancels after a failed draft flush and preserves the unsaved essay',
  async (task) => {
    const { TASK1_PROMPTS } = await import(
      '../src/pages/writing/task1/prompts'
    )
    const { CAMBRIDGE_WRITING } = await import(
      '../src/pages/writing/cambridge'
    )
    const prompt
      = task === 'task1'
        ? TASK1_PROMPTS[0]
        : CAMBRIDGE_WRITING.find(p => p.task === 2)!
    const Page
      = task === 'task1'
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
    const { s } = await page(Page)
    s.startWrite(prompt)
    s.essayText
      = 'This draft has not yet been stored and must remain recoverable.'
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.includes(`${task}_draft_v1`))
        throw new DOMException('quota', 'QuotaExceededError')
      original.call(this, key, value)
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
      })),
    )
    expect(s.saveDraftNow()).toBe(false)
    await auth.logout()
    await flushPromises()
    expect(auth.currentUser.value).toBe('alice')
    expect(s.essayText).toContain('must remain recoverable')
    expect(readDraft(task as any, 'alice', prompt.id)).toBeNull()
  },
)

it('D05b normal legacy-stamped yearly sets union during backup restore', () => {
  const key = entryKey('checkin_years_v2', '2026', 'alice')
  saveEnvelope(key, { __ielts: 2, stamp: [0, 'legacy'], value: [1, 2] })
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: {
        [key]: JSON.stringify({ __ielts: 2, stamp: [0, 'legacy'], value: [3] }),
      },
    }),
  )
  expect(restoreStudyBackup(preview, 'alice').imported).toBe(1)
  expect(readRecords('checkin_years_v2', 'alice')['2026']).toEqual([1, 2, 3])
})

it.each(['reading', 'listening'])(
  'D01 %s retry preserves the real score after a history write failure',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    const q = s.allQuestions[0]
    s.answers[q.id] = Array.isArray(q.answer)
      ? String(q.answer[0])
      : String(q.answer)
    const original = Storage.prototype.setItem
    const failing = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key.includes('mock_history_v1__entry_'))
          throw new DOMException('quota', 'QuotaExceededError')
        original.call(this, key, value)
      })
    await s.submit()
    expect(s.recordSaveFailed).toBe(true)
    failing.mockRestore()
    await s.retrySaveResult()
    const records = Object.values(readRecords<any>('mock_history_v1', 'alice'))
    expect(records).toHaveLength(1)
    expect(records[0].score).toBe(1)
  },
)
it.each(['task1', 'task2'])(
  'D14 %s failed forced-switch draft survives unmount and remains private to its owner',
  async (task) => {
    const Page
      = task === 'task1'
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
    const { TASK1_PROMPTS } = await import(
      '../src/pages/writing/task1/prompts'
    )
    const { CAMBRIDGE_WRITING } = await import(
      '../src/pages/writing/cambridge'
    )
    const prompt
      = task === 'task1'
        ? TASK1_PROMPTS[0]
        : CAMBRIDGE_WRITING.find(p => p.task === 2)!
    const { s, w } = await page(Page)
    s.startWrite(prompt)
    s.essayText = 'Emergency original which must not enter another account.'
    const original = Storage.prototype.setItem
    const failing = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key.includes(`${task}_draft_v1`))
          throw new DOMException('quota', 'QuotaExceededError')
        original.call(this, key, value)
      })
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(s.essayText).toBe('')
    w.unmount()
    wrappers.splice(wrappers.indexOf(w), 1)
    failing.mockRestore()
    auth.currentUser.value = 'alice'
    const recovered = await page(Page)
    expect(recovered.s.essayText).toContain('Emergency original')
    expect(recovered.s.saveDraftNow()).toBe(true)
    expect(readDraft(task as any, 'alice', prompt.id)?.text).toContain(
      'Emergency original',
    )
    expect(readDraft(task as any, 'bob', prompt.id)).toBeNull()
  },
)
it.each(['reading', 'listening'])(
  'D03 %s completion retires stale snapshots of the same attempt but keeps independent attempts',
  async (kind) => {
    const prefix = accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')
    const old = {
      version: 1,
      kind,
      testId: 'cam21-test1',
      attemptId: 'resumed-attempt',
      answers: { Q1: 'old' },
      timeLeft: 500,
      updatedAt: Date.now(),
    }
    localStorage.setItem(`${prefix}__session_former`, JSON.stringify(old))
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s } = await page(Page)
    s.startTest()
    await s.submit()
    localStorage.setItem(
      `${prefix}__session_former`,
      JSON.stringify({ ...old, updatedAt: Date.now() + 1000 }),
    )
    const independent = {
      ...old,
      attemptId: 'independent-attempt',
      answers: { Q1: 'independent' },
      updatedAt: Date.now(),
    }
    localStorage.setItem(
      `${prefix}__session_independent`,
      JSON.stringify(independent),
    )
    s.recovery.refresh()
    expect(s.recovery.draft.value?.answers.Q1).toBe('independent')
  },
)

it('D10 partial legacy import reports each actual record and retries only missing entries', () => {
  const table = accountKey('progress_v1', 'alice')
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: {
        [table]: JSON.stringify({
          first: { done: 1, total: 2 },
          second: { done: 2, total: 3 },
        }),
      },
    }),
  )
  const original = Storage.prototype.setItem
  const fail = entryKey('progress_v1', 'second', 'alice')
  const failing = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, key, value) {
      if (key === fail)
        throw new DOMException('quota', 'QuotaExceededError')
      original.call(this, key, value)
    })
  expect(restoreStudyBackup(preview, 'alice')).toEqual({
    imported: 1,
    keptNewer: 0,
    failed: 1,
  })
  failing.mockRestore()
  expect(restoreStudyBackup(preview, 'alice')).toEqual({
    imported: 1,
    keptNewer: 1,
    failed: 0,
  })
  expect(Object.keys(readRecords('progress_v1', 'alice'))).toHaveLength(2)
})

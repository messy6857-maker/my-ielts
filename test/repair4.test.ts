import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  accountNotice,
  accountNotices,
  useAuth,
} from '../src/composables/useAuth'
import {
  apiPull,
  apiPush,
  applySyncData,
  collectSyncData,
  setToken,
} from '../src/composables/syncClient'
import {
  accountKey,
  entryKey,
  readRecord,
  saveEnvelope,
  saveRecord,
  storageFailures,
} from '../src/utils/storage'
import { compactDeletionData, deletedTarget } from '../src/utils/retention'
import { examSessionId } from '../src/utils/examDrafts'
import { mergeLegacy } from '../src/utils/legacyMerge'
import { transcriptSentenceEntries } from '../src/utils/text'
import { analyzeEssay } from '../src/pages/writing/task1/grader'
import {
  studyDay,
  useMistakes,
  useProgress,
} from '../src/composables/useStudyData'
import * as details from '../src/composables/useVocabularyDetails'
import * as dictionary from '../src/composables/useWordInfo'
import { cam20Test3ListeningTranscript } from '../src/pages/mock/cam20-test3-listening-transcript'
import { cam21Test3ListeningTranscript } from '../src/pages/mock/cam21-test3-listening-transcript'

const auth = useAuth()
const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  setToken('local-test', 'alice')
  accountNotice.value = ''
  accountNotices.value = []
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
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
        ReadingTabs: true,
        ListeningTabs: true,
        AIGradePanel: true,
        TaskChart: true,
        TheHeader: true,
        TheFooter: true,
        RouterView: true,
      },
    },
  })
  wrappers.push(w)
  await flushPromises()
  const s = (w.vm as any).$.setupState
  for (let i = 0; s.loading && i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
  return { s, w, router }
}
function raw(value: any, stamp = 10, deleted = false) {
  return JSON.stringify({
    __ielts: 2,
    stamp: [stamp, 'writer'],
    ...(deleted ? { deleted: true } : { value }),
  })
}
function seedExam(kind: string, session = 'other', attempt = 'shared') {
  const prefix = accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')
  const key = `${prefix}__session_${session}`
  localStorage.setItem(
    key,
    JSON.stringify({
      version: 1,
      kind,
      testId: 'cam21-test1',
      attemptId: attempt,
      answers: { Q1: 'original' },
      timeLeft: 400,
      updatedAt: Date.now(),
    }),
  )
  return { prefix, key }
}
it.each(['reading', 'listening'])(
  '%s retirement pauses visibly and preserves edits before continuing as a new attempt',
  async (kind) => {
    const { prefix, key } = seedExam(kind)
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const { s, w } = await page(Page)
    s.recovery.selectDraft(key)
    s.startTest()
    s.answers.Q1 = 'latest before retirement'
    const marker = `${prefix}__completed_shared`
    localStorage.setItem(marker, JSON.stringify({ completedAt: Date.now() }))
    window.dispatchEvent(new StorageEvent('storage', { key: marker }))
    await nextTick()
    expect(s.recovery.retired.value).toBe(true)
    expect(w.text()).toContain('本次作答已在另一页签')
    s.answers.Q1 = 'edited after retirement'
    expect(s.recovery.saveFlush()).toBe(false)
    const copies = Object.keys(localStorage)
      .filter(k => k.startsWith(prefix) && k.includes('__recovery_'))
      .map(k => JSON.parse(localStorage.getItem(k)!))
    expect(copies).toHaveLength(1)
    expect(copies[0].answers.Q1).toBe('edited after retirement')
    const button = w
      .findAll('button')
      .find(button => button.text() === '保留答案，继续为独立作答')!
    await button.trigger('click')
    expect(s.recovery.retired.value).toBe(false)
    expect(s.recovery.saveFlush()).toBe(true)
    const current = JSON.parse(
      localStorage.getItem(`${prefix}__session_${examSessionId()}`)!,
    )
    expect(current.attemptId).not.toBe('shared')
    expect(current.answers.Q1).toBe('edited after retirement')
  },
)
it('retired answers can be safely kept before leaving, without forcing a new attempt', async () => {
  const { prefix, key } = seedExam('reading')
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  localStorage.setItem(
    `${prefix}__completed_shared`,
    JSON.stringify({ completedAt: Date.now() }),
  )
  s.answers.Q1 = 'keep and leave'
  s.recovery.saveFlush()
  s.recovery.leaveRetired()
  expect(s.started).toBe(false)
  expect(s.recovery.saveFlush()).toBe(true)
  expect(
    s.recovery.availableDrafts.value.some(
      (d: any) => d.answers.Q1 === 'keep and leave',
    ),
  ).toBe(true)
})
it('same-attempt snapshots are deduplicated and selecting the source cannot restore older answers', async () => {
  const { key } = seedExam('reading')
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  s.answers.Q1 = 'new answer'
  s.recovery.saveFlush()
  s.recovery.refresh()
  expect(
    s.recovery.availableDrafts.value.filter(
      (d: any) => d.attemptId === 'shared',
    ),
  ).toHaveLength(1)
  s.recovery.selectDraft(key)
  expect(s.recovery.draft.value.answers.Q1).toBe('new answer')
})
it('legacy backup copies keep one stable attempt id across copy and retirement', async () => {
  const prefix = accountKey('mock_draft_v1_reading_cam21-test1', 'alice')
  const own = `${prefix}__session_${examSessionId()}`
  localStorage.setItem(
    own,
    JSON.stringify({
      version: 1,
      kind: 'reading',
      testId: 'cam21-test1',
      answers: { Q1: 'legacy own' },
      timeLeft: 100,
      updatedAt: 100,
    }),
  )
  const { key } = seedExam('reading', 'second', 'second')
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  s.recovery.saveFlush()
  s.recovery.refresh()
  const legacy = s.recovery.availableDrafts.value.filter(
    (d: any) => d.answers.Q1 === 'legacy own',
  )
  expect(legacy).toHaveLength(1)
  s.started = false
  s.recovery.selectDraft(legacy[0].versionId)
  expect(s.recovery.clear()).toBe(true)
  s.recovery.refresh()
  expect(
    s.recovery.availableDrafts.value.some(
      (d: any) => d.answers.Q1 === 'legacy own',
    ),
  ).toBe(false)
})
it('an expired foreign lease never silently offers or auto-restores its draft', async () => {
  const { key } = seedExam('reading')
  localStorage.setItem(
    'myielts_local_exam_session:other',
    String(Date.now() - 90000),
  )
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  expect(s.recovery.draft.value).toBeNull()
  expect(s.recovery.availableDrafts.value).toHaveLength(1)
  s.startTest()
  expect(s.answers.Q1).toBeUndefined()
  expect(JSON.parse(localStorage.getItem(key)!).answers.Q1).toBe('original')
})
it('opening the word page does not physically reseed an archived deletion', async () => {
  const chapter = '01_自然地理'
  const id = `${chapter}|1`
  const key = entryKey('vocabulary_spell_v2', id, 'alice')
  applySyncData(
    compactDeletionData({ [key]: raw(null, 20, true) }, 'alice'),
    'alice',
  )
  localStorage.setItem(
    accountKey('vocabulary_spell_v1', 'alice'),
    JSON.stringify({ [chapter]: { 1: 'old answer' } }),
  )
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const { s } = await page(Page)
  expect(localStorage.getItem(key)).toBeNull()
  expect(s.refVocabulary[chapter].words[0][0].spellValue).toBe('')
  expect(collectSyncData('alice')[key]).toBeUndefined()
})
it('actual answers override an existing stale progress row without an input event', () => {
  const chapter = '01_自然地理'
  saveRecord(
    'progress_v1',
    `spelling:${chapter}`,
    { done: 99, total: 241, updatedAt: 1 },
    'alice',
  )
  saveRecord('vocabulary_spell_v2', `${chapter}|1`, 'atmosphere', 'alice')
  expect(
    useProgress().modules.value.find(m => m.module === `spelling:${chapter}`)
      ?.done,
  ).toBe(1)
  saveRecord('vocabulary_spell_v2', `${chapter}|1`, undefined, 'alice')
  expect(
    useProgress().modules.value.find(m => m.module === `spelling:${chapter}`)
      ?.done,
  ).toBe(0)
})
it('blank alternatives are removed and no untimed legacy answer is silently selected as newest', () => {
  const merged = mergeLegacy(
    'vocabulary_spell_v2',
    { text: '', alternatives: ['', '  ', 'colour'] },
    'color',
  )
  expect(merged.alternatives).toEqual(['color', 'colour'])
  expect(merged.requiresSelection).toBe(true)
  expect(mergeLegacy('vocabulary_spell_v2', ' ', 'answer')).toBe('answer')
})
it('the disagreement selector shows only nonempty choices and persists an explicit user choice', async () => {
  const chapter = '01_自然地理'
  saveEnvelope(entryKey('vocabulary_spell_v2', `${chapter}|1`, 'alice'), {
    __ielts: 2,
    stamp: [0, 'legacy'],
    value: {
      text: 'Atmosphere',
      alternatives: ['', '  ', 'Atmosphere', 'atmosphere'],
      requiresSelection: true,
    },
  })
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const { s, w } = await page(Page)
  expect(s.refVocabulary[chapter].words[0][0].spellValue).toBe('')
  s.isTrainingModel = true
  await nextTick()
  expect(w.text()).toContain('旧答案缺少可比较的时间')
  const choice = w
    .findAll('button')
    .find(button => button.text() === 'atmosphere')!
  await choice.trigger('click')
  expect(readRecord('vocabulary_spell_v2', `${chapter}|1`, 'alice')).toBe(
    'atmosphere',
  )
  expect(s.refVocabulary[chapter].words[0][0].spellError).toBe(false)
})
it('multiword speaker names stay whole and no name words become ghost entries', () => {
  expect(
    transcriptSentenceEntries(
      'Shelley Meyer: Hello there.\nHouse Owner: Welcome home.',
    ),
  ).toEqual([
    {
      text: 'Hello there.',
      speaker: 'Shelley Meyer',
      display: 'Shelley Meyer: Hello there.',
    },
    {
      text: 'Welcome home.',
      speaker: 'House Owner',
      display: 'House Owner: Welcome home.',
    },
  ])
  const all = transcriptSentenceEntries(cam20Test3ListeningTranscript.part1)
  expect(
    all.every(e => ['Shelley Meyer', 'House Owner'].includes(e.speaker)),
  ).toBe(true)
  expect(all.some(e => ['Shelley', 'House'].includes(e.text))).toBe(false)
})
it('a general inline colon never consumes Australia or assigns it as a speaker', () => {
  const text = cam21Test3ListeningTranscript.part4
  const entries = transcriptSentenceEntries(text)
  expect(entries.some(e => e.speaker === 'Australia')).toBe(false)
  expect(
    entries
      .map(e => e.text)
      .join(' ')
      .match(/\bAustralia\b/g)?.length,
  ).toBe(text.match(/\bAustralia\b/g)?.length)
  expect(
    transcriptSentenceEntries(
      'Introduction: We travel to Australia: a country.',
    )[0].text,
  ).toBe('Introduction: We travel to Australia: a country.')
})
it.each([
  'Sales rose as a percentage and costs fell.',
  'Sales rose as a share and costs fell.',
  'AS A RESULT, sales rose.',
])('as phrases do not cross into unrelated predicates: %s', (sentence) => {
  expect(analyzeEssay(sentence).complexRatio).toBe(0)
})
it.each([
  'Sales rose as incomes grew.',
  'Sales rose as incomes and costs grew.',
  'Sales rose as the percentage increased.',
  'The chart shows that sales rose.',
])('real clauses remain countable: %s', (sentence) => {
  expect(analyzeEssay(sentence).complexRatio).toBe(1)
})
it('history watermarks retire plain-id deletion indexes using the same fallback identity', () => {
  const key = entryKey('task1_essays_v1', 'plain-id', 'alice')
  const compact = compactDeletionData({ [key]: raw(null, 10, true) }, 'alice')
  const marker = accountKey('collection_retention_v3', 'alice')
  const data = {
    ...compact,
    [marker]: raw({ task1_essays_v1: '0000000000000020:zzz' }, 30),
  }
  const pruned = compactDeletionData(data, 'alice')
  expect(
    Object.keys(pruned).some(key =>
      key.includes('deletion_archive_v3__entry_'),
    ),
  ).toBe(false)
})
it('a newer live record removes its superseded deletion barrier', () => {
  const key = entryKey('progress_v1', 'item', 'alice')
  const compact = compactDeletionData({ [key]: raw(null, 10, true) }, 'alice')
  const result = compactDeletionData(
    { ...compact, [key]: raw({ done: 1, total: 2 }, 20) },
    'alice',
  )
  expect(result[key]).toBeDefined()
  expect(result[deletedTarget(key, 'alice')!.key]).toBeUndefined()
})
it('the pending guest-migration banner can close without logging out or removing the pending marker', async () => {
  localStorage.setItem('myielts_local_guest_migration:alice', '1')
  const Page = (await import('../src/App.vue')).default
  const { s, w } = await page(Page)
  expect(w.text()).toContain('首次云端拉取尚未完成')
  const close = w
    .findAll('button')
    .find(button => button.text() === '暂时关闭')!
  await close.trigger('click')
  expect(w.text()).not.toContain('首次云端拉取尚未完成')
  expect(auth.currentUser.value).toBe('alice')
  expect(localStorage.getItem('myielts_local_guest_migration:alice')).toBe('1')
  expect(s.guestNoticeClosed).toBe(true)
})
it('legacy counts can be assigned to self-test without merging current spelling failures', () => {
  const mistakes = useMistakes()
  const day = studyDay()
  const base = {
    title: 'atmosphere',
    detail: 'n. air',
    count: 1,
    epoch: '',
    firstAt: 1,
    lastAt: 1,
    days: { [day]: 1 },
  }
  saveRecord(
    'mistake_parts_v2',
    'vocabulary:1|legacy',
    { ...base, key: 'vocabulary:1', module: 'vocabulary' },
    'alice',
  )
  mistakes.addMistake('flashcard', { key: 'flashcard:1', title: 'atmosphere' })
  mistakes.addMistake('vocabulary', { key: 'spelling:1', title: 'atmosphere' })
  expect(
    mistakes.mistakes.value.find(m => m.key === 'legacy-vocabulary:1')
      ?.detail,
  ).toContain('活动来源未区分')
  mistakes.assignLegacyActivity('legacy-vocabulary:1', 'flashcard')
  expect(
    mistakes.mistakes.value.find(m => m.key === 'flashcard:1')?.count,
  ).toBe(2)
  expect(
    mistakes.mistakes.value.find(m => m.key === 'spelling:1')?.count,
  ).toBe(1)
  expect(
    mistakes.mistakes.value.some(m => m.key === 'legacy-vocabulary:1'),
  ).toBe(false)
})
it('late detail loading replaces a pending failure hint once without increasing its count', async () => {
  let finish!: (value: any) => void
  vi.spyOn(details, 'loadVocabularyDetails').mockImplementation(
    () =>
      new Promise<any>((resolve) => {
        finish = resolve
      }),
  )
  vi.spyOn(dictionary, 'loadWordInfoWithFallback').mockResolvedValue(null)
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s } = await page(Page)
  const id = s.current.id
  s.grade(0)
  const before = useMistakes().mistakes.value.find(
    m => m.key === `flashcard:${id}`,
  )!
  expect(before.hint).toBeTruthy()
  finish({ [id]: { example: 'Independent late example.', extra: '' } })
  await flushPromises()
  const after = useMistakes().mistakes.value.find(
    m => m.key === `flashcard:${id}`,
  )!
  expect(after.count).toBe(before.count)
  expect(after.hint).toBe('Independent late example.')
})
it('a fresh capability probe blocks an old backend before any new-format PUT', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        protocolVersion: 2,
        compactStats: true,
        compactDeletes: true,
        data: null,
      }),
    })),
  )
  await apiPull('alice')
  const fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
  }))
  vi.stubGlobal('fetch', fetch)
  const key = entryKey('deletion_archive_v3', '00', 'alice')
  const result = await apiPush(
    { [key]: raw({ entries: { 'progress_v1|old': [10, 'writer'] } }) },
    'alice',
  )
  expect(result.status).toBe(426)
  expect(fetch.mock.calls.every((call: any) => call[1]?.method === 'GET')).toBe(
    true,
  )
})

it('a retired draft that cannot save stays paused and cannot claim a safe departure', async () => {
  const { prefix, key } = seedExam('reading')
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  s.answers.Q1 = 'latest unsaved answer'
  localStorage.setItem(`${prefix}__completed_shared`, '{}')
  const set = Storage.prototype.setItem
  const failing = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, k: string, value: string) {
      if (k.includes('__recovery_'))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, k, value)
    })
  expect(s.recovery.saveFlush()).toBe(false)
  expect(s.recovery.retired.value).toBe(true)
  const remaining = s.examClock.remaining()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
  expect(s.examClock.remaining()).toBe(remaining)
  clock.mockRestore()
  expect(s.recovery.error.value).toContain('保存失败')
  s.recovery.leaveRetired()
  expect(s.started).toBe(true)
  expect(s.answers.Q1).toBe('latest unsaved answer')
  failing.mockRestore()
  s.recovery.leaveRetired()
  expect(s.started).toBe(false)
  expect(
    s.recovery.availableDrafts.value.some(
      (d: any) => d.answers.Q1 === 'latest unsaved answer',
    ),
  ).toBe(true)
})
it('switching reading passages clears hints and the previous passage image', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.mapInputHint = 'old map'
  s.selectionHint = 'old selection'
  s.enlargedImage = 'old image'
  s.showPassageModal = true
  s.switchPassage(1)
  expect(s.activePassage).toBe(1)
  expect(s.mapInputHint).toBe('')
  expect(s.selectionHint).toBe('')
  expect(s.enlargedImage).toBeNull()
  expect(s.showPassageModal).toBe(false)
})

it('leaving a retired attempt after an account change keeps the copy with its original owner', async () => {
  const { prefix, key } = seedExam('reading')
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(key)
  s.startTest()
  s.answers.Q1 = 'alice private draft'
  localStorage.setItem(`${prefix}__completed_shared`, '{}')
  s.recovery.saveFlush()
  auth.currentUser.value = 'bob'
  s.recovery.leaveRetired()
  expect(s.started).toBe(false)
  expect(s.recovery.owner.value).toBe('bob')
  expect(s.recovery.availableDrafts.value).toEqual([])
  expect(s.recovery.draft.value).toBeNull()
  const copies = Object.keys(localStorage).filter(
    k => k.startsWith(prefix) && k.includes('__recovery_'),
  )
  expect(copies).toHaveLength(1)
  expect(JSON.parse(localStorage.getItem(copies[0])!).answers.Q1).toBe(
    'alice private draft',
  )
  s.startTest()
  expect(s.answers.Q1).toBeUndefined()
  expect(
    Object.keys(localStorage).some(
      k =>
        k.startsWith('myielts_u_bob_')
        && (localStorage.getItem(k) || '').includes('alice private draft'),
    ),
  ).toBe(false)
})

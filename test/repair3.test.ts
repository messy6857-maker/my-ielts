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
  applySyncData,
  collectSyncData,
  quarantineKeys,
  setToken,
  unquarantineKeys,
} from '../src/composables/syncClient'
import {
  accountKey,
  entryKey,
  readRecord,
  readRecords,
  saveEnvelope,
  saveRecord,
  storageFailures,
  writerId,
} from '../src/utils/storage'
import {
  compactDeletionData,
  expandDeletionData,
  pruneCollectionData,
} from '../src/utils/retention'
import { listDrafts, readDraft, saveDraft } from '../src/utils/drafts'
import { previewStudyBackup, restoreStudyBackup } from '../src/utils/backup'
import { mergeLegacy } from '../src/utils/legacyMerge'
import { transcriptSentenceEntries } from '../src/utils/text'
import { analyzeEssay } from '../src/pages/writing/task1/grader'
import {
  studyDay,
  useMistakes,
  useProgress,
} from '../src/composables/useStudyData'
import { useDailyStore } from '../src/composables/useDailyStore'
import { useWordSchedule } from '../src/composables/useSpacedRepetition'
import * as details from '../src/composables/useVocabularyDetails'
import * as wordInfo from '../src/composables/useWordInfo'
import vocabulary from '../src/pages/vocabulary/vocabulary'

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
        ModelEssayView: true,
        TaskChart: true,
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
function raw(value: any, stamp = 10, deleted = false) {
  return JSON.stringify({
    __ielts: 2,
    stamp: [stamp, 'writer'],
    ...(deleted ? { deleted: true } : { value }),
  })
}
it.each([
  'As a result, sales rose steadily.',
  'As a result, the number of visitors increased.',
  'Sales increased as a result of higher demand.',
])('fixed adverbial is not a subordinate clause: %s', (sentence) => {
  expect(analyzeEssay(sentence).complexRatio).toBe(0)
})
it('true as-clauses and object clauses still count', () => {
  expect(analyzeEssay('Sales rose as incomes grew.').complexRatio).toBe(1)
  expect(
    analyzeEssay('The chart shows that the number of visitors increased.')
      .complexRatio,
  ).toBe(1)
})
it('legacy spelling seeds preserve both conflicting answers on both replicas', () => {
  const a = mergeLegacy('vocabulary_spell_v2', 'colour', 'color')
  const b = mergeLegacy('vocabulary_spell_v2', 'color', 'colour')
  expect(a).toEqual(b)
  expect(a.alternatives).toEqual(['color', 'colour'])
  const key = entryKey('vocabulary_spell_v2', 'chapter|1', 'alice')
  saveEnvelope(key, { __ielts: 2, stamp: [0, 'legacy'], value: 'colour' })
  applySyncData(
    {
      [key]: JSON.stringify({
        __ielts: 2,
        stamp: [0, 'legacy'],
        value: 'color',
      }),
    },
    'alice',
  )
  expect(
    readRecord<any>('vocabulary_spell_v2', 'chapter|1', 'alice').alternatives,
  ).toEqual(['color', 'colour'])
})
it('the home progress derives old spelling answers before any new input', () => {
  const chapter = Object.keys(vocabulary)[0]
  localStorage.setItem(
    accountKey('vocabulary_spell_v1', 'alice'),
    JSON.stringify({ [chapter]: { 1: 'atmosphere' } }),
  )
  const progress = useProgress()
  expect(
    progress.modules.value.find(m => m.module === `spelling:${chapter}`)
      ?.done,
  ).toBe(1)
  expect(
    readRecords('progress_v1', 'alice')[`spelling:${chapter}`],
  ).toBeUndefined()
})
it('legacy vocabulary mistakes merge into a single explicitly marked spelling group', () => {
  const date = studyDay()
  const data = {
    module: 'vocabulary',
    title: 'word',
    detail: 'meaning',
    count: 1,
    epoch: '',
    firstAt: 1,
    lastAt: 2,
    days: { [date]: 1 },
  }
  saveRecord(
    'mistake_parts_v2',
    'vocabulary:1|old',
    { ...data, key: 'vocabulary:1' },
    'alice',
  )
  saveRecord(
    'mistake_parts_v2',
    'spelling:1|new',
    { ...data, key: 'spelling:1' },
    'alice',
  )
  const m = useMistakes().mistakes.value.filter(m => m.key === 'spelling:1')
  expect(m).toHaveLength(1)
  expect(m[0].count).toBe(2)
})
it('writing migration moves only the resumed bare snapshot after saving the new revision', () => {
  const key = accountKey('task1_draft_v1', 'alice')
  localStorage.setItem(
    key,
    JSON.stringify({
      promptId: 'same',
      text: 'original',
      secondsLeft: 100,
      updatedAt: 1,
    }),
  )
  readDraft('task1', 'alice', 'same')
  expect(
    saveDraft('task1', 'alice', {
      promptId: 'same',
      text: 'changed',
      secondsLeft: 90,
    }),
  ).toBe(true)
  expect(localStorage.getItem(key)).toBeNull()
  expect(listDrafts('task1', 'alice')).toHaveLength(1)
})
it('backup completion barriers preserve their exact key instead of becoming dead suffixed keys', () => {
  const key = `${accountKey(
    'mock_draft_v1_reading_cam21-test1',
    'alice',
  )}__completed_attempt`
  const backup = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: { [key]: JSON.stringify({ completedAt: 100 }) },
    }),
  )
  expect(restoreStudyBackup(backup, 'alice').imported).toBe(1)
  expect(localStorage.getItem(key)).toBe(JSON.stringify({ completedAt: 100 }))
  expect(
    Object.keys(localStorage).some(k => k.startsWith(`${key}__session`)),
  ).toBe(false)
})
it('compacts hundreds of newer deletion envelopes without deleting the sole old live essay', () => {
  const old = entryKey('task1_essays_v1', '1700000000000', 'alice')
  const input: Record<string, string> = { [old]: raw({ text: 'keep' }, 1) }
  for (let i = 1; i <= 300; i++) {
    input[entryKey('task1_essays_v1', String(1700000000000 + i), 'alice')]
      = raw(null, i, true)
  }
  const compact = compactDeletionData(
    pruneCollectionData(input, 'alice'),
    'alice',
  )
  expect(compact[old]).toBeDefined()
  expect(
    Object.keys(compact).filter(k => k.includes('task1_essays_v1__entry_')),
  ).toHaveLength(1)
  const expanded = expandDeletionData(compact, 'alice')
  expect(
    Object.values(expanded).filter(v => JSON.parse(String(v)).deleted),
  ).toHaveLength(300)
  const stale = entryKey('task1_essays_v1', '1700000000001', 'alice')
  expect(
    compactDeletionData(
      { ...compact, [stale]: raw({ text: 'stale' }, 0) },
      'alice',
    )[stale],
  ).toBeUndefined()
})
it('unknown history ids no longer bypass the live count limit', () => {
  const input = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [
      entryKey('task2_essays_v1', `old-id-${i}`, 'alice'),
      raw({ text: 'essay' }, i + 1),
    ]),
  )
  const pruned = pruneCollectionData(input, 'alice')
  expect(
    Object.keys(pruned).filter(k => k.includes('task2_essays_v1__entry_')),
  ).toHaveLength(50)
})
it('the deletion index prevents both direct reads and legacy seeds from reviving an entry', () => {
  const key = entryKey('progress_v1', 'old', 'alice')
  const compact = compactDeletionData({ [key]: raw(null, 20, true) }, 'alice')
  applySyncData(compact, 'alice')
  localStorage.setItem(
    accountKey('progress_v1', 'alice'),
    JSON.stringify({ old: { done: 5, total: 10 } }),
  )
  localStorage.removeItem(
    `myielts_local_migrated:${accountKey('progress_v1', 'alice')}`,
  )
  expect(readRecord('progress_v1', 'old', 'alice')).toBeUndefined()
  expect(readRecords('progress_v1', 'alice').old).toBeUndefined()
  saveRecord('progress_v1', 'old', { done: 1, total: 2 }, 'alice')
  expect(readRecord<any>('progress_v1', 'old', 'alice').done).toBe(1)
})
it('a failed compaction replacement never removes the original local records', async () => {
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
  const key = entryKey('progress_v1', 'old', 'alice')
  localStorage.setItem(key, raw(null, 20, true))
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key.includes('deletion_archive_v3__entry_'))
      throw new DOMException('quota', 'QuotaExceededError')
    original.call(this, key, value)
  })
  const data = collectSyncData('alice')
  expect(localStorage.getItem(key)).not.toBeNull()
  expect(data[key]).toBeDefined()
})
it('dated deletion guards expire after their deterministic date window', () => {
  const old = '2020-1-1'
  const key = entryKey('daily_parts_v2', `vocabulary|${old}|writer`, 'alice')
  const compact = compactDeletionData(
    { [key]: raw(null, 10, true) },
    'alice',
    true,
    new Date('2020-01-01T12:00:00+08:00').getTime(),
  )
  expect(Object.keys(compact)).toHaveLength(1)
  const later = compactDeletionData(
    compact,
    'alice',
    true,
    new Date('2020-02-01T12:00:00+08:00').getTime(),
  )
  expect(Object.keys(later)).toHaveLength(0)
})
it('speaker turns split inline changes and propagate badges to later sentences', () => {
  const entries = transcriptSentenceEntries(
    'Student 1: First sentence. Second sentence. Student 2: We meet at 2:30.\nNarrator/Instructor: Listen carefully. Next sentence.',
  )
  expect(entries.map(e => e.speaker)).toEqual([
    'Student 1',
    'Student 1',
    'Student 2',
    'Narrator/Instructor',
    'Narrator/Instructor',
  ])
  expect(entries[2].text).toBe('We meet at 2:30.')
  expect(transcriptSentenceEntries('Note: We meet at 2:30.')[0].text).toContain(
    'Note:',
  )
})
it('all stored transcripts are free of residual numbered speaker labels in TTS text', () => {
  const modules = import.meta.glob(
    '../src/pages/mock/*listening-transcript.ts',
    { eager: true },
  )
  let numbered = 0
  for (const module of Object.values(modules) as any[]) {
    for (const record of Object.values(module) as any[]) {
      for (const text of Object.values(record) as string[]) {
        if (typeof text !== 'string')
          continue
        numbered += (text.match(/Student [12]:|Narrator\/Instructor:/g) || [])
          .length
        for (const entry of transcriptSentenceEntries(text)) {
          expect(entry.text).not.toMatch(
            /\b(?:Student\s+\d+|Speaker\s+\d+(?:\s*\([^)]*\))?|Narrator\/Instructor):/,
          )
        }
      }
    }
  }
  expect(numbered).toBeGreaterThan(23)
})
it('oversized backup selection clears an earlier valid preview', async () => {
  const Page = (await import('../src/pages/settings.vue')).default
  const { s } = await page(Page)
  s.importText = JSON.stringify({
    format: 'my-ielts-backup',
    version: 2,
    username: 'alice',
    data: {},
  })
  expect(s.importPreview).not.toBeNull()
  await s.chooseBackup({ target: { files: [{ size: 31 * 1024 * 1024 }] } })
  expect(s.importPreview).toBeNull()
  expect(s.importMessage).toContain('30MB')
})
it('settings update quarantine rows even when the number of rejected keys stays equal', async () => {
  const Page = (await import('../src/pages/settings.vue')).default
  const { s } = await page(Page)
  quarantineKeys('alice', ['first'])
  await nextTick()
  expect(s.quarantined).toEqual(['first'])
  unquarantineKeys('alice', ['first'])
  quarantineKeys('alice', ['second'])
  await nextTick()
  expect(s.quarantined).toEqual(['second'])
})
it('reading paper changes clear hints and image state', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s, router } = await page(Page)
  s.mapInputHint = 'old'
  s.selectionHint = 'old'
  s.enlargedImage = 'old'
  await router.replace({ query: { test: 'cam20-test4' } })
  await flushPromises()
  expect(s.mapInputHint).toBe('')
  expect(s.selectionHint).toBe('')
  expect(s.enlargedImage).toBeNull()
})
it('roman label validation replaces and clears earlier alphabet hints', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  const q = {
    id: 'Q1',
    type: 'map-label',
    answer: 'iv',
    question: 'Choose the correct heading',
    options: ['one', 'two'],
  }
  s.mapInputHint = 'old'
  s.setMapLabel(q, { target: { value: 'ABC' } })
  expect(s.mapInputHint).toContain('罗马数字')
  s.setMapLabel(q, { target: { value: 'iv' } })
  expect(s.mapInputHint).toBe('')
  expect(s.answers.Q1).toBe('iv')
})
it('an active sibling attempt requires explicit selection and a fresh start does not clear it', async () => {
  const key = `${accountKey(
    'mock_draft_v1_reading_cam21-test1',
    'alice',
  )}__session_other`
  const draft = {
    version: 1,
    kind: 'reading',
    testId: 'cam21-test1',
    attemptId: 'other-attempt',
    answers: { Q1: 'other' },
    timeLeft: 100,
    updatedAt: Date.now(),
  }
  localStorage.setItem(key, JSON.stringify(draft))
  localStorage.setItem('myielts_local_exam_session:other', String(Date.now()))
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  expect(s.recovery.draft.value).toBeNull()
  expect(s.recovery.availableDrafts.value).toHaveLength(1)
  s.startTest()
  expect(s.answers.Q1).toBeUndefined()
  expect(localStorage.getItem(key)).toBe(JSON.stringify(draft))
})
it('chapter detail failures offer a visible retry without blocking a valid card', async () => {
  vi.spyOn(details, 'loadVocabularyDetails')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      1: { example: 'Recovered example.', extra: 'note' },
    })
  vi.spyOn(wordInfo, 'loadWordInfoWithFallback').mockResolvedValue(null)
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s, w } = await page(Page)
  expect(s.cardDetailsError).toBe(true)
  expect(w.text()).toContain('重试加载')
  await s.retryWordInfo()
  await flushPromises()
  expect(s.cardDetailsError).toBe(false)
  expect(s.current.example).toBe('Recovered example.')
})
it('typing defaults to case-insensitive and stores explicit preference under the account', async () => {
  const Page = (await import('../src/pages/vocabulary/typing.vue')).default
  const { s } = await page(Page)
  expect(s.ignoreCase).toBe(true)
  s.ignoreCase = false
  await nextTick()
  expect(
    JSON.parse(
      localStorage.getItem(accountKey('typing_ignore_case_v2', 'alice'))!,
    ).value,
  ).toBe(false)
  auth.currentUser.value = 'bob'
  await nextTick()
  expect(s.ignoreCase).toBe(true)
  auth.currentUser.value = 'alice'
  await nextTick()
  expect(s.ignoreCase).toBe(false)
})
it('daily word totals already aggregate other devices; local undo leaves another device learning intact', () => {
  const daily = useDailyStore('vocabulary')
  const date = studyDay()
  const data = {
    ns: 'vocabulary',
    date,
    word: 'same',
    count: 1,
    actor: 'remote',
    epoch: '',
  }
  daily.recordNewWord('same')
  saveRecord('daily_parts_v2', `vocabulary|${date}|same|remote`, data, 'alice')
  expect(daily.dailyCount.value).toBe(1)
  daily.decrementNewWord('same', date)
  expect(daily.dailyCount.value).toBe(1)
})
it('all-chapter grading moves every duplicate word schedule and undo restores the aliases', async () => {
  const byWord = new Map<string, any[]>()
  for (const c of Object.values(vocabulary) as any[]) {
    for (const w of c.words.flat()) {
      const key = w.word[0].toLowerCase().trim()
      byWord.set(key, [...(byWord.get(key) || []), w])
    }
  }
  const duplicate = [...byWord.values()].find(words => words.length > 1)!
  const schedule = useWordSchedule()
  const due = { ease: 2.5, interval: 1, dueAt: 1, reps: 1, lapses: 0 }
  for (const word of duplicate) schedule.set(word.id, due)
  vi.spyOn(details, 'loadVocabularyDetails').mockResolvedValue({})
  vi.spyOn(wordInfo, 'loadWordInfoWithFallback').mockResolvedValue(null)
  const Page = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s } = await page(Page)
  s.crossChapter = true
  await nextTick()
  expect(s.current.word.toLowerCase()).toBe(duplicate[0].word[0].toLowerCase())
  s.grade(5)
  for (const word of duplicate)
    expect(schedule.get(word.id)?.dueAt).toBeGreaterThan(Date.now())
  s.restart()
  expect(
    s.queue.some(
      (card: any) =>
        card.word.toLowerCase() === duplicate[0].word[0].toLowerCase(),
    ),
  ).toBe(false)
})

it('compacted cloud deletions still block guest migration and backup resurrection', async () => {
  const key = entryKey('progress_v1', 'old', 'alice')
  const compact = compactDeletionData({ [key]: raw(null, 20, true) }, 'alice')
  applySyncData(compact, 'alice')
  saveRecord('progress_v1', 'old', { done: 5, total: 10 }, null)
  const { migrateGuestData } = await import('../src/composables/useAuth')
  migrateGuestData('alice')
  expect(readRecord('progress_v1', 'old', 'alice')).toBeUndefined()
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: 'alice',
      data: { [key]: raw({ done: 5, total: 10 }, 5) },
    }),
  )
  expect(restoreStudyBackup(preview, 'alice').keptNewer).toBe(1)
  expect(readRecord('progress_v1', 'old', 'alice')).toBeUndefined()
})
it('spelling migration does not recreate retired answer records or derived progress', async () => {
  const chapter = Object.keys(vocabulary)[0]
  const key = entryKey('vocabulary_spell_v2', `${chapter}|1`, 'alice')
  applySyncData(
    compactDeletionData({ [key]: raw(null, 20, true) }, 'alice'),
    'alice',
  )
  localStorage.setItem(
    accountKey('vocabulary_spell_v1', 'alice'),
    JSON.stringify({ [chapter]: { 1: 'old answer' } }),
  )
  const { migrateStudy } = await import('../src/utils/migrateStudy')
  migrateStudy('alice')
  expect(localStorage.getItem(key)).toBeNull()
  expect(
    useProgress().modules.value.find(m => m.module === `spelling:${chapter}`),
  ).toBeUndefined()
})
it('image enlargement has a visible load-error retry that creates a new image', async () => {
  const Page = (await import('../src/components/ImageViewer.vue')).default
  const w = mount(Page, {
    props: { src: 'missing.png' },
    global: { stubs: { teleport: true } },
  })
  wrappers.push(w)
  await w.find('img').trigger('error')
  expect(w.text()).toContain('图片加载失败')
  const button = w.findAll('button').find(b => b.text() === '重试加载')!
  await button.trigger('click')
  expect(w.find('img').exists()).toBe(true)
})

it('a successful push updates compression capabilities and leaves old-backend preferences local until then', async () => {
  const { apiPush } = await import('../src/composables/syncClient')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        protocolVersion: 2,
        ...(options.method === 'PUT'
          ? { compactStats: true, compactDeletes: true }
          : {}),
        data: {},
      }),
    })),
  )
  await apiPull('alice')
  saveRecord('progress_v1', 'old', undefined, 'alice')
  const { saveValue } = await import('../src/utils/storage')
  saveValue(accountKey('typing_ignore_case_v2', 'alice'), false)
  expect(
    collectSyncData('alice')[accountKey('typing_ignore_case_v2', 'alice')],
  ).toBeUndefined()
  await apiPush(collectSyncData('alice'), 'alice')
  const now = collectSyncData('alice')
  expect(now[accountKey('typing_ignore_case_v2', 'alice')]).toBeDefined()
  expect(
    Object.keys(now).some(k => k.includes('_deletion_archive_v3__entry_')),
  ).toBe(true)
})
it('compaction also removes non-canonical JSON originals after the replacement is durable', async () => {
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
  const key = entryKey('progress_v1', 'old', 'alice')
  localStorage.setItem(
    key,
    JSON.stringify(
      { __ielts: 2, stamp: [20, 'writer'], deleted: true },
      null,
      2,
    ),
  )
  const data = collectSyncData('alice')
  expect(localStorage.getItem(key)).toBeNull()
  expect(data[key]).toBeUndefined()
  expect(
    Object.keys(data).some(k => k.includes('_deletion_archive_v3__entry_')),
  ).toBe(true)
})

it('discarding another selected attempt never deletes this tab unrelated draft', async () => {
  const prefix = accountKey('mock_draft_v1_reading_cam21-test1', 'alice')
  const own = `${prefix}__session_${writerId()}`
  const other = `${prefix}__session_other`
  const draft = (attemptId: string, answer: string) => ({
    version: 1,
    kind: 'reading',
    testId: 'cam21-test1',
    attemptId,
    answers: { Q1: answer },
    timeLeft: 100,
    updatedAt: Date.now(),
  })
  localStorage.setItem(own, JSON.stringify(draft('own-attempt', 'keep own')))
  localStorage.setItem(
    other,
    JSON.stringify(draft('other-attempt', 'discard other')),
  )
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.recovery.selectDraft(other)
  expect(s.recovery.clear()).toBe(true)
  s.startTest()
  const snapshots = Object.keys(localStorage)
    .filter(k => k.startsWith(`${prefix}__session_`))
    .map(k => JSON.parse(localStorage.getItem(k)!))
  expect(snapshots.some(d => d.answers.Q1 === 'keep own')).toBe(true)
  expect(snapshots.some(d => d.answers.Q1 === 'discard other')).toBe(false)
})
it('durable history retires a completed attempt even if the small completion marker cannot be stored', async () => {
  const prefix = accountKey('mock_draft_v1_reading_cam21-test1', 'alice')
  localStorage.setItem(
    `${prefix}__session_former`,
    JSON.stringify({
      version: 1,
      kind: 'reading',
      testId: 'cam21-test1',
      attemptId: 'durable-attempt',
      answers: { Q1: 'old' },
      timeLeft: 100,
      updatedAt: Date.now(),
    }),
  )
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s } = await page(Page)
  s.startTest()
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key.includes('__completed_'))
      throw new DOMException('quota', 'QuotaExceededError')
    original.call(this, key, value)
  })
  await s.submit()
  s.recovery.refresh()
  expect(s.recovery.draft.value).toBeNull()
  expect(
    Object.values(readRecords<any>('mock_history_v1', 'alice'))[0].attemptId,
  ).toBe('durable-attempt')
})

import { beforeEach, expect, it, vi } from 'vitest'
import { useProgress } from '../src/composables/useStudyData'
import { useAuth } from '../src/composables/useAuth'
import { pruneCollectionData } from '../src/utils/retention'
import {
  apiPull,
  apiPush,
  applySyncData,
  collectSyncData,
  getQuarantineEntries,
  getQuarantinedKeys,
  handleRejectedKeys,
  setToken,
} from '../src/composables/syncClient'
import {
  accountKey,
  entryKey,
  envelope,
  readRecords,
  saveRecord,
} from '../src/utils/storage'
import { analyzeEssay } from '../src/pages/writing/task1/grader'
import { loadMockTest } from '../src/pages/mock/registry'
import { previewStudyBackup, restoreStudyBackup } from '../src/utils/backup'
import { listDrafts, readDraft, saveDraft } from '../src/utils/drafts'
import { loadVocabularyDetails } from '../src/composables/useVocabularyDetails'
import { loadWordInfoWithFallback } from '../src/composables/useWordInfo'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('expired dated tombstones and reset keys are dropped and cannot return from stale cloud', () => {
  const id = 'vocabulary|2020-1-1|word|old'
  saveRecord('daily_parts_v2', id, undefined, 'alice')
  saveRecord(
    'daily_resets_v2',
    'vocabulary|2020-1-1',
    { epoch: 'old' },
    'alice',
  )
  const key = entryKey('daily_parts_v2', id, 'alice')
  const stale = localStorage.getItem(key)!
  expect(collectSyncData('alice')[key]).toBeUndefined()
  expect(localStorage.getItem(key)).toBeNull()
  applySyncData({ [key]: stale }, 'alice')
  expect(localStorage.getItem(key)).toBeNull()
  expect(
    Object.keys(collectSyncData('alice')).some(k =>
      k.includes('daily_resets_v2'),
    ),
  ).toBe(false)
})
it('collection watermark prunes old live and deleted records and prevents resurrection', () => {
  const data: Record<string, string> = {}
  for (let i = 0; i < 60; i++) {
    data[entryKey('task1_essays_v1', String(1700000000000 + i), 'alice')]
      = JSON.stringify({
        __ielts: 2,
        stamp: [i, 'writer'],
        value: { id: 1700000000000 + i },
      })
  }
  const pruned = pruneCollectionData(data, 'alice') as Record<string, string>
  expect(
    Object.keys(pruned).filter(k => k.includes('__entry_')),
  ).toHaveLength(50)
  const again = pruneCollectionData({ ...data, ...pruned }, 'alice')
  expect(again).toEqual(pruned)
})
it('local unsent records absent from a pull are preserved', () => {
  saveRecord('progress_v1', 'reading', { done: 7 }, 'alice')
  applySyncData({}, 'alice')
  expect(readRecords<any>('progress_v1', 'alice').reading.done).toBe(7)
})
it('old rejection snapshot never quarantines a corrected local value', () => {
  saveRecord('progress_v1', 'reading', { done: 1 }, 'alice')
  const key = entryKey('progress_v1', 'reading', 'alice')
  const sent = { [key]: localStorage.getItem(key)! }
  saveRecord('progress_v1', 'reading', { done: 2 }, 'alice')
  handleRejectedKeys('alice', { ok: true, rejected: [key] }, sent)
  expect(getQuarantinedKeys('alice')).not.toContain(key)
})
it('persisted clock floor is re-read before a new local version', () => {
  saveRecord('progress_v1', 'first', { done: 1 }, 'alice')
  const future
    = Number(localStorage.getItem('myielts_clock_floor_v1')) + 86400000
  localStorage.setItem('myielts_clock_floor_v1', String(future))
  saveRecord('progress_v1', 'second', { done: 2 }, 'alice')
  expect(
    envelope(localStorage.getItem(entryKey('progress_v1', 'second', 'alice'))!)
      .stamp[0],
  ).toBeGreaterThan(future)
})
it.each([
  'Sales rose when the economy grew.',
  'Sales rose when most overseas visitors from Europe came.',
  'The chart shows that prices rose.',
  'The report argues that prices rose.',
])('counts actual subordinate structure: %s', (text) => {
  expect(analyzeEssay(text).complexRatio).toBe(1)
})
it('does not mistake a nominal as-a-result phrase for a clause', () => {
  expect(
    analyzeEssay('Sales increased as a result of the policy.').complexRatio,
  ).toBe(0)
})
it('all 28 reported reading questions have letter-mapped options', async () => {
  let count = 0
  for (const [id, lo, hi] of [
    ['cam21-test3', 31, 34],
    ['cam21-test2', 30, 35],
    ['cam18-test2', 24, 26],
    ['cam20-test2', 33, 37],
    ['cam20-test3', 27, 36],
  ] as const) {
    const test = await loadMockTest(id)
    for (const q of test.reading.passages.flatMap(p => p.questions)) {
      const n = Number(q.id.slice(1))
      if (!Number.isFinite(n) || n < lo || n > hi)
        continue
      expect(q.options?.length).toBeGreaterThan(0)
      expect(q.options?.[String(q.answer).charCodeAt(0) - 65]).toBeTruthy()
      count++
    }
  }
  expect(count).toBe(28)
})
it('backup import previews owner and preserves newer data and tombstones', () => {
  const key = entryKey('progress_v1', 'reading', 'bob')
  const raw = JSON.stringify({
    format: 'my-ielts-backup',
    version: 2,
    username: 'bob',
    data: {
      [key]: JSON.stringify({
        __ielts: 2,
        stamp: [1, 'old'],
        value: { done: 1 },
      }),
      myielts_ai_settings_v1: '{"apiKey":"never-import"}',
    },
  })
  const preview = previewStudyBackup(raw)
  expect(preview.skipped).toBe(1)
  saveRecord('progress_v1', 'reading', undefined, 'alice')
  expect(restoreStudyBackup(preview, 'alice').keptNewer).toBe(1)
  expect(readRecords('progress_v1', 'alice').reading).toBeUndefined()
  expect(localStorage.getItem('myielts_ai_settings_v1')).toBeNull()
})
it('writing stale passive save cannot replace a sibling writer version', () => {
  saveDraft('task1', 'alice', {
    promptId: 'one',
    text: 'old',
    secondsLeft: 500,
  })
  readDraft('task1', 'alice', 'one')
  const prefix = accountKey('task1_draft_v1', 'alice')
  localStorage.setItem(
    `${prefix}__prompt_one__session_other`,
    JSON.stringify({
      promptId: 'one',
      text: 'new important text',
      secondsLeft: 400,
      updatedAt: Date.now() + 100,
      editedAt: Date.now() + 100,
    }),
  )
  saveDraft('task1', 'alice', {
    promptId: 'one',
    text: 'old',
    secondsLeft: 499,
  })
  expect(readDraft('task1', 'alice', 'one')?.text).toBe('new important text')
  expect(listDrafts('task1', 'alice')).toHaveLength(2)
})
it('chapter notes and word examples load on demand with original content', async () => {
  expect((await loadVocabularyDetails('01_自然地理'))['1'].example).toContain(
    'atmosphere',
  )
  expect(
    (await loadWordInfoWithFallback(['atmosphere']))?.examples.length,
  ).toBeGreaterThan(0)
})
it('large sync uploads are bounded into multiple requests', async () => {
  setToken('test-token', 'alice')
  const requests: any[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      if (init.method === 'PUT')
        requests.push(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
      }
    }),
  )
  await apiPull('alice')
  const data = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      entryKey('progress_v1', String(i), 'alice'),
      JSON.stringify({
        __ielts: 2,
        stamp: [1, 'test'],
        value: 'x'.repeat(40000),
      }),
    ]),
  )
  expect((await apiPush(data, 'alice')).ok).toBe(true)
  expect(requests.length).toBeGreaterThan(1)
  expect(
    requests.every(body => new TextEncoder().encode(body).length < 300000),
  ).toBe(true)
  vi.unstubAllGlobals()
})

it('twenty thousand obsolete records shrink before upload, even above the old request ceiling', () => {
  const entries: Record<string, string> = {}
  for (let i = 0; i < 20000; i++) entries[entryKey('daily_parts_v2', `vocabulary|2020-1-1|word-${i}|retired-writer-0000000000000000`, 'alice')] = JSON.stringify({ __ielts: 2, stamp: [1, 'retired-writer'], deleted: true })
  expect(new TextEncoder().encode(JSON.stringify(entries)).length).toBeGreaterThan(5 * 1024 * 1024)
  expect(Object.keys(pruneCollectionData(entries, 'alice'))).toHaveLength(0)
})
it('deletion-only history is bounded and stale replicas cannot restore collected tombstones', () => {
  const entries: Record<string, string> = {}
  for (let i = 0; i < 200; i++) entries[entryKey('task1_essays_v1', String(1700000000000 + i), 'alice')] = JSON.stringify({ __ielts: 2, stamp: [i, 'writer'], deleted: true })
  const pruned = pruneCollectionData(entries, 'alice')
  expect(Object.keys(pruned).filter(key => key.includes('__entry_'))).toHaveLength(100)
  expect(pruneCollectionData({ ...entries, ...pruned }, 'alice')).toEqual(pruned)
})

it.each([
  ['old-key'],
  [{ k: 'old-key', s: '[1,"actor"]', t: 12 }],
  [{ key: 'old-key', stamp: '[1,"actor"]', at: 12 }],
])('quarantine restores supported legacy and current shapes: %j', (shape) => {
  localStorage.setItem('myielts_sync_quarantined:alice', JSON.stringify([shape]))
  expect(getQuarantineEntries('alice')[0]?.key).toBe('old-key')
})

it('chapter progress hides only its own legacy aggregate fallback', () => {
  useAuth().currentUser.value = 'progress-fixture'
  const progress = useProgress()
  progress.setProgress('flashcard', 2, 10)
  progress.setProgress('vocabulary', 3, 10)
  progress.setProgress('spelling:chapter-one', 4, 10)
  expect(progress.modules.value.some(row => row.module === 'flashcard')).toBe(true)
  expect(progress.modules.value.some(row => row.module === 'vocabulary')).toBe(false)
  expect(progress.modules.value.some(row => row.module === 'spelling:chapter-one')).toBe(true)
  progress.setProgress('flashcard:chapter-one', 5, 10)
  expect(progress.modules.value.some(row => row.module === 'flashcard')).toBe(false)
})

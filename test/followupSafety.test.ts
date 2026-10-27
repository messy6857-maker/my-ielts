import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { pruneArchives } from '../src/utils/archives'
import { getAttempts, recordAttempt } from '../src/composables/useStats'
import {
  accountNotice,
  finishGuestMigration,
  hasPendingGuestMigration,
  onBeforeLogout,
  useAuth,
} from '../src/composables/useAuth'
import { useSync } from '../src/composables/useSync'
import { useProgress } from '../src/composables/useStudyData'
import { useRecordMap } from '../src/composables/useRecordData'
import { applySyncData, setToken } from '../src/composables/syncClient'
import {
  accountKey,
  entryKey,
  envelope,
  notifyStorage,
  readRecords,
  saveRecord,
  saveValue,
  storageFailures,
  writerId,
} from '../src/utils/storage'
import { compactStatsParts, migrateStudy } from '../src/utils/migrateStudy'
import { studyBackup } from '../src/utils/backup'
import { legacyTimerSeconds } from '../src/composables/useStudyTimer'

const auth = useAuth()
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  accountNotice.value = ''
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  notifyStorage('', 'remote')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('finishes an offline-login guest migration only after the first successful pull', async () => {
  auth.currentUser.value = null
  saveRecord('progress_v1', 'writing', { done: 4, total: 10 }, null)
  saveRecord('progress_v1', 'reading', { done: 2, total: 10 }, null)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, username: 'alice', token: 'token' }),
        }
      }
      throw new Error('offline')
    }),
  )
  expect((await auth.login('alice', 'password', true)).ok).toBe(true)
  expect(hasPendingGuestMigration('alice')).toBe(true)
  const cloud = entryKey('progress_v1', 'reading', 'alice')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        protocolVersion: 2,
        data: {
          [cloud]: JSON.stringify({
            __ielts: 2,
            stamp: [Date.now() + 1000, 'cloud'],
            value: { done: 9, total: 10 },
          }),
        },
      }),
    }),
  )
  expect(await useSync().pullNow()).toBe(true)
  expect(hasPendingGuestMigration('alice')).toBe(false)
  const rows = readRecords<any>('progress_v1', 'alice')
  expect(rows.reading.done).toBe(9)
  expect(rows.writing.done).toBe(4)
  finishGuestMigration('alice')
  expect(readRecords<any>('progress_v1', null).writing.done).toBe(4)
})
it('stores chapter results independently and labels them in statistics', () => {
  const progress = useProgress()
  progress.setProgress('flashcard:A', 3, 10)
  progress.setProgress('flashcard:B', 8, 20)
  expect(readRecords<any>('progress_v1', 'alice')['flashcard:A'].done).toBe(3)
  expect(
    progress.modules.value.some(m => m.label.includes('A') && m.done === 3),
  ).toBe(true)
  expect(
    progress.modules.value.some(m => m.label.includes('B') && m.done === 8),
  ).toBe(true)
})
it('retention writes deletion envelopes and rejects stale cloud and legacy daily records', () => {
  const key = entryKey('daily_parts_v2', 'vocabulary|2026-1-1|legacy', 'alice')
  saveRecord(
    'daily_parts_v2',
    'vocabulary|2026-1-1|legacy',
    { ns: 'vocabulary', date: '2026-1-1', count: 8, word: null, epoch: '' },
    'alice',
  )
  const old = localStorage.getItem(key)!
  localStorage.setItem(
    accountKey('flashcard_daily_new_v1', 'alice'),
    JSON.stringify({ date: '2026-1-1', count: 8 }),
  )
  migrateStudy('alice')
  expect(envelope(localStorage.getItem(key)!).deleted).toBe(true)
  applySyncData({ [key]: old }, 'alice')
  migrateStudy('alice')
  expect(readRecords('daily_parts_v2', 'alice')).toEqual({})
})
it('old check-in indices stay deleted even if the original date array returns', () => {
  const base = accountKey('flashcard_checkin_v1', 'alice')
  localStorage.setItem(base, '["2026-1-1"]')
  migrateStudy('alice')
  expect(
    envelope(
      localStorage.getItem(
        entryKey('flashcard_checkin_v1', '2026-1-1', 'alice'),
      )!,
    ).deleted,
  ).toBe(true)
  applySyncData({ [base]: '["2026-1-1"]' }, 'alice')
  expect(readRecords('flashcard_checkin_v1', 'alice')).toEqual({})
  expect(
    Object.values(readRecords<number[]>('checkin_years_v2', 'alice')).flat(),
  ).toHaveLength(1)
})
it('does not delete a check-in index when its historical archive cannot be saved', () => {
  localStorage.setItem(
    accountKey('flashcard_checkin_v1', 'alice'),
    '["2026-1-1"]',
  )
  const set = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key.includes('checkin_years_v2__entry_'))
      throw new DOMException('quota', 'QuotaExceededError')
    return set.call(this, key, value)
  })
  migrateStudy('alice')
  expect(
    readRecords<boolean>('flashcard_checkin_v1', 'alice')['2026-1-1'],
  ).toBe(true)
})
it('persists pruning of inactive statistics parts without changing all-time totals', () => {
  const key = entryKey('stats_parts_v2', 'retired-writer', 'alice')
  saveRecord(
    'stats_parts_v2',
    'retired-writer',
    {
      totals: { vocabulary: { known: 7, vague: 0, unknown: 1 } },
      days: { '2026-1-1': { vocabulary: { known: 7, vague: 0, unknown: 1 } } },
    },
    'alice',
  )
  const version = envelope(localStorage.getItem(key)!).stamp
  compactStatsParts('alice')
  const after = envelope(localStorage.getItem(key)!)
  expect((after.value as any).days).toEqual({})
  expect((after.value as any).totals.vocabulary.known).toBe(7)
  expect(after.stamp).toEqual(version)
})
it('reuses the writer on reload but allocates a separate part for a copied new tab', async () => {
  const id = writerId()
  sessionStorage.setItem('myielts_writer_id_v2', id)
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type: 'reload' },
  ] as any)
  vi.resetModules()
  expect((await import('../src/utils/storage')).writerId()).toBe(id)
  vi.mocked(performance.getEntriesByType).mockReturnValue([
    { type: 'navigate' },
  ] as any)
  vi.resetModules()
  expect((await import('../src/utils/storage')).writerId()).not.toBe(id)
})
it('logged-in backups include guest originals and drafts without including credentials or another account', () => {
  const guest = entryKey('progress_v1', 'reading', null)
  localStorage.setItem(guest, '{"done":3}')
  localStorage.setItem(
    'myielts_task1_draft_v1__prompt_x',
    '{"text":"guest draft"}',
  )
  localStorage.setItem('myielts_ai_settings_v1', '{"apiKey":"secret"}')
  localStorage.setItem(entryKey('progress_v1', 'reading', 'bob'), 'private')
  const backup = studyBackup('alice')
  expect(backup.data[guest]).toBeDefined()
  expect(backup.data.myielts_task1_draft_v1__prompt_x).toBeDefined()
  expect(backup.data.myielts_ai_settings_v1).toBeUndefined()
  expect(Object.keys(backup.data).some(k => k.includes('u_bob_'))).toBe(false)
})
it('coalesces repeated logout clicks into one push and one pre-logout flush', async () => {
  vi.useRealTimers()
  let deliver: ((v: any) => void) | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: any) =>
      init.method === 'GET'
        ? Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, protocolVersion: 2, data: null }),
        })
        : new Promise((resolve) => {
          deliver = resolve
        }),
    ),
  )
  const flush = vi.fn()
  const off = onBeforeLogout(flush)
  const a = auth.logout()
  const b = auth.logout()
  expect(a).toBe(b)
  for (let i = 0; i < 10; i++) {
    if (deliver)
      break
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  expect(deliver).toBeDefined()
  deliver!({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
  })
  await a
  await b
  expect(flush).toHaveBeenCalledTimes(1)
  off()
})
it('does not count the legacy base twice when the device counter already contains it', () => {
  const base = accountKey('study_time_v1', 'alice')
  const date = '2026-10-27'
  expect(
    legacyTimerSeconds(
      [
        { device: base, date, legacySeconds: 100 },
        { device: `${base}_one`, date, legacySeconds: 150 },
        { device: `${base}_two`, date, legacySeconds: 30 },
      ],
      base,
      date,
    ),
  ).toBe(180)
  expect(
    legacyTimerSeconds(
      [
        { device: base, date, legacySeconds: 200 },
        { device: `${base}_one`, date, legacySeconds: 150 },
      ],
      base,
      date,
    ),
  ).toBe(200)
})
it('batch clear reads storage linearly rather than reloading the full table after each item', () => {
  const count = 100
  for (let i = 0; i < count; i++)
    saveRecord('corpus_sr_v1', String(i), { dueAt: i }, 'alice')
  const scope = effectScope()
  const store = scope.run(() => useRecordMap<any>('corpus_sr_v1'))!
  const spy = vi.spyOn(Storage.prototype, 'getItem')
  spy.mockClear()
  store.clear()
  expect(spy.mock.calls.length).toBeLessThan(count * 6)
  expect(Object.keys(store.state.value)).toHaveLength(0)
  scope.stop()
})
it('uses the latest same-word schedule while preserving both writers attempt totals', async () => {
  const scheduleKey = entryKey('sr_vocabulary_v1', 'vocab:1', 'alice')
  saveRecord(
    'sr_vocabulary_v1',
    'vocab:1',
    { reps: 0, lapses: 1, dueAt: 0 },
    'alice',
  )
  recordAttempt('vocabulary', 0)
  const stamp = envelope(localStorage.getItem(scheduleKey)!).stamp[0] + 100
  applySyncData(
    {
      [scheduleKey]: JSON.stringify({
        __ielts: 2,
        stamp: [stamp, 'other'],
        value: { reps: 1, lapses: 0, dueAt: Date.now() + 86400000 },
      }),
      [entryKey('stats_parts_v2', 'other-writer', 'alice')]: JSON.stringify({
        __ielts: 2,
        stamp: [stamp, 'other'],
        value: {
          totals: { vocabulary: { known: 1, vague: 0, unknown: 0 } },
          days: {
            '2026-10-27': { vocabulary: { known: 1, vague: 0, unknown: 0 } },
          },
        },
      }),
    },
    'alice',
  )
  const attempts = getAttempts()['2026-10-27'].vocabulary
  expect(attempts.known).toBe(1)
  expect(attempts.unknown).toBe(1)
  expect(readRecords<any>('sr_vocabulary_v1', 'alice')['vocab:1'].reps).toBe(1)
})

it('a newer remote envelope cannot move an AI retention watermark backwards', () => {
  const key = accountKey('aigrade_v1_1', 'alice')
  saveValue(key, { essay: 'retired' })
  const old = localStorage.getItem(key)!
  pruneArchives('alice', 0, 0)
  applySyncData(
    {
      [key]: old,
      [accountKey('archive_retention_v2', 'alice')]: JSON.stringify({
        __ielts: 2,
        stamp: [Date.now() + 100000, 'remote'],
        value: { cutoff: [0, 'legacy', ''] },
      }),
    },
    'alice',
  )
  expect(localStorage.getItem(key)).toBeNull()
})

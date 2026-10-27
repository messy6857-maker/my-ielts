import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useMastered, useProgress } from '../src/composables/useStudyData'
import {
  useCheckin,
  useDailyGoal,
} from '../src/composables/useSpacedRepetition'
import { useDeckStore } from '../src/composables/useDeckStore'
import {
  decrementAttempt,
  getAttempts,
  recordAttempt,
} from '../src/composables/useStats'
import {
  apiPull,
  apiPush,
  applySyncData,
  collectSyncData,
  getToken,
  setToken,
} from '../src/composables/syncClient'
import {
  accountKey,
  entryKey,
  envelope,
  notifyStorage,
  readRecords,
  readValue,
  saveEnvelope,
  saveRecord,
  saveValue,
} from '../src/utils/storage'
import { migrateStudy } from '../src/utils/migrateStudy'
import { pruneArchives } from '../src/utils/archives'
import { deleteDraft, listDrafts, saveDraft } from '../src/utils/drafts'

const auth = useAuth()
const sched = { ease: 2.5, interval: 1, dueAt: 100000, reps: 1, lapses: 0 }
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('alice-token', 'alice')
  notifyStorage('', 'remote')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('versioned records and identity boundaries', () => {
  it('does not collect or apply username-prefix collisions', () => {
    const key = accountKey('task1_essays_v1', 'alice_bob')
    localStorage.setItem(key, '["private"]')
    expect(collectSyncData('alice')[key]).toBeUndefined()
    applySyncData({ [key]: '[]' }, 'alice')
    expect(localStorage.getItem(key)).toBe('["private"]')
  })
  it('does not bind another account to the shared token', () => {
    expect(getToken('bob')).toBeNull()
    expect(getToken('alice')).toBe('alice-token')
  })
  it('preserves independent updates from two stale table readers', () => {
    const a = useProgress()
    const b = useProgress()
    a.setProgress('reading', 1, 10)
    b.setProgress('writing', 2, 20)
    expect(readRecords<any>('progress_v1', 'alice').reading.done).toBe(1)
    expect(readRecords<any>('progress_v1', 'alice').writing.done).toBe(2)
  })
  it('a stale cloud pull cannot overwrite a new local edit', () => {
    saveRecord('progress_v1', 'reading', { done: 9 }, 'alice')
    const key = entryKey('progress_v1', 'reading', 'alice')
    applySyncData(
      {
        [key]: JSON.stringify({
          __ielts: 2,
          stamp: [1, 'cloud'],
          value: { done: 1 },
        }),
      },
      'alice',
    )
    expect(readValue<any>(key, null).done).toBe(9)
  })
  it('reloads mastered data before writing another word', () => {
    const scope = effectScope()
    const m = scope.run(() => useMastered('reading_mastered_v1'))!
    applySyncData(
      { [accountKey('reading_mastered_v1', 'alice')]: '["cloud"]' },
      'alice',
    )
    m.toggleMastered('local')
    expect(m.mastered.value.sort()).toEqual(['cloud', 'local'])
    scope.stop()
  })
  it('cached deck persists after the first page scope is disposed', () => {
    const a = effectScope()
    const deck = a.run(() => useDeckStore('reading538'))!
    a.stop()
    deck.setSchedule('second', sched)
    expect(
      readRecords<any>('reading538_sr_v1', 'alice')['reading538:second'],
    ).toEqual(sched)
  })
  it('deletion survives over 100 later deletions and a stale copy', () => {
    saveRecord('reading_mastered_v1', 'first', true, 'alice')
    const key = entryKey('reading_mastered_v1', 'first', 'alice')
    const stale = localStorage.getItem(key)!
    saveRecord('reading_mastered_v1', 'first', undefined, 'alice')
    for (let i = 0; i < 110; i++)
      saveRecord('reading_mastered_v1', String(i), undefined, 'alice')
    applySyncData({ [key]: stale }, 'alice')
    expect(readValue(key, false)).toBe(false)
  })
  it('rebuilding the same value gets a newer version than its deletion', () => {
    const key = entryKey('reading_mastered_v1', 'word', 'alice')
    saveRecord('reading_mastered_v1', 'word', true, 'alice')
    saveRecord('reading_mastered_v1', 'word', undefined, 'alice')
    const deletion = localStorage.getItem(key)!
    saveRecord('reading_mastered_v1', 'word', true, 'alice')
    applySyncData({ [key]: deletion }, 'alice')
    expect(readValue(key, false)).toBe(true)
  })
  it('malformed legacy tombstones cannot break an otherwise valid pull', () => {
    localStorage.setItem(
      accountKey('tombstones_v1', 'alice'),
      JSON.stringify([{ k: accountKey('aigrade_v1_a', 'alice'), h: 'x' }]),
    )
    localStorage.setItem(accountKey('aigrade_v1_a', 'alice'), 'broken')
    expect(() => applySyncData({}, 'alice')).not.toThrow()
  })
})
describe('daily counters, totals and migration', () => {
  it('opening a new day does not write zero over another device', () => {
    const daily = useDailyGoal()
    daily.reload()
    expect(
      localStorage.getItem(accountKey('flashcard_daily_new_v1', 'alice')),
    ).toBeNull()
  })
  it('new words and undo retain the original date across midnight', () => {
    const daily = useDailyGoal()
    const day = daily.recordNewWord('old')
    vi.setSystemTime(new Date(2026, 9, 28, 0, 1))
    daily.recordNewWord('new')
    daily.decrementNewWord('old', day)
    expect(daily.dailyCount.value).toBe(1)
    const records = Object.values(readRecords<any>('daily_parts_v2', 'alice'))
    expect(
      records.filter(p => p.date === day && p.word === 'old'),
    ).toHaveLength(0)
  })
  it('counts one new word once per day across writers', () => {
    const daily = useDailyGoal()
    daily.recordNewWord('same')
    saveRecord(
      'daily_parts_v2',
      'other',
      {
        ns: 'vocabulary',
        date: '2026-10-27',
        word: 'same',
        count: 1,
        actor: 'other',
        epoch: '',
      },
      'alice',
    )
    expect(daily.dailyCount.value).toBe(1)
  })
  it('retains all-time accuracy while trimming old daily details', () => {
    recordAttempt('vocabulary', 5)
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    recordAttempt('vocabulary', 0)
    const result = getAttempts()
    expect(result['2026-10-27']).toBeUndefined()
    expect(result.history.vocabulary.known).toBe(1)
    expect(result['2026-11-20'].vocabulary.unknown).toBe(1)
  })
  it('undo decrements the original day rather than today', () => {
    const day = recordAttempt('vocabulary', 0)
    vi.setSystemTime(new Date(2026, 9, 28, 1))
    recordAttempt('vocabulary', 5)
    decrementAttempt('vocabulary', 0, day)
    const records = getAttempts()
    expect(records[day].vocabulary.unknown).toBe(0)
    expect(records['2026-10-28'].vocabulary.known).toBe(1)
  })
  it('imports cloud legacy mistakes even after the feature has initialized', () => {
    applySyncData(
      {
        [accountKey('mistakes_v1', 'alice')]: JSON.stringify([
          {
            key: 'corpus:1',
            module: 'listening',
            count: 3,
            title: 'word',
            firstAt: 1,
            lastAt: 2,
          },
        ]),
      },
      'alice',
    )
    expect(
      readRecords<any>('mistake_parts_v2', 'alice')['corpus:1|legacy'].module,
    ).toBe('corpus')
  })
  it('migrates legacy aggregate statistics before collecting an upload', () => {
    localStorage.setItem(
      accountKey('stats_attempts_v1', 'alice'),
      JSON.stringify({
        '2026-1-1': { vocabulary: { known: 7, vague: 2, unknown: 1 } },
      }),
    )
    collectSyncData('alice')
    expect(
      readRecords<any>('stats_parts_v2', 'alice').legacy.totals.vocabulary
        .known,
    ).toBe(7)
  })
  it('compresses old check-ins while preserving lifetime days and a long streak', () => {
    const dates = Array.from({ length: 150 }, (_, i) => {
      const d = new Date(2026, 9, 27 - i)
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    })
    localStorage.setItem(
      accountKey('flashcard_checkin_v1', 'alice'),
      JSON.stringify(dates),
    )
    migrateStudy('alice')
    const c = useCheckin()
    c.reload()
    expect(c.totalDays.value).toBe(150)
    expect(c.streak.value).toBe(150)
    expect(
      Object.keys(readRecords('flashcard_checkin_v1', 'alice')).length,
    ).toBeLessThanOrEqual(91)
  })
  it('unions concurrent yearly check-ins even if an incoming stamp is older', () => {
    const key = entryKey('checkin_years_v2', '2026', 'alice')
    saveRecord('checkin_years_v2', '2026', [1, 2], 'alice')
    applySyncData(
      { [key]: JSON.stringify({ __ielts: 2, stamp: [0, 'old'], value: [3] }) },
      'alice',
    )
    expect(readValue(key, [])).toEqual([1, 2, 3])
  })
})
describe('bounded archives and independent drafts', () => {
  it('keeps at most 30 AI archives and rejects stale restoration', () => {
    for (let i = 0; i < 35; i++)
      saveValue(accountKey(`aigrade_v1_${i}`, 'alice'), { text: String(i) })
    const key = accountKey('aigrade_v1_0', 'alice')
    const old = localStorage.getItem(key)!
    pruneArchives('alice')
    applySyncData({ [key]: old }, 'alice')
    expect(
      Object.keys(collectSyncData('alice')).filter(k =>
        k.includes('_aigrade_'),
      ),
    ).toHaveLength(30)
    expect(localStorage.getItem(key)).toBeNull()
  })
  it('switching prompts retains both drafts and deleting one retains the other', () => {
    saveDraft('task1', 'alice', {
      promptId: 'a',
      text: 'first',
      secondsLeft: 10,
    })
    saveDraft('task1', 'alice', {
      promptId: 'b',
      text: 'second',
      secondsLeft: 20,
    })
    deleteDraft('task1', 'alice', 'b')
    expect(listDrafts('task1', 'alice').map(d => d.text)).toEqual(['first'])
    expect(listDrafts('task1', 'bob')).toEqual([])
  })
  it('migrates a legacy draft without silently clearing it', () => {
    localStorage.setItem(
      'myielts_u_alice_task2_draft_v1',
      JSON.stringify({ promptId: 'p', text: 'valuable', secondsLeft: 0 }),
    )
    expect(listDrafts('task2', 'alice')[0].text).toBe('valuable')
  })
  it('preserves an unreadable legacy record for backup', () => {
    const key = accountKey('stats_attempts_v1', 'alice')
    localStorage.setItem(key, 'broken')
    expect(() => migrateStudy('alice')).not.toThrow()
    expect(localStorage.getItem(key)).toBe('broken')
  })
})
describe('sync protocol responses', () => {
  it('rejects a 200 response whose body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('html')
        },
      }),
    )
    expect((await apiPull('alice')).ok).toBe(false)
  })
  it('refuses to upload to an old whole-blob server', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: null }),
    })
    vi.stubGlobal('fetch', fetcher)
    expect((await apiPush({}, 'alice')).status).toBe(426)
    expect(fetcher.mock.calls.every(c => c[1].method === 'GET')).toBe(true)
  })
  it('stamps a new local write after the maximum pulled version', () => {
    const key = entryKey('progress_v1', 'reading', 'alice')
    saveEnvelope(
      key,
      { __ielts: 2, stamp: [Date.now() + 100000, 'cloud'], value: { done: 1 } },
      'remote',
    )
    saveRecord('progress_v1', 'reading', { done: 2 }, 'alice')
    expect(envelope(localStorage.getItem(key)!).stamp[0]).toBeGreaterThan(
      Date.now() + 100000,
    )
  })
})
it('merges legacy mastered sets before cloud normalization', () => {
  localStorage.setItem(accountKey('reading_mastered_v1', 'alice'), '["local"]')
  readRecords('reading_mastered_v1', 'alice')
  applySyncData(
    { [accountKey('reading_mastered_v1', 'alice')]: '["cloud"]' },
    'alice',
  )
  expect(
    Object.keys(readRecords('reading_mastered_v1', 'alice')).sort(),
  ).toEqual(['cloud', 'local'])
})
it('keeps local additions when importing a newer legacy progress snapshot', () => {
  saveRecord('progress_v1', 'reading', { done: 9 }, 'alice')
  applySyncData(
    {
      [accountKey('progress_v1', 'alice')]: JSON.stringify({
        reading: { done: 1 },
        writing: { done: 2 },
      }),
    },
    'alice',
  )
  const records = readRecords<any>('progress_v1', 'alice')
  expect(records.reading.done).toBe(9)
  expect(records.writing.done).toBe(2)
})
it('preserves higher legacy totals when the cloud snapshot overlaps', () => {
  localStorage.setItem(
    accountKey('stats_attempts_v1', 'alice'),
    JSON.stringify({
      '2026-10-27': { vocabulary: { known: 5, vague: 0, unknown: 0 } },
    }),
  )
  migrateStudy('alice')
  applySyncData(
    {
      [accountKey('stats_attempts_v1', 'alice')]: JSON.stringify({
        '2026-10-27': { vocabulary: { known: 7, vague: 0, unknown: 0 } },
      }),
    },
    'alice',
  )
  expect(getAttempts()['2026-10-27'].vocabulary.known).toBe(7)
})

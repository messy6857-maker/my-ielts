import { beforeEach, expect, it, vi } from 'vitest'
import {
  bucketOf,
  compactStatsData,
  expandStatsData,
  mergeWriters,
  partOf,
} from '../src/utils/statsArchive'
import {
  accountKey,
  entryKey,
  saveEnvelope,
  writerId,
} from '../src/utils/storage'
import { useAuth } from '../src/composables/useAuth'
import {
  decrementAttempt,
  getAttempts,
  recordAttempt,
} from '../src/composables/useStats'
import {
  apiPull,
  apiPush,
  applySyncData,
  setToken,
} from '../src/composables/syncClient'
import { previewStudyBackup, restoreStudyBackup } from '../src/utils/backup'

const user = 'alice'
function raw(known: number, stamp = 10, days = {}) {
  return JSON.stringify({
    __ielts: 2,
    stamp: [stamp, writerId()],
    value: { totals: { vocabulary: { known, vague: 0, unknown: 0 } }, days },
  })
}
beforeEach(() => {
  localStorage.clear()
  useAuth().currentUser.value = user
  setToken('local-test', user)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('compacts old writer headers losslessly and expands for legacy clients', () => {
  const key = entryKey('stats_parts_v2', writerId(), user)
  const input = { [key]: raw(5) }
  const compact = compactStatsData(input, user)
  expect(compact[key]).toBeUndefined()
  expect(expandStatsData(compact, user)).toEqual(input)
  expect(compactStatsData({ ...compact, ...input }, user)).toEqual(compact)
})
it('an archived writer can resume, undo and archive again without duplicating lifetime totals', () => {
  const key = entryKey('stats_parts_v2', writerId(), user)
  applySyncData(compactStatsData({ [key]: raw(5) }, user), user)
  expect(getAttempts().history.vocabulary.known).toBe(5)
  recordAttempt('vocabulary', 5)
  expect(
    Object.values(getAttempts()).reduce(
      (n, d) => n + (d.vocabulary?.known || 0),
      0,
    ),
  ).toBe(6)
  decrementAttempt('vocabulary', 5)
  expect(
    Object.values(getAttempts()).reduce(
      (n, d) => n + (d.vocabulary?.known || 0),
      0,
    ),
  ).toBe(5)
})
it('merges different writers and same-writer revisions independently within one bucket', () => {
  const a = { one: [1, 'a', { vocabulary: [3, 0, 0] }] }
  const b = {
    two: [1, 'b', { vocabulary: [2, 0, 0] }],
    one: [2, 'a', { vocabulary: [2, 0, 0] }],
  }
  expect(mergeWriters(a, b)).toEqual(mergeWriters(b, a))
  expect(
    (partOf(mergeWriters(a, b).one, 'one') as any).value.totals.vocabulary
      .known,
  ).toBe(2)
  expect(
    mergeWriters(
      { legacy: [0, 'legacy', { vocabulary: [3, 1, 0] }] },
      { legacy: [0, 'legacy', { vocabulary: [1, 2, 0] }] },
    ).legacy[2].vocabulary,
  ).toEqual([3, 2, 0])
})
it('restoring a backup unions archive writers rather than replacing the bucket', () => {
  const key = entryKey('stats_archive_v3', bucketOf('one'), user)
  saveEnvelope(key, {
    __ielts: 2,
    stamp: [1, 'a'],
    value: { writers: { one: [1, 'a', { vocabulary: [1, 0, 0] }] } },
  })
  const preview = previewStudyBackup(
    JSON.stringify({
      format: 'my-ielts-backup',
      version: 2,
      username: user,
      data: {
        [key]: JSON.stringify({
          __ielts: 2,
          stamp: [2, 'b'],
          value: { writers: { two: [2, 'b', { vocabulary: [1, 0, 0] }] } },
        }),
      },
    }),
  )
  expect(restoreStudyBackup(preview, user).failed).toBe(0)
  expect(getAttempts().history.vocabulary.known).toBe(2)
})
it('pulls all pages before exposing a consistent snapshot and restarts after 409', async () => {
  let count = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const responses = [
        {
          ok: true,
          protocolVersion: 2,
          compactStats: true,
          data: { first: '1' },
          nextCursor: 'stale',
        },
        { ok: false, message: 'changed' },
        {
          ok: true,
          protocolVersion: 2,
          compactStats: true,
          data: { fresh: '2' },
          nextCursor: 'next',
        },
        {
          ok: true,
          protocolVersion: 2,
          compactStats: true,
          data: { last: '3' },
          nextCursor: null,
        },
      ]
      const i = count++
      const status = i === 1 ? 409 : 200
      return { ok: status === 200, status, json: async () => responses[i] }
    }),
  )
  const result = await apiPull(user)
  expect(result.ok).toBe(true)
  expect(result.data).toEqual({ fresh: '2', last: '3' })
  expect(localStorage.getItem(accountKey('first', user))).toBeNull()
})
it('refuses to send a compact archive to a backend that has not advertised support', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, protocolVersion: 2, data: null }),
    })),
  )
  await apiPull(user)
  const key = entryKey('stats_archive_v3', '00', user)
  expect(
    (
      await apiPush(
        {
          [key]: JSON.stringify({
            __ielts: 2,
            stamp: [1, 'a'],
            value: { writers: {} },
          }),
        },
        user,
      )
    ).status,
  ).toBe(426)
})

it('an archived legacy union is not replaced by a stale legacy table seed', () => {
  const key = entryKey('stats_parts_v2', 'legacy', user)
  const archived = compactStatsData({ [key]: JSON.stringify({ __ielts: 2, stamp: [0, 'legacy'], value: { totals: { vocabulary: { known: 10, vague: 0, unknown: 0 } }, days: {} } }) }, user)
  localStorage.setItem(accountKey('stats_attempts_v1', user), JSON.stringify({ '2020-1-1': { vocabulary: { known: 5, vague: 0, unknown: 0 } } }))
  applySyncData(archived, user)
  expect(getAttempts().history.vocabulary.known).toBe(10)
})

it('recording after a legacy table restore starts from the migrated writer total', () => {
  localStorage.setItem(accountKey('stats_parts_v2', user), JSON.stringify({ [writerId()]: { totals: { vocabulary: { known: 3, vague: 0, unknown: 0 } }, days: {} } }))
  recordAttempt('vocabulary', 5)
  expect(Object.values(getAttempts()).reduce((n, d) => n + (d.vocabulary?.known || 0), 0)).toBe(4)
})
it('ignores malformed local writer keys when reading lifetime statistics', () => {
  localStorage.setItem(`${accountKey('stats_parts_v2', user)}__entry_corrupt`, raw(5))
  expect(() => getAttempts()).not.toThrow()
})

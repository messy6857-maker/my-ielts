// D-2：听力 179 进度逐行记录（不再是"最远到达"）。
import { beforeEach, expect, it, vi } from 'vitest'
import { applySyncData } from '../src/composables/syncClient'
import { useAuth } from '../src/composables/useAuth'
import { useProgress } from '../src/composables/useStudyData'
import { entryKey, readRecords, saveRecord } from '../src/utils/storage'

const auth = useAuth()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // 切账号触发 record map 重载，把全局单例的状态复位到空
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  vi.restoreAllMocks()
})

it('migrates an old furthest-reached record to rows 1..N', () => {
  saveRecord('progress_v1', 'listening', { done: 3, total: 179, updatedAt: 1 }, 'alice')
  const p = useProgress()
  expect(p.getProgress('listening').done).toBe(3)
  expect(p.getProgress('listening').total).toBe(179)
  expect(Object.keys(readRecords('listening179_done_v1', 'alice')).sort()).toEqual(['1', '2', '3'])
})

it('counts studied rows, not the furthest row', () => {
  const p = useProgress()
  p.markListening179RowStudied(100)
  p.markListening179RowStudied(1)
  expect(p.getProgress('listening').done).toBe(2)
  expect(p.getProgress('listening').total).toBe(179)
  // 重复标记同一行不重复计
  p.markListening179RowStudied(100)
  expect(p.getProgress('listening').done).toBe(2)
})

it('merges late old progress without overwriting real row stamps or reseeding deleted rows', () => {
  const p = useProgress()
  p.markListening179RowStudied(50)
  const rowKey = entryKey('listening179_done_v1', '50', 'alice')
  const realRow = localStorage.getItem(rowKey)
  saveRecord('listening179_done_v1', '2', undefined, 'alice')
  const key = entryKey('progress_v1', 'listening', 'alice')
  const payload = {
    [key]: JSON.stringify({
      __ielts: 2,
      stamp: [
        Date.now(),
        'remote',
      ],
      value: { done: 6, total: 179, updatedAt: 1 },
    }),
  }
  applySyncData(payload, 'alice')
  expect(p.getProgress('listening').done).toBe(6)
  expect(Object.keys(readRecords('listening179_done_v1', 'alice')).sort()).toEqual(['1', '3', '4', '5', '50', '6'])
  expect(localStorage.getItem(rowKey)).toBe(realRow)
  applySyncData(payload, 'alice')
  expect(p.getProgress('listening').done).toBe(6)
})

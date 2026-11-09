// D-2：听力 179 进度逐行记录（不再是"最远到达"）。
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import { useProgress } from '../src/composables/useStudyData'
import { readRecords, saveRecord } from '../src/utils/storage'

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

it('does not re-migrate once rows exist', () => {
  const p = useProgress()
  p.markListening179RowStudied(50)
  expect(p.getProgress('listening').done).toBe(1)
  // 之后再出现旧记录（例如另一设备同步回来的旧值），不再覆盖逐行真相
  saveRecord('progress_v1', 'listening', { done: 100, total: 179, updatedAt: 1 }, 'alice')
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  expect(p.getProgress('listening').done).toBe(1)
})

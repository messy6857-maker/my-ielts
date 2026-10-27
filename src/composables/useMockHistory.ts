import { clearRecords, readRecords, saveRecord } from '../utils/storage'
import { useAuth } from './useAuth'

export interface MockRecord {
  id: string // test id, e.g. 'cam19-test1'
  label: string // e.g. '剑19 Test 1'
  kind: 'listening' | 'reading'
  score: number // 得分
  total: number // 总分
  band: number // 换算分
  date: string // ISO
}
function owner() {
  return useAuth().currentUser.value
}
export function getMockHistory(): MockRecord[] {
  return Object.values(
    readRecords<MockRecord>('mock_history_v1', owner()),
  ).sort((a, b) => b.date.localeCompare(a.date))
}
export function saveMockRecord(r: Omit<MockRecord, 'date'>) {
  const record = { ...r, date: new Date().toISOString() }
  const saved = saveRecord(
    'mock_history_v1',
    `${r.kind}:${r.id}:${record.date}:${crypto.randomUUID()}`,
    record,
    owner(),
  )
  for (const old of Object.entries(
    readRecords<MockRecord>('mock_history_v1', owner()),
  )
    .sort((a, b) => b[1].date.localeCompare(a[1].date))
    .slice(100))
    saveRecord('mock_history_v1', old[0], undefined, owner())
  return saved
}
export function clearMockHistory() {
  clearRecords('mock_history_v1', owner())
}

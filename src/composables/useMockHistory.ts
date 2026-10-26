import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey } from './useStudyData'

export interface MockRecord {
  id: string // test id, e.g. 'cam19-test1'
  label: string // e.g. '剑19 Test 1'
  kind: 'listening' | 'reading'
  score: number // 得分
  total: number // 总分
  band: number // 换算分
  date: string // ISO
}

function key(): string {
  return nsKey('mock_history_v1')
}

export function getMockHistory(): MockRecord[] {
  // Earlier versions stored visitors under the literal username "guest".
  // Migrate only when no real local account owns that legacy namespace.
  try {
    const legacy = 'myielts_u_guest_mock_history_v1'
    if (!useAuth().currentUser.value && localStorage.getItem(key()) === null
      && !readJson<Record<string, unknown>>('myielts_users_v1', {}).guest) {
      const old = readJson<MockRecord[] | null>(legacy, null, 'mock_history_v1')
      if (Array.isArray(old) && writeJson(key(), old))
        localStorage.removeItem(legacy)
    }
  }
  catch {
    // Storage can be disabled by the browser; readJson below retains its fallback.
  }
  const records = readJson<MockRecord[]>(key(), [], 'mock_history_v1')
  return Array.isArray(records) ? records : []
}

export function saveMockRecord(r: Omit<MockRecord, 'date'>): void {
  const list = getMockHistory()
  list.unshift({ ...r, date: new Date().toISOString() })
  // 只保留最近 100 条
  writeJson(key(), list.slice(0, 100))
}

export function clearMockHistory(): void {
  // Keep an explicit empty value so clearing is propagated to other devices.
  writeJson(key(), [])
}

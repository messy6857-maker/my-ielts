import { removeJson, useAuth, writeJson } from './useAuth'

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
  const { currentUser } = useAuth()
  const user = currentUser.value ?? 'guest'
  return `myielts_u_${user}_mock_history_v1`
}

export function getMockHistory(): MockRecord[] {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? '[]')
  } catch {
    return []
  }
}

export function saveMockRecord(r: Omit<MockRecord, 'date'>): void {
  const list = getMockHistory()
  list.unshift({ ...r, date: new Date().toISOString() })
  // 只保留最近 100 条；经 writeJson 触发同步，做完就关页也不丢
  writeJson(key(), list.slice(0, 100))
}

export function clearMockHistory(): void {
  // 经 removeJson 触发删除通知，同步层收到后标记 dirty 参与推送
  removeJson(key())
}

import { accountPrefix, clearRecords, readRecords, saveRecord } from '../utils/storage'
import { useAuth } from './useAuth'

export interface MockRecord {
  attemptId?: string
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
  if (!saved)
    return false
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
  // 开始屏“已有交卷记录”提示取自草稿 key 的 submitted 标记，与做题记录
  // 是两个事实源：只清记录会让提示在清记录后仍在（B3）。同步清除本账号
  // 的已交卷快照（含 B1 迁移后的 __submitted_ 独立键），同时 heal 清记录
  // 前已不一致的旧状态。仅删 submitted:true 的快照：进行中草稿、恢复
  // 副本、归档副本一律不动；键前缀带本账号标识，他人快照不受影响。
  const prefix = `${accountPrefix(owner())}mock_draft_v1_`
  for (const storageKey of Object.keys(localStorage)) {
    if (!storageKey.startsWith(prefix))
      continue
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (draft?.version === 1 && draft.submitted === true)
        localStorage.removeItem(storageKey)
    }
    catch {
      /* 损坏项不是可辨认的已交卷快照，留给原流程处理。 */
    }
  }
}

import { compactStatsParts } from '../utils/migrateStudy'
import { dateTime } from '../utils/legacyMerge'

// 学习数据统计：自测卡片每次自评按日累计，供统计仪表盘使用
// 注意：此前没有按日记录自评历史，本功能上线后才开始累计；
// 上线前的自测正确率无法还原，只能从 SM-2 现状（已学词、到期词、累计记错）看当前状态。
import {
  entryKey,
  readRecord,
  readRecords,
  saveEnvelope,
  saveRecord,
  writerId,
} from '../utils/storage'
import { readJson, useAuth } from './useAuth'
import { nsKey } from './useStudyData'

export type AttemptGrade = 0 | 3 | 5
export interface AttemptCount {
  known: number // 认识（5）
  vague: number // 模糊（3）
  unknown: number // 不认识（0）
}
export type AttemptRecord = Record<string, Record<string, AttemptCount>>
// 外层 key：日期（YYYY-M-D，与打卡/计时同一格式）；内层 key：自测模块 ns
export const ATTEMPT_MODULE_LABEL: Record<string, string> = {
  vocabulary: '单词自测',
  listening179: '听力自测',
  reading538: '阅读自测',
  corpus: '语料库自测',
}
export function attemptModuleLabel(ns: string): string {
  return ATTEMPT_MODULE_LABEL[ns] || ns
}
function emptyCount(): AttemptCount {
  return { known: 0, vague: 0, unknown: 0 }
}
export function todayStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
export function dateLabel(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return offset === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`
}
interface StatsPart {
  totals: Record<string, AttemptCount>
  days: AttemptRecord
}
function loadPart(): StatsPart {
  const user = useAuth().currentUser.value
  return (
    readRecord<StatsPart>('stats_parts_v2', writerId(), user) ?? {
      totals: {},
      days: {},
    }
  )
}
function prune(part: StatsPart) {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 13)
  for (const date of Object.keys(part.days)) {
    if (dateTime(date) < cutoff.getTime())
      delete part.days[date]
  }
}
function changeAttempt(
  module: string,
  grade: AttemptGrade,
  delta: number,
  date: string,
) {
  const part = loadPart()
  const field = grade === 5 ? 'known' : grade === 3 ? 'vague' : 'unknown'
  const total = (part.totals[module] ??= emptyCount())
  total[field] = Math.max(0, total[field] + delta)
  const count = ((part.days[date] ??= {})[module] ??= emptyCount())
  count[field] = Math.max(0, count[field] + delta)
  prune(part)
  saveRecord('stats_parts_v2', writerId(), part, useAuth().currentUser.value)
}
export function recordAttempt(module: string, grade: AttemptGrade): string {
  const date = todayStr()
  changeAttempt(module, grade, 1, date)
  return date
}
export function decrementAttempt(
  module: string,
  grade: AttemptGrade,
  date = todayStr(),
): void {
  changeAttempt(module, grade, -1, date)
}
export function getAttempts(): AttemptRecord {
  const user = useAuth().currentUser.value
  const key = entryKey('stats_parts_v2', 'legacy', user)
  if (localStorage.getItem(key) === null) {
    const legacy = readJson<AttemptRecord>(nsKey('stats_attempts_v1'), {})
    const part: StatsPart = { totals: {}, days: legacy }
    for (const day of Object.values(legacy)) {
      for (const [module, count] of Object.entries(day)) {
        part.totals[module] = mergeCounts([
          part.totals[module] ?? emptyCount(),
          count,
        ])
      }
    }
    prune(part)
    if (Object.keys(part.totals).length) {
      saveEnvelope(
        key,
        { __ielts: 2, stamp: [0, 'legacy'], value: part },
        'remote',
      )
    }
  }
  compactStatsParts(user)
  const result: AttemptRecord = {}
  const totals: Record<string, AttemptCount> = {}
  const recent: Record<string, AttemptCount> = {}
  for (const part of Object.values(
    readRecords<StatsPart>('stats_parts_v2', user),
  )) {
    prune(part)
    for (const [module, count] of Object.entries(part.totals))
      totals[module] = mergeCounts([totals[module] ?? emptyCount(), count])
    for (const [date, records] of Object.entries(part.days)) {
      for (const [module, count] of Object.entries(records)) {
        (result[date] ??= {})[module] = mergeCounts([
          result[date]?.[module] ?? emptyCount(),
          count,
        ])
        recent[module] = mergeCounts([recent[module] ?? emptyCount(), count])
      }
    }
  }
  const archive: Record<string, AttemptCount> = {}
  for (const [module, count] of Object.entries(totals)) {
    archive[module] = {
      known: Math.max(0, count.known - (recent[module]?.known ?? 0)),
      vague: Math.max(0, count.vague - (recent[module]?.vague ?? 0)),
      unknown: Math.max(0, count.unknown - (recent[module]?.unknown ?? 0)),
    }
  }
  result.history = archive
  return result
}
export function sumCount(c: AttemptCount): number {
  return c.known + c.vague + c.unknown
}
/** 认识率：认识次数 / 全部自评次数；无数据返回 null（不编造） */
export function knownRate(c: AttemptCount): number | null {
  const total = sumCount(c)
  return total > 0 ? Math.round((c.known / total) * 100) : null
}
export function mergeCounts(list: AttemptCount[]): AttemptCount {
  const out = emptyCount()
  for (const c of list) {
    out.known += c.known
    out.vague += c.vague
    out.unknown += c.unknown
  }
  return out
}

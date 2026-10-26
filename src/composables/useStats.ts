// 学习数据统计：自测卡片每次自评按日累计，供统计仪表盘使用
// 注意：此前没有按日记录自评历史，本功能上线后才开始累计；
// 上线前的自测正确率无法还原，只能从 SM-2 现状（已学词、到期词、累计记错）看当前状态。

import { readJson, writeJson } from './useAuth'
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

/** 自测卡片自评时调用：按当天 + 模块累计一次 */
export function recordAttempt(module: string, grade: AttemptGrade): void {
  try {
    const key = nsKey('stats_attempts_v1')
    const all = readJson<AttemptRecord>(key, {})
    const day = todayStr()
    const dayRec = all[day] || {}
    const c = dayRec[module] || emptyCount()
    if (grade === 5)
      c.known += 1
    else if (grade === 3)
      c.vague += 1
    else
      c.unknown += 1
    dayRec[module] = c
    all[day] = dayRec
    writeJson(key, all)
  }
  catch {
    // 统计写入失败不影响正常自评
  }
}

/** “返回上一个”时扣减一次当日累计，与 recordAttempt 对称 */
export function decrementAttempt(module: string, grade: AttemptGrade): void {
  try {
    const key = nsKey('stats_attempts_v1')
    const all = readJson<AttemptRecord>(key, {})
    const day = todayStr()
    const dayRec = all[day]
    if (!dayRec)
      return
    const c = dayRec[module]
    if (!c)
      return
    if (grade === 5)
      c.known = Math.max(0, c.known - 1)
    else if (grade === 3)
      c.vague = Math.max(0, c.vague - 1)
    else
      c.unknown = Math.max(0, c.unknown - 1)
    writeJson(key, all)
  }
  catch {
    // 统计写入失败不影响正常自评
  }
}

export function getAttempts(): AttemptRecord {
  try {
    return readJson<AttemptRecord>(nsKey('stats_attempts_v1'), {})
  }
  catch {
    return {}
  }
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

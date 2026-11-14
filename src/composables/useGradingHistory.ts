import type { AIGradeResult, AISpeakingResult } from '~/composables/useAISettings'
import { isValidSpeakingGrade, repairSavedGrade } from '~/composables/useAISettings'
import { accountPrefix, envelope } from '~/utils/storage'

export interface GradingRecord {
  /** localStorage 完整 key（展开态的唯一标识） */
  key: string
  kind: 'writing' | 'speaking'
  /** 写作新版 v2 / 旧版 v1；口语只有 v1 */
  version: 'v1' | 'v2'
  /** 口语 Part（na 表示未区分）；写作无此项 */
  part?: string
  /** 存档时间戳（毫秒）；0 表示老裸 JSON、无时间信息 */
  date: number
  result: AIGradeResult | AISpeakingResult
}

const WRITING_V2 = /^aigrade_v2_([a-z\d]+)$/i
const WRITING_V1 = /^aigrade_v1_(-?[a-z\d]+)$/i
const SPEAKING_V1 = /^aigrade_speaking_v1_([a-z\d]+)_(-?[a-z\d]+)$/i

function clone<T>(v: T): T | null {
  try {
    return JSON.parse(JSON.stringify(v)) as T
  }
  catch {
    return null
  }
}

function parseWriting(value: unknown): AIGradeResult | null {
  const c1 = clone(value)
  // key 里不存 task：先按 task1 修（只影响 tr→ta 的老字段归一），
  // 不通过再按 task2 试一次；克隆后试，避免第一次的原地修正污染第二次。
  const r1 = c1
    ? repairSavedGrade(c1 as AIGradeResult, 'task1')
    : null
  if (r1)
    return r1
  const c2 = clone(value)
  return c2
    ? repairSavedGrade(c2 as AIGradeResult, 'task2')
    : null
}

/**
 * 读当前账号的 AI 批改/口语评分存档（只读，不写、不删、不迁移）。
 * 三种 key：aigrade_v2_*（写作新版）、aigrade_v1_*（写作旧版）、
 * aigrade_speaking_v1_<part>_*（口语）。形状不合格或损坏的条目跳过。
 * 按存档时间倒序；无时间信息的老裸 JSON 排最后。
 */
export function getGradingRecords(user: string | null): GradingRecord[] {
  if (!user)
    return []
  const prefix = accountPrefix(user)
  const out: GradingRecord[] = []
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix))
      continue
    const base = key.slice(prefix.length)
    let kind: GradingRecord['kind'] | null = null
    let version: GradingRecord['version'] = 'v1'
    let part: string | undefined
    if (WRITING_V2.test(base)) {
      kind = 'writing'
      version = 'v2'
    }
    else if (WRITING_V1.test(base)) {
      kind = 'writing'
      version = 'v1'
    }
    else {
      const m = SPEAKING_V1.exec(base)
      if (m) {
        kind = 'speaking'
        version = 'v1'
        part = m[1]
      }
    }
    if (!kind)
      continue
    let raw: string | null
    try {
      raw = localStorage.getItem(key)
      if (!raw)
        continue
      const env = envelope(raw)
      if (env.deleted)
        continue
      const result = kind === 'writing'
        ? parseWriting(env.value)
        : isValidSpeakingGrade(env.value)
          ? (env.value as AISpeakingResult)
          : null
      if (!result)
        continue
      out.push({
        key,
        kind,
        version,
        part,
        date: env.stamp[0] || 0,
        result,
      })
    }
    catch {
      continue
    }
  }
  return out.sort((a, b) => b.date - a.date || b.key.localeCompare(a.key))
}

import type { AIGradeResult, AISpeakingResult } from '../composables/useAISettings'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AI 返回格式异常，请重试')
  return value as Record<string, unknown>
}

function validateCriteria(value: unknown, keys: string[], numeric: boolean) {
  const data = record(value)
  for (const key of keys) {
    const v = data[key]
    if (numeric
      ? typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 9 || !Number.isInteger(v * 2)
      : typeof v !== 'string')
      throw new Error('AI 返回格式异常，请重试')
  }
}

export function parseAIGradeResult(value: unknown, task: 'task1' | 'task2'): AIGradeResult {
  const result = { ...record(value) }
  // Normalize all three Task 2 criterion maps, including optional advice.
  for (const key of ['scores', 'comments', 'advice']) {
    if (key === 'advice' && result[key] === undefined)
      continue
    const item = { ...record(result[key]) }
    if (task === 'task2' && item.ta === undefined && item.tr !== undefined)
      item.ta = item.tr
    delete item.tr
    result[key] = item
  }
  const criteria = ['ta', 'cc', 'lr', 'gra']
  validateCriteria(result.scores, [...criteria, 'overall'], true)
  validateCriteria(result.comments, criteria, false)
  if (typeof result.suggestion !== 'string' || !Array.isArray(result.corrections))
    throw new Error('AI 返回格式异常，请重试')
  for (const correction of result.corrections)
    validateCriteria(correction, ['original', 'fixed', 'reason'], false)
  if (result.advice !== undefined)
    validateCriteria(result.advice, criteria, false)
  if (result.rewritten !== undefined && typeof result.rewritten !== 'string')
    throw new Error('AI 返回格式异常，请重试')
  return result as unknown as AIGradeResult
}

export function parseAISpeakingResult(value: unknown): AISpeakingResult {
  const result = record(value)
  const criteria = ['fluency', 'lexical', 'grammar']
  validateCriteria(result.scores, [...criteria, 'overall'], true)
  validateCriteria(result.comments, criteria, false)
  if (typeof result.suggestion !== 'string')
    throw new Error('AI 返回格式异常，请重试')
  return result as unknown as AISpeakingResult
}

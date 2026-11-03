import { accountKey, readValue, saveValue } from './storage'

export interface DictationSentenceStat {
  attempts: number
  perfect: number
  lastAccuracy: number
  lastAt: number
}

export interface DictationPartProgress {
  /** Index of next sentence to practice (0-based). */
  cursor: number
  sentences: Record<string, DictationSentenceStat>
  updatedAt: number
}

const BASE = 'dictation_progress_v1'

function storageKey(user: string | null) {
  return accountKey(BASE, user)
}

export function dictationPartKey(testId: string, part: string) {
  return `${testId}:${part}`
}

export function readDictationProgress(
  user: string | null,
): Record<string, DictationPartProgress> {
  const raw = readValue<Record<string, DictationPartProgress>>(
    storageKey(user),
    {},
  )
  return raw && typeof raw === 'object' ? raw : {}
}

export function writeDictationProgress(
  user: string | null,
  data: Record<string, DictationPartProgress>,
) {
  saveValue(storageKey(user), data)
}

export function getDictationPartProgress(
  user: string | null,
  testId: string,
  part: string,
): DictationPartProgress {
  const all = readDictationProgress(user)
  return (
    all[dictationPartKey(testId, part)] ?? {
      cursor: 0,
      sentences: {},
      updatedAt: 0,
    }
  )
}

export function saveDictationPartProgress(
  user: string | null,
  testId: string,
  part: string,
  progress: DictationPartProgress,
) {
  const all = readDictationProgress(user)
  all[dictationPartKey(testId, part)] = {
    ...progress,
    updatedAt: Date.now(),
  }
  writeDictationProgress(user, all)
}

export function summarizeDictationPart(progress: DictationPartProgress): {
  attempted: number
  perfect: number
  accuracy: number
} {
  const stats = Object.values(progress.sentences)
  const attempted = stats.reduce((n, s) => n + s.attempts, 0)
  const perfect = stats.reduce((n, s) => n + s.perfect, 0)
  const weighted = stats.reduce(
    (n, s) => n + s.lastAccuracy * s.attempts,
    0,
  )
  return {
    attempted,
    perfect,
    accuracy: attempted > 0 ? weighted / attempted : 0,
  }
}

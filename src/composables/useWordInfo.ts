/**
 * 单词例句 + 同义词：查内置预抓取数据（构建时由 scripts/fetch-examples.mjs 生成），
 * 运行时零联网、零等待。查不到时返回 null，调用方用本地例句降级。
 */

import { wordSentences } from '../pages/vocabulary/wordSentences'
import type { WordSentence } from '../pages/vocabulary/wordSentences'

export interface WordInfo {
  /** 例句实际所属的单词（可能是派生词） */
  word: string
  examples: string[]
  synonyms: string[]
}

/** 纯函数：从内置数据查词（data 参数便于单测注入） */
export function getWordInfo(
  rawWord: string,
  data: Record<string, WordSentence> = wordSentences,
): WordInfo | null {
  const key = rawWord.trim().toLowerCase()
  if (!key)
    return null
  const hit = data[key]
  if (!hit || (hit.ex.length === 0 && hit.syn.length === 0))
    return null
  return {
    word: hit.exFrom || key,
    examples: hit.ex.slice(0, 2),
    synonyms: hit.syn.slice(0, 8),
  }
}

/**
 * 按顺序尝试多个词（本词 → 派生词），返回第一个有例句的；
 * 都没有例句时返回第一个有同义词的；都没有则返回 null。
 */
export function getWordInfoWithFallback(
  words: string[],
  data: Record<string, WordSentence> = wordSentences,
): WordInfo | null {
  let fallback: WordInfo | null = null
  const seen = new Set<string>()
  for (const w of words) {
    const key = w.trim().toLowerCase()
    if (!key || seen.has(key))
      continue
    seen.add(key)
    const info = getWordInfo(key, data)
    if (info && info.examples.length > 0)
      return info
    if (info && !fallback)
      fallback = info
  }
  return fallback
}

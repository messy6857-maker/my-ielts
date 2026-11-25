import type { StudyCard } from './studyDeck'
import { normalizeSpelling } from './spellPractice'
import { accountKey, readValue, saveValue } from './storage'

// 拼写练习里标成“已掌握”的词：出题时跳过。
// 按单词记（同一个词在词汇表、听力 179、我的词表里都会跳过），按账号分开存。
// 注意：同步服务器只接受固定的几类学习记录，这一类还没加进去，
// 所以现在只存在本机；等服务器支持后再改成可同步的记录。
const BASE = 'spell_mastered_local_v1'

export function masteredStorageKey(user: string | null) {
  return accountKey(BASE, user)
}
export function masteredWordId(card: Pick<StudyCard, 'word'>) {
  return normalizeSpelling(card.word)
}
export function readMasteredWords(user: string | null): string[] {
  const value = readValue<unknown>(masteredStorageKey(user), [])
  return Array.isArray(value)
    ? [
        ...new Set(value.filter((v): v is string => typeof v === 'string' && !!v)),
      ]
    : []
}
export function addMasteredWord(user: string | null, card: Pick<StudyCard, 'word'>) {
  const id = masteredWordId(card)
  const list = readMasteredWords(user)
  if (!id || list.includes(id))
    return true
  return saveValue(masteredStorageKey(user), [...list, id])
}
export function removeMasteredWord(user: string | null, id: string) {
  const list = readMasteredWords(user)
  if (!list.includes(id))
    return true
  return saveValue(masteredStorageKey(user), list.filter(w => w !== id))
}
export function withoutMastered<T extends Pick<StudyCard, 'word'>>(cards: T[], mastered: readonly string[]): T[] {
  if (!mastered.length)
    return cards
  const skip = new Set(mastered)
  return cards.filter(c => !skip.has(masteredWordId(c)))
}

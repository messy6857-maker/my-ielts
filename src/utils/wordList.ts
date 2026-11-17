import type { StudyCard } from './studyDeck'
import { nsKey } from '../composables/useStudyData'
import { readValue, saveValue } from './storage'

// “我的词单”：单词地牢里自己勾选保存的词，练拼写和听写结果页也读写同一份（按账号）。
// 存的是词的 key：vocab:<id> / reading538:<id> / listening179:<id>。
const LIST_KEY = 'dungeon_wordlist_v1'

export function readWordList(): string[] {
  const saved = readValue<unknown>(nsKey(LIST_KEY), [])
  return Array.isArray(saved)
    ? saved.filter((k): k is string => typeof k === 'string')
    : []
}
/** 加进词单（已经在里面的不重复加），返回新加了几个 */
export function addToWordList(keys: string[]): number {
  const list = readWordList()
  const fresh = [
    ...new Set(keys),
  ].filter(k => !list.includes(k))
  if (fresh.length) {
    saveValue(nsKey(LIST_KEY), [
      ...list,
      ...fresh,
    ])
  }
  return fresh.length
}
/** 这张卡在词单里的 key（词汇表的 key 是 vocab:<id>） */
export function wordListKey(card: StudyCard): string {
  return card.deck === 'vocabulary'
    ? `vocab:${card.id}`
    : card.key
}

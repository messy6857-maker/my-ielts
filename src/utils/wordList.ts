import { nsKey } from '../composables/useStudyData'
import { readValue } from './storage'

// 旧的“我的词单”：以前单词地牢和听写往这里存词（存的是网站词库的 key：vocab:<id> / reading538:<id> /
// listening179:<id>）。现在只在搬成“我的词表”时读一次，不再写。
const LIST_KEY = 'dungeon_wordlist_v1'

export function readWordList(): string[] {
  const saved = readValue<unknown>(nsKey(LIST_KEY), [])
  return Array.isArray(saved)
    ? saved.filter((k): k is string => typeof k === 'string')
    : []
}

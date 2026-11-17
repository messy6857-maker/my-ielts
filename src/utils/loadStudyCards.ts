import type { DeckId, StudyCard } from './studyDeck'
import type { WordList } from './wordLists'
import { loadAllVocabulary, loadVocabularyChapter } from '../pages/vocabulary/loadVocabulary'
import { WORD_CHAPTER_INDEX } from '../pages/vocabulary/vocabularyMeta'
import { corpusCards, listeningCards, readingCards, vocabularyCards } from './studyDeck'
import { readWordList } from './wordList'
import { DUNGEON_LIST_ID, DUNGEON_LIST_NAME, dungeonListEntries, entryCard, readLists } from './wordLists'

const chapterOf = (id: string | number) => (WORD_CHAPTER_INDEX as Record<string, string>)[String(id)]
export type SiteDeckId = Exclude<DeckId, 'custom'>
export const SITE_DECK_IDS: SiteDeckId[] = [
  'vocabulary',
  'reading538',
  'listening179',
  'corpus',
]

/** 网站词库的全部卡片（四个词库） */
export async function loadSiteCards(): Promise<StudyCard[]> {
  return (await Promise.all(SITE_DECK_IDS.map(d => loadDeckCards(d)))).flat()
}
/** 全部“我的词表”（自己建的，加上单词地牢的“我的词单”——里面有词才出现） */
export async function loadWordLists(): Promise<WordList[]> {
  const lists = readLists()
  if (readWordList().length) {
    const words = dungeonListEntries(await loadSiteCards())
    if (words.length) {
      lists.push({
        id: DUNGEON_LIST_ID,
        name: DUNGEON_LIST_NAME,
        words,
        updatedAt: 0,
      })
    }
  }
  return lists
}
/**
 * 取一个词库的全部卡片；词汇表给了章节就只取那一章，不给就取全部章节。
 * 我的词表（custom）给了词表 id 就只取那个词表，不给就取全部词表（同一个词只出一张）。
 */
export async function loadDeckCards(deck: DeckId, part?: string): Promise<StudyCard[]> {
  if (deck === 'custom') {
    const lists = (await loadWordLists()).filter(l => !part || l.id === part)
    const seen = new Set<string>()
    return lists.flatMap(l => l.words.map(entryCard)).filter((c) => {
      if (seen.has(c.key))
        return false
      seen.add(c.key)
      return true
    })
  }
  if (deck === 'vocabulary') {
    return part
      ? vocabularyCards({ [part]: await loadVocabularyChapter(part) }, chapterOf)
      : vocabularyCards(await loadAllVocabulary(), chapterOf)
  }
  if (deck === 'reading538')
    return readingCards((await import('../pages/reading/reading538words')).default as any)
  if (deck === 'listening179')
    return listeningCards((await import('../pages/listening/listening179.json')).default as any)
  return corpusCards((await import('../pages/listening/spelling_convention')).default as any)
}

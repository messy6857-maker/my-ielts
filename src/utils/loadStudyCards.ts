import type { DeckId, StudyCard } from './studyDeck'
import { loadAllVocabulary, loadVocabularyChapter } from '../pages/vocabulary/loadVocabulary'
import { WORD_CHAPTER_INDEX } from '../pages/vocabulary/vocabularyMeta'
import { corpusCards, listeningCards, readingCards, vocabularyCards } from './studyDeck'

const chapterOf = (id: string | number) => (WORD_CHAPTER_INDEX as Record<string, string>)[String(id)]

/** 取一个词库的全部卡片；词汇表给了章节就只取那一章，不给就取全部章节 */
export async function loadDeckCards(deck: DeckId, chapter?: string): Promise<StudyCard[]> {
  if (deck === 'vocabulary') {
    return chapter
      ? vocabularyCards({ [chapter]: await loadVocabularyChapter(chapter) }, chapterOf)
      : vocabularyCards(await loadAllVocabulary(), chapterOf)
  }
  if (deck === 'reading538')
    return readingCards((await import('../pages/reading/reading538words')).default as any)
  if (deck === 'listening179')
    return listeningCards((await import('../pages/listening/listening179.json')).default as any)
  return corpusCards((await import('../pages/listening/spelling_convention')).default as any)
}

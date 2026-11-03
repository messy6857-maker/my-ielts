import {
  VOCABULARY_CHAPTER_IDS,
  VOCABULARY_CHAPTER_META,
} from './vocabularyMeta'

export interface VocabularyWord {
  id: number | string
  spellError?: boolean
  spellValue?: string
  showSource?: boolean
  word: string[]
  pos: string
  meaning: string
  example: string
  extra: string
}

export interface VocabularyChapter {
  label: string
  audio: string
  groupCount: number
  wordCount: number
  words: VocabularyWord[][]
}

const loaders = import.meta.glob('./chapters/*.json') as Record<
  string,
  () => Promise<{ default: VocabularyChapter }>
>

const cache = new Map<string, VocabularyChapter>()

function loaderKey(chapter: string) {
  return `./chapters/${chapter}.json`
}

export function listVocabularyChapters(): string[] {
  return [...VOCABULARY_CHAPTER_IDS]
}

export function getVocabularyChapterMeta(chapter: string) {
  return VOCABULARY_CHAPTER_META[chapter]
}

export function getCachedChapter(chapter: string): VocabularyChapter | undefined {
  return cache.get(chapter)
}

export async function loadVocabularyChapter(
  chapter: string,
): Promise<VocabularyChapter> {
  if (cache.has(chapter))
    return cache.get(chapter)!
  const loader = loaders[loaderKey(chapter)]
  if (!loader)
    throw new Error(`章节不存在：${chapter}`)
  const data = (await loader()).default
  cache.set(chapter, data)
  return data
}

export async function loadAllVocabulary(): Promise<
  Record<string, VocabularyChapter>
> {
  const result: Record<string, VocabularyChapter> = {}
  await Promise.all(
    listVocabularyChapters().map(async (id) => {
      result[id] = await loadVocabularyChapter(id)
    }),
  )
  return result
}

/** Empty chapter shells (no words) for select menus before payload loads. */
export function emptyVocabularyShell(): Record<string, VocabularyChapter> {
  const result: Record<string, VocabularyChapter> = {}
  for (const id of listVocabularyChapters()) {
    const meta = VOCABULARY_CHAPTER_META[id]
    result[id] = {
      label: meta?.label ?? id,
      audio: meta?.audio ?? '',
      groupCount: meta?.groupCount ?? 0,
      wordCount: meta?.wordCount ?? 0,
      words: cache.get(id)?.words ?? [],
    }
  }
  return result
}

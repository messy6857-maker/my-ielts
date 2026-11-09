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

export interface VocabularyMeaning {
  meaning: string
  pos: string
}

let meaningIndexPromise: Promise<Map<string, VocabularyMeaning>> | null = null

function buildMeaningIndex(
  all: Record<string, VocabularyChapter>,
): Map<string, VocabularyMeaning> {
  const map = new Map<string, VocabularyMeaning>()
  for (const chapter of Object.values(all)) {
    for (const group of chapter.words) {
      for (const w of group) {
        const entry = { meaning: w.meaning, pos: w.pos }
        // 词条 word 数组含多形（如英美拼写变体），全部入索引
        for (const form of w.word ?? []) {
          const key = String(form).toLowerCase().trim()
          if (key && !map.has(key))
            map.set(key, entry)
        }
      }
    }
  }
  return map
}

/** 轻量去词形还原：只做安全后缀剥离，候选词逐个查索引，命中才算数，误剥离无害。 */
export function deinflect(word: string): string[] {
  const out: string[] = []
  const push = (s: string) => {
    if (s && s.length > 1 && s !== word && !out.includes(s))
      out.push(s)
  }
  // 双写辅音还原：stopped -> stopp -> stop
  const undoubled = (stem: string) => {
    if (/([bcdfghjklmnpqrstvwxz])\1$/.test(stem))
      push(stem.slice(0, -1))
  }
  if (word.endsWith('ies') && word.length > 4)
    push(`${word.slice(0, -3)}y`)
  if (word.endsWith('es') && word.length > 3) {
    push(word.slice(0, -2))
    push(word.slice(0, -1))
  }
  if (word.endsWith('s') && word.length > 2 && !word.endsWith('ss'))
    push(word.slice(0, -1))
  if (word.endsWith('ied') && word.length > 4)
    push(`${word.slice(0, -3)}y`)
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2)
    push(stem)
    undoubled(stem)
    push(`${stem}e`)
  }
  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3)
    push(stem)
    undoubled(stem)
    push(`${stem}e`)
  }
  return out
}

/** 查词库释义：首次调用懒加载全部 22 章（约 612K）建索引并缓存；查不到返回 null。
 *  先精确匹配，再试去词形还原（复数/过去式/进行时等）。 */
export async function lookupVocabularyMeaning(
  word: string,
): Promise<VocabularyMeaning | null> {
  const key = word.toLowerCase().trim()
  if (!key)
    return null
  if (!meaningIndexPromise) {
    meaningIndexPromise = loadAllVocabulary()
      .then(buildMeaningIndex)
      .catch(() => new Map<string, VocabularyMeaning>())
  }
  const index = await meaningIndexPromise
  const exact = index.get(key)
  if (exact)
    return exact
  for (const base of deinflect(key)) {
    const hit = index.get(base)
    if (hit)
      return hit
  }
  return null
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

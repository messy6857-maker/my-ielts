import type { Ref } from 'vue'
import type { WordSentence } from '../pages/vocabulary/wordSentences'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { chapterLoaders, chapters } from '../data/vocabulary/manifest'
export { chapters }
export interface VocabularyWord {
  id: number; word: string[]; pos: string; meaning: string; example: string; extra: string
  spellError: boolean; spellValue: string; showSource: boolean
}
export interface VocabularyChapter {
  label: string; audio: string; groupCount: number; wordCount: number; words: VocabularyWord[][]
}
export interface ChapterInfo {
  sentences: Record<string, WordSentence>; meanings: Record<string, string>; positions: Record<string, string>
}
export async function loadVocabularyChapter(name: string): Promise<VocabularyChapter> {
  const loader = chapterLoaders[name as keyof typeof chapterLoaders]
  if (!loader) throw new Error('未知词库章节')
  const module = await loader.words()
  return structuredClone(module.default) as VocabularyChapter
}
export async function loadChapterInfo(name: string): Promise<ChapterInfo> {
  const loader = chapterLoaders[name as keyof typeof chapterLoaders]
  if (!loader) throw new Error('未知词库章节')
  return (await loader.info()).default
}
export function initialChapter(key: string): string {
  const saved = localStorage.getItem(key)
  return chapters.find(chapter => chapter === saved) ?? chapters[0]
}
export function useVocabularyChapter(selected: Ref<string>, withInfo = false) {
  const chapter = ref<VocabularyChapter | null>(null)
  const info = shallowRef<ChapterInfo>({ sentences: {}, meanings: {}, positions: {} })
  const loading = ref(true)
  const error = ref('')
  let seq = 0
  let disposed = false
  async function reload() {
    const request = ++seq
    chapter.value = null
    info.value = { sentences: {}, meanings: {}, positions: {} }
    loading.value = true
    error.value = ''
    try {
      const [words, resources] = await Promise.all([loadVocabularyChapter(selected.value), withInfo ? loadChapterInfo(selected.value) : null])
      if (request !== seq || disposed) return
      info.value = resources ?? info.value
      chapter.value = words
    }
    catch { if (request === seq && !disposed) error.value = '词库加载失败，请重试' }
    finally { if (request === seq && !disposed) loading.value = false }
  }
  watch(selected, reload, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { disposed = true; seq++ })
  return { chapter, info, loading, error, reload }
}

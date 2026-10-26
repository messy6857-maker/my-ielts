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
  const infoLoading = ref(false)
  const infoError = ref('')
  let seq = 0
  let infoSeq = 0
  let disposed = false
  async function reloadInfo() {
    if (!withInfo) return
    const request = ++infoSeq
    const chapterRequest = seq
    const name = selected.value
    infoLoading.value = true
    infoError.value = ''
    try {
      const resources = await loadChapterInfo(name)
      if (!disposed && request === infoSeq && chapterRequest === seq)
        info.value = resources
    }
    catch {
      if (!disposed && request === infoSeq && chapterRequest === seq)
        infoError.value = '例句与同义词资料加载失败，已使用本地词条'
    }
    finally {
      if (!disposed && request === infoSeq && chapterRequest === seq)
        infoLoading.value = false
    }
  }
  async function reload() {
    const request = ++seq
    infoSeq++
    chapter.value = null
    info.value = { sentences: {}, meanings: {}, positions: {} }
    loading.value = true
    error.value = ''
    infoError.value = ''
    infoLoading.value = false
    // Optional resources must not block the usable base chapter.
    if (withInfo) void reloadInfo()
    try {
      const words = await loadVocabularyChapter(selected.value)
      if (request === seq && !disposed)
        chapter.value = words
    }
    catch { if (request === seq && !disposed) error.value = '词库加载失败，请重试' }
    finally { if (request === seq && !disposed) loading.value = false }
  }
  watch(selected, reload, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { disposed = true; seq++; infoSeq++ })
  return { chapter, info, loading, error, reload, infoLoading, infoError, reloadInfo }
}

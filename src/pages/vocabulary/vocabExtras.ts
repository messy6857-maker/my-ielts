import { ref, shallowRef } from 'vue'
import type { MnemonicHint } from './mnemonics'

// 词汇表卡片的附加内容（巧记、音标、同义词词性和释义）：各自懒加载一次，失败可重试。
// 从原单词自测页抽出来，统一卡片里的词汇表卡片共用。

type MnemonicFn = (word: string, meaning?: string, example?: string) => MnemonicHint | null
export const mnemonicFn = shallowRef<MnemonicFn | null>(null)
let mnemonicPromise: Promise<MnemonicFn | null> | null = null
export function ensureMnemonic() {
  if (!mnemonicPromise) {
    mnemonicPromise = import('./mnemonics')
      .then((m) => {
        mnemonicFn.value = m.getMnemonic
        return mnemonicFn.value
      })
      .catch(() => {
        mnemonicPromise = null
        return null
      })
  }
  return mnemonicPromise
}

// 抓取表懒加载缓存：只 import 一次，失败则保持空态（不显示词性），下次需要时再试
export const synonymPosError = ref(false)
export const synonymPosLazy = shallowRef<Record<string, string> | null>(null)
let synonymPosPromise: Promise<Record<string, string> | null> | null = null
export function ensureSynonymPos() {
  if (!synonymPosPromise) {
    synonymPosError.value = false
    synonymPosPromise = import('./synonymPos')
      .then((m) => {
        synonymPosLazy.value = m.synonymPosData
        return m.synonymPosData
      })
      .catch(() => {
        synonymPosPromise = null
        synonymPosError.value = true
        return null
      })
  }
  return synonymPosPromise
}
// 本站词库全量词性索引（权威词性）
export const vocabularyPosLazy = shallowRef<Record<string, string> | null>(null)
let vocabularyPosPromise: Promise<Record<string, string> | null> | null = null
export function ensureVocabularyPos() {
  if (!vocabularyPosPromise) {
    vocabularyPosPromise = import('./vocabularyPos')
      .then((m) => {
        vocabularyPosLazy.value = m.vocabularyPosData
        return m.vocabularyPosData
      })
      .catch(() => {
        vocabularyPosPromise = null
        return null
      })
  }
  return vocabularyPosPromise
}
export const synonymMeaningsLazy = shallowRef<Record<string, string> | null>(null)
let synonymMeaningsPromise: Promise<Record<string, string> | null> | null = null
export function ensureSynonymMeanings() {
  if (!synonymMeaningsPromise) {
    synonymMeaningsPromise = import('./synonymMeanings')
      .then((m) => {
        synonymMeaningsLazy.value = m.synonymMeanings
        return m.synonymMeanings
      })
      .catch(() => {
        synonymMeaningsPromise = null
        return null
      })
  }
  return synonymMeaningsPromise
}
export const wordPhoneticsLazy = shallowRef<Record<string, string> | null>(null)
let wordPhoneticsPromise: Promise<Record<string, string> | null> | null = null
export function ensureWordPhonetics() {
  if (!wordPhoneticsPromise) {
    wordPhoneticsPromise = import('./wordPhonetics')
      .then((m) => {
        wordPhoneticsLazy.value = m.wordPhonetics
        return m.wordPhonetics
      })
      .catch(() => {
        wordPhoneticsPromise = null
        return null
      })
  }
  return wordPhoneticsPromise
}

/** 同义词词性：先查本站词库（权威），再查联网抓取的数据（只有首选词性，标注出来）；都查不到就不显示 */
export function synonymPos(syn: string): string {
  const key = syn.trim().toLowerCase()
  const local = vocabularyPosLazy.value?.[key]
  if (local)
    return local
  const fallback = synonymPosLazy.value?.[key]
  return fallback
    ? `${fallback}（首选）`
    : ''
}
export function synonymMeaning(syn: string): string {
  return synonymMeaningsLazy.value?.[syn.trim().toLowerCase()] || ''
}
/** 单词音标：查不到的留空（不编造） */
export function phonetic(word: string): string {
  return wordPhoneticsLazy.value?.[word.toLowerCase().trim()] || ''
}

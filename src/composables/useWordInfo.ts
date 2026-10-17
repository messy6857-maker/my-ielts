/**
 * 联网获取单词的例句与同义词（Free Dictionary API，免 key）。
 * - 结果按单词缓存：内存 + localStorage（成功才落盘，最多 400 条）
 * - 8 秒超时；离线 / 失败 / 无词条时返回 null，调用方用本地例句降级
 */

export interface WordInfo {
  /** 例句实际所属的单词（可能是派生词） */
  word: string
  examples: string[]
  synonyms: string[]
}

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const LS_KEY = 'myielts_dict_info_v1'
const LS_CAP = 400
const TIMEOUT_MS = 8000

const memCache = new Map<string, WordInfo | null>()

function normalizable(word: string): boolean {
  const w = word.trim()
  return w.length > 0 && w.length <= 30 && /^[a-zA-Z][a-zA-Z' \-]*$/.test(w)
}

function pushUnique(arr: string[], v: unknown) {
  const s = String(v ?? '').trim()
  if (s && !arr.some(x => x.toLowerCase() === s.toLowerCase()))
    arr.push(s)
}

/** 纯函数：从 API 返回的 JSON 里抽例句和同义词，便于单测 */
export function extractWordInfo(word: string, json: any): WordInfo | null {
  try {
    const entry = Array.isArray(json) ? json[0] : json
    const meanings = entry?.meanings
    if (!Array.isArray(meanings) || meanings.length === 0)
      return null
    const token = word.trim().toLowerCase().split(' ')[0]
    const examples: string[] = []
    const synonyms: string[] = []
    for (const m of meanings) {
      for (const s of m?.synonyms ?? [])
        pushUnique(synonyms, s)
      for (const d of m?.definitions ?? []) {
        const ex = String(d?.example ?? '').trim()
        if (ex) {
          // 包含该词的句子优先（用户要的是“用到这个词的句子”）
          if (ex.toLowerCase().includes(token))
            examples.unshift(ex)
          else
            examples.push(ex)
        }
        for (const s of d?.synonyms ?? [])
          pushUnique(synonyms, s)
      }
    }
    const examplesClean = [...new Set(examples)].slice(0, 3)
    const synonymsClean = [...new Set(synonyms)].slice(0, 8)
    if (examplesClean.length === 0 && synonymsClean.length === 0)
      return null
    return { word, examples: examplesClean, synonyms: synonymsClean }
  }
  catch {
    return null
  }
}

function readLS(): Record<string, { info: WordInfo, ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  }
  catch {
    return {}
  }
}

function writeLS(all: Record<string, { info: WordInfo, ts: number }>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  }
  catch {
    // 配额不足时忽略
  }
}

export async function fetchWordInfo(rawWord: string): Promise<WordInfo | null> {
  const word = rawWord.trim().toLowerCase()
  if (!normalizable(word))
    return null
  if (memCache.has(word))
    return memCache.get(word) ?? null
  const cached = readLS()[word]
  if (cached) {
    memCache.set(word, cached.info)
    return cached.info
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    memCache.set(word, null)
    return null
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${API_BASE}/${encodeURIComponent(word)}`, { signal: ctrl.signal })
    if (!resp.ok) {
      memCache.set(word, null)
      return null
    }
    const info = extractWordInfo(word, await resp.json())
    memCache.set(word, info)
    if (info) {
      const all = readLS()
      all[word] = { info, ts: Date.now() }
      const keys = Object.keys(all).sort((a, b) => all[a].ts - all[b].ts)
      while (keys.length > LS_CAP)
        delete all[keys.shift()!]
      writeLS(all)
    }
    return info
  }
  catch {
    memCache.set(word, null)
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

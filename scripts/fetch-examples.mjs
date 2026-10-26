/**
 * 预抓取单词例句 + 同义词，打包进网站（避免运行时联网）。
 *
 * 数据源：
 * - 例句：Wiktionary REST API（https://en.wiktionary.org/api/rest_v1/page/definition/{word}）
 * - 同义词：Datamuse API（https://api.datamuse.com/words?rel_syn={word}）
 *
 * 用法：node scripts/fetch-examples.mjs
 * 输出：src/pages/vocabulary/wordSentences.ts
 * 支持断点续抓：进度保存在 scripts/.fetch-progress.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROGRESS_FILE = join(ROOT, 'scripts', '.fetch-progress.json')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordSentences.ts')
const UA = 'my-ielts-study-site/1.0 (vocabulary example fetcher; contact: study-site)'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// ---- 读词表 ----
function loadWords() {
  const src = readFileSync(join(ROOT, 'src', 'pages', 'vocabulary', 'vocabulary.js'), 'utf8')
  const m = src.match(/const vocabulary = (\{.*\})\n\nexport default/s)
  const data = JSON.parse(m[1])
  const seen = new Map() // word -> { word, extras }
  for (const cat of Object.values(data)) {
    for (const group of cat.words) {
      for (const w of group) {
        const word = (w.word[0] || '').trim().toLowerCase()
        if (!word || seen.has(word))
          continue
        seen.set(word, { word, extra: w.extra || '' })
      }
    }
  }
  return [...seen.values()]
}

// ---- 解析拓展字段里的派生词（extraParser.ts 的简化移植） ----
const POS = '(?:adj|adv|n|vi|vt|v|prep|conj|pron|num|art|interj)'
const ENTRY_RE = new RegExp(
  `^([A-Za-z][A-Za-z'.\\-/() ]*?)(?:\\s+(${POS})\\.?)?\\s*([\u4e00-\u9fa5\uff00-\uffef\u3000-\u303f].*)$`,
)
function parseExtraWords(extra) {
  if (!extra || extra.trim() === '' || extra.trim() === '-')
    return []
  const out = []
  for (const seg of extra.split('。')) {
    for (const piece of seg.split('；')) {
      const p = piece.trim().replace(/\/[\u4e00-\u9fa5]+/g, '')
      const m = p.match(ENTRY_RE)
      if (m && m[1].trim())
        out.push(m[1].trim().toLowerCase())
    }
  }
  return [...new Set(out)].slice(0, 3)
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } })
    if (!resp.ok)
      return null
    return await resp.json()
  }
  catch {
    return null
  }
  finally {
    clearTimeout(t)
  }
}

/** 从 wiktionary 抓例句（至多 2 条，必须包含该词） */
async function fetchExamples(word) {
  const data = await fetchJson(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
  )
  if (!data || !data.en)
    return []
  const out = []
  const token = word.toLowerCase()
  for (const pos of data.en) {
    for (const df of pos.definitions || []) {
      for (const ex of df.examples || []) {
        const text = stripHtml(String(ex))
        if (
          text.length >= 12 && text.length <= 220
          && text.toLowerCase().includes(token)
          && !out.some(e => e.toLowerCase() === text.toLowerCase())
        ) {
          out.push(text)
          if (out.length >= 2)
            return out
        }
      }
    }
  }
  return out
}

async function fetchSynonyms(word) {
  const data = await fetchJson(
    `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=8`,
  )
  if (!Array.isArray(data))
    return []
  return data.map(d => d.word).filter(w => /^[a-z][a-z' -]*$/i.test(w)).slice(0, 8)
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
    }
    catch { /* 忽略 */ }
  }
  return {}
}

async function main() {
  const words = loadWords()
  console.log(`total unique words: ${words.length}`)
  const progress = loadProgress()
  const pending = words.filter(w => !progress[w.word])
  console.log(`already done: ${words.length - pending.length}, remaining: ${pending.length}`)

  const CONCURRENCY = 3
  let n = words.length - pending.length

  async function processOne({ word, extra }) {
    // 例句和同义词并行抓
    const [examples0, synonyms] = await Promise.all([fetchExamples(word), fetchSynonyms(word)])
    let examples = examples0
    let exFrom = ''
    // 本词例句不足时，试派生词
    if (examples.length === 0) {
      for (const dw of parseExtraWords(extra)) {
        if (dw === word)
          continue
        const dex = await fetchExamples(dw)
        await sleep(300)
        if (dex.length > 0) {
          examples = dex
          exFrom = dw
          break
        }
      }
    }
    return { word, data: { ex: examples, exFrom, syn: synonyms } }
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(processOne))
    for (const { word, data } of results) {
      progress[word] = data
      n++
    }
    if (n % 50 < CONCURRENCY) {
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
      console.log(`  ${n}/${words.length} ...`)
    }
    await sleep(300)
  }
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log('fetch done, writing TS file...')

  // 只保留有内容的词
  const entries = Object.entries(progress).filter(([, v]) => v.ex.length > 0 || v.syn.length > 0)
  console.log(`words with data: ${entries.length}/${words.length}`)

  const lines = [
    '/**',
    ' * 预抓取的单词例句 + 同义词（构建时生成，运行时零联网）。',
    ` * 生成脚本：scripts/fetch-examples.mjs，共 ${entries.length} 词。`,
    ' */',
    '',
    'export interface WordSentence {',
    '  /** 例句（至多 2 条） */',
    '  ex: string[]',
    '  /** 例句实际所属的词（派生词）；为空表示就是本词 */',
    '  exFrom: string',
    '  /** 同义词（至多 8 个） */',
    '  syn: string[]',
    '}',
    '',
    'export const wordSentences: Record<string, WordSentence> = {',
  ]
  for (const [word, v] of entries) {
    lines.push(
      `  ${JSON.stringify(word)}: { ex: ${JSON.stringify(v.ex)}, exFrom: ${JSON.stringify(v.exFrom)}, syn: ${JSON.stringify(v.syn)} },`,
    )
  }
  lines.push('}', '')
  writeFileSync(OUT_FILE, lines.join('\n'))
  console.log(`wrote ${OUT_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

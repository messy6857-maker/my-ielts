/**
 * 多源补抓例句（雅思难度：不太简、不太难）。
 * 优先级：Cambridge Dictionary（学习者例句，难度最对口）
 *       → dictionaryapi.dev（经 curl --resolve 绕 DNS 屏蔽）
 *       → Wiktionary（重试 transient 失败）
 * 只处理 progress 里 ex 为空的词；已有例句的不动。
 * 用法：node scripts/fetch-cambridge.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync as exec } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROGRESS_FILE = join(ROOT, 'scripts', '.fetch-progress.json')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordSentences.ts')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const hasWord = (text, word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
/** 雅思难度过滤：40–180 字符，含本词，去重 */
function pickExamples(cands, word, limit = 2) {
  const out = []
  for (const c of cands) {
    const t = stripHtml(String(c))
    if (t.length >= 40 && t.length <= 180 && hasWord(t, word)
      && !out.some(e => e.toLowerCase() === t.toLowerCase()))
      out.push(t)
    if (out.length >= limit)
      break
  }
  return out
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } })
    if (!resp.ok)
      return null
    return await resp.text()
  }
  catch {
    return null
  }
  finally {
    clearTimeout(t)
  }
}

/** Cambridge Dictionary 例句 */
async function cambridgeExamples(word) {
  const html = await fetchText(
    `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`,
  )
  if (!html)
    return []
  const egs = [...html.matchAll(/<span class="eg deg">(.*?)<\/span>/gs)].map(m => m[1])
  return pickExamples(egs, word)
}

/** dictionaryapi.dev（走 curl --resolve 绕过出口 DNS 屏蔽） */
function dictApiExamples(word) {
  try {
    const out = exec(
      'curl',
      ['-s', '--max-time', '10', '--resolve', 'api.dictionaryapi.dev:443:172.67.153.59',
        '-A', 'my-ielts-study-site/1.0',
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    )
    const data = JSON.parse(out)
    const cands = []
    for (const e of data) {
      for (const m of e.meanings || []) {
        for (const df of m.definitions || []) {
          if (df.example)
            cands.push(df.example)
        }
      }
    }
    return pickExamples(cands, word)
  }
  catch {
    return []
  }
}

/** Wiktionary */
async function wiktionaryExamples(word) {
  const data = await (async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    try {
      const resp = await fetch(
        `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'my-ielts-study-site/1.0' } },
      )
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
  })()
  if (!data || !data.en)
    return []
  const cands = []
  for (const pos of data.en) {
    for (const df of pos.definitions || []) {
      for (const ex of df.examples || [])
        cands.push(ex)
    }
  }
  return pickExamples(cands, word)
}

function loadWords() {
  const src = readFileSync(join(ROOT, 'src', 'pages', 'vocabulary', 'vocabulary.js'), 'utf8')
  const m = src.match(/const vocabulary = (\{.*\})\n\nexport default/s)
  const data = JSON.parse(m[1])
  const seen = new Map()
  for (const cat of Object.values(data)) {
    for (const group of cat.words) {
      for (const w of group) {
        const word = (w.word[0] || '').trim().toLowerCase()
        if (!word || seen.has(word))
          continue
        seen.set(word, word)
      }
    }
  }
  return [...seen.keys()]
}

async function main() {
  const words = loadWords()
  const progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  const targets = words.filter(w => progress[w] && progress[w].ex.length === 0)
  console.log(`targets (no examples): ${targets.length}`)

  let fixed = 0, cambridgeHits = 0, n = 0
  for (const word of targets) {
    n++
    let ex = await cambridgeExamples(word)
    if (ex.length > 0)
      cambridgeHits++
    if (ex.length === 0)
      ex = dictApiExamples(word)
    if (ex.length === 0)
      ex = await wiktionaryExamples(word)
    if (ex.length > 0) {
      progress[word] = { ...progress[word], ex, exFrom: '' }
      fixed++
    }
    if (n % 25 === 0) {
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
      console.log(`  ${n}/${targets.length}, fixed ${fixed} (cambridge ${cambridgeHits})`)
    }
    await sleep(1500) // 对剑桥客气一点
  }
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log(`done: fixed ${fixed}/${targets.length}`)

  const entries = Object.entries(progress).filter(([, v]) => v.ex.length > 0 || v.syn.length > 0)
  const lines = [
    '/**',
    ' * 预抓取的单词例句 + 同义词（构建时生成，运行时零联网）。',
    ` * 生成脚本：scripts/fetch-examples.mjs + scripts/fetch-cambridge.mjs，共 ${entries.length} 词。`,
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
  console.log(`wrote ${OUT_FILE}, words with data: ${entries.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

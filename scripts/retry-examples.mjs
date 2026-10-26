/**
 * 重试没有例句的词（排除 transient 失败）。
 * 用法：node scripts/retry-examples.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseExtra } from '../src/pages/vocabulary/extraParser.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROGRESS_FILE = join(ROOT, 'scripts', '.fetch-progress.json')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordSentences.ts')
const UA = 'my-ielts-study-site/1.0 (vocabulary example fetcher; retry pass)'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

function parseExtraWords(extra) {
  return [...new Set(parseExtra(extra).map(entry => entry.word.toLowerCase()))].slice(0, 3)
}

async function fetchJson(url, timeoutMs = 15000) {
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
        seen.set(word, { word, extra: w.extra || '' })
      }
    }
  }
  return seen
}

async function main() {
  const words = loadWords()
  const progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  const targets = [...words.values()].filter(w => {
    const p = progress[w.word]
    return p && p.ex.length === 0
  })
  console.log(`retry targets (no examples): ${targets.length}`)

  let fixed = 0
  let n = 0
  for (const { word, extra } of targets) {
    n++
    let examples = await fetchExamples(word)
    let exFrom = ''
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
    if (examples.length > 0) {
      progress[word] = { ...progress[word], ex: examples, exFrom }
      fixed++
    }
    if (n % 50 === 0) {
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
      console.log(`  ${n}/${targets.length}, fixed ${fixed}`)
    }
    await sleep(600)
  }
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log(`retry done: fixed ${fixed}/${targets.length}`)

  const entries = Object.entries(progress).filter(([, v]) => v.ex.length > 0 || v.syn.length > 0)
  console.log(`words with data: ${entries.length}`)
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

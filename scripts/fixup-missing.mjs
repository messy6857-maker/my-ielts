/**
 * 补救完全没数据的词：
 * - 英式拼写（-ise → -ize，美式页面例句按 -ize 匹配）
 * - 短语（空格 → 连字符，如 el-nino）
 * - 其余：Cambridge 重试一次（排除 transient 失败）
 * 用法：node scripts/fixup-missing.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROGRESS_FILE = join(ROOT, 'scripts', '.fetch-progress.json')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordSentences.ts')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasAny = (t, words) => words.some(w => new RegExp(`\\b${esc(w)}\\b`, 'i').test(t))

function pick(cands, matchWords, limit = 2) {
  const out = []
  for (const c of cands) {
    const t = stripHtml(String(c))
    if (t.length >= 40 && t.length <= 180 && hasAny(t, matchWords)
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

async function cambridge(word, matchWords) {
  const html = await fetchText(
    `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`,
  )
  if (!html)
    return []
  const egs = [...html.matchAll(/<span class="eg deg">(.*?)<\/span>/gs)].map(m => m[1])
  return pick(egs, matchWords)
}

/** 生成候选变体：[查询词, 匹配词列表] */
function variants(word) {
  const out = [[word, [word]]]
  if (word.endsWith('ise') && !word.endsWith('tise')) {
    const us = `${word.slice(0, -3)}ize`
    out.push([us, [us, word]])
  }
  else if (word.endsWith('tise')) {
    // tortoise 不是拼写变体，跳过
  }
  if (word.includes(' ')) {
    const hyph = word.replace(/\s+/g, '-')
    out.push([hyph, [word, hyph, word.replace(/\s+/g, '')]])
  }
  return out
}

async function main() {
  const progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  const targets = Object.entries(progress)
    .filter(([, v]) => v.ex.length === 0 && v.syn.length === 0)
    .map(([w]) => w)
  console.log(`targets: ${targets.length}`)

  let fixed = 0
  let n = 0
  for (const word of targets) {
    n++
    let ex = []
    for (const [q, matchWords] of variants(word)) {
      ex = await cambridge(q, matchWords)
      if (ex.length > 0)
        break
      await sleep(800)
    }
    if (ex.length > 0) {
      progress[word] = { ...progress[word], ex, exFrom: '' }
      fixed++
      console.log(`  + ${word}: ${ex[0].slice(0, 70)}`)
    }
    if (n % 20 === 0)
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
    await sleep(1200)
  }
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log(`done: fixed ${fixed}/${targets.length}`)

  const entries = Object.entries(progress).filter(([, v]) => v.ex.length > 0 || v.syn.length > 0)
  const lines = [
    '/**',
    ' * 预抓取的单词例句 + 同义词（构建时生成，运行时零联网）。',
    ` * 生成脚本：scripts/fetch-examples.mjs + scripts/fetch-cambridge.mjs + scripts/fixup-missing.mjs，共 ${entries.length} 词。`,
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
  console.log(`wrote ${OUT_FILE}, words with data: ${entries.length}/${Object.keys(progress).length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * 用本地的 TypeWords 词库 tsv（列：word / phonetic_uk / phonetic_us / trans / note）
 * 重建网站内置的音标表，只取音标（英音），不取释义、例句等其他内容。
 *
 * 用法：node scripts/phonetics-from-typewords.mjs <typewords 目录（里面有 tsv/）>
 * 输出：src/pages/vocabulary/wordPhonetics.ts
 *
 * 收录本站各词库里的词：词汇表（含所有写法）、阅读考点词、听力 179、听力语料库。
 * 查词顺序：雅思词库优先，再查其他词库；都查不到时保留原表里的音标（dictionaryapi.dev 抓的）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordPhonetics.ts')
const source = process.argv[2]
if (!source) {
  console.error('用法：node scripts/phonetics-from-typewords.mjs <typewords 目录>')
  process.exit(1)
}

// 雅思相关词库在前（同一个词以先查到的为准）
const PREFERRED = [
  'IELTSVocabularyBible',
  'ielts',
  'ielts_disorder',
  'IELTS-807',
  'IELTSKingLu807',
  'IELTSXDF7000',
  'DuckCircle_IELTS',
  'IELTS_tinglichangjing',
  'ielts-real-high',
]

const key = w => w.trim().toLowerCase().replace(/\s+/g, ' ')

/** 词库里的音标：去掉多余斜杠和空白，统一包成 /…/；带中文或明显不是音标的丢掉 */
function cleanPhonetic(raw) {
  // 多种读法（名词/动词重音不同等）用分号分开，统一成“; ”
  const p = (raw || '').trim().replace(/^[/[]+|[/\]]+$/g, '').replace(/\s*;\s*/g, '; ').trim()
  if (!p || /[一-鿿]/.test(p) || p.length > 60)
    return ''
  return `/${p}/`
}

function readTypeWords(dir) {
  const tsvDir = join(dir, 'tsv')
  const files = readdirSync(tsvDir).filter(f => f.endsWith('.tsv')).map(f => f.slice(0, -4))
  const order = [
    ...PREFERRED.filter(f => files.includes(f)),
    ...files.filter(f => !PREFERRED.includes(f)).sort(),
  ]
  const map = new Map()
  for (const name of order) {
    const lines = readFileSync(join(tsvDir, `${name}.tsv`), 'utf8').split(/\r?\n/)
    for (const line of lines.slice(1)) {
      const [word, uk, us] = line.split('\t')
      if (!word)
        continue
      const k = key(word)
      if (map.has(k))
        continue
      const p = cleanPhonetic(uk) || cleanPhonetic(us)
      if (p)
        map.set(k, p)
    }
  }
  return map
}

async function siteWords() {
  const words = new Set()
  const add = (w) => {
    if (typeof w === 'string' && w.trim())
      words.add(key(w.replace(/\*/g, '')))
  }
  const chapters = join(ROOT, 'src', 'pages', 'vocabulary', 'chapters')
  for (const f of readdirSync(chapters).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(chapters, f), 'utf8'))
    for (const group of data.words) {
      for (const w of group)
        w.word.forEach(add)
    }
  }
  const load = async p => (await import(pathToFileURL(join(ROOT, p)).href)).default
  for (const cat of await load('src/pages/reading/reading538words.js')) {
    for (const w of cat.words)
      add(w[1])
  }
  for (const w of JSON.parse(readFileSync(join(ROOT, 'src/pages/listening/listening179.json'), 'utf8')))
    add(w.word)
  for (const chapter of Object.values(await load('src/pages/listening/spelling_convention.js'))) {
    for (const row of chapter.rows ?? []) {
      // 语料库每格可能有多个写法：逗号、斜杠分开
      for (const cell of row.slice(0, 2)) {
        if (typeof cell === 'string')
          cell.split(/[,/]/).forEach(add)
      }
    }
  }
  return words
}

function readExisting() {
  const src = readFileSync(OUT_FILE, 'utf8')
  const out = new Map()
  for (const m of src.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm))
    out.set(JSON.parse(m[1]), JSON.parse(m[2]))
  return out
}

const typeWords = readTypeWords(source)
const existing = readExisting()
const words = await siteWords()
const result = new Map()
let fromTypeWords = 0
let kept = 0
for (const w of [...words].sort()) {
  const p = typeWords.get(w)
  if (p) {
    result.set(w, p)
    fromTypeWords++
  }
  else if (existing.has(w)) {
    result.set(w, existing.get(w))
    kept++
  }
}
// 原表里有、但本站词库里已经没有的词也留着（每日阅读的词汇注释会查到）
for (const [w, p] of existing) {
  if (!result.has(w)) {
    result.set(w, typeWords.get(w) ?? p)
    kept++
  }
}
const body = [...result].map(([w, p]) => `  ${JSON.stringify(w)}: ${JSON.stringify(p)},`).join('\n')
writeFileSync(OUT_FILE, `// 自动生成：node scripts/phonetics-from-typewords.mjs（${result.size} 词有音标，英音）\n`
+ `// 音标来自 TypeWords 词库（只取音标），查不到的保留 dictionaryapi.dev 抓的；没有音标的词留空\n`
+ `export const wordPhonetics: Record<string, string> = {\n${body}\n}\n`)
const missing = [...words].filter(w => !result.has(w))
console.log(`本站词 ${words.size}，有音标 ${result.size}（TypeWords ${fromTypeWords}，保留原有 ${kept}），缺 ${missing.length}`)
console.log('缺的前 30 个：', missing.slice(0, 30).join(', '))

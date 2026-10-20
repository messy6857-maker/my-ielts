/**
 * 预抓取词库音标，打包进网站（每日阅读词汇注释显示发音用）。
 * 数据源：dictionaryapi.dev（https://api.dictionaryapi.dev/api/v2/entries/en/{word}）
 * 沙盒 DNS 被黑洞，用 curl --resolve 直连 172.67.153.59。
 * 用法：node scripts/fetch-phonetics.mjs
 * 输出：src/pages/vocabulary/wordPhonetics.ts
 * 支持断点续抓：进度保存在 scripts/.fetch-phonetics-progress.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROGRESS_FILE = join(ROOT, 'scripts', '.fetch-phonetics-progress.json')
const OUT_FILE = join(ROOT, 'src', 'pages', 'vocabulary', 'wordPhonetics.ts')

const sleep = ms => new Promise(r => setTimeout(r, ms))

function loadWords() {
  const src = readFileSync(join(ROOT, 'src', 'pages', 'vocabulary', 'vocabulary.js'), 'utf8')
  const m = src.match(/const vocabulary = (\{.*\})\n\nexport default/s)
  const data = JSON.parse(m[1])
  const seen = new Set()
  for (const cat of Object.values(data)) {
    for (const group of cat.words) {
      for (const w of group) {
        const word = (w.word[0] || '').trim().toLowerCase()
        if (word && !seen.has(word))
          seen.add(word)
      }
    }
  }
  return [...seen]
}

async function fetchPhonetic(word) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '-s', '--max-time', '15',
        '--resolve', 'api.dictionaryapi.dev:443:172.67.153.59',
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      ])
      const d = JSON.parse(stdout)
      if (!Array.isArray(d) || !d[0])
        return null
      const e = d[0]
      if (e.phonetic)
        return e.phonetic
      const ph = (e.phonetics || []).map(p => p.text).find(Boolean)
      return ph || null
    }
    catch {
      await sleep(800)
    }
  }
  return null
}

async function main() {
  const words = loadWords()
  console.log('共', words.length, '词')
  let done = {}
  if (existsSync(PROGRESS_FILE))
    done = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  const pending = words.filter(w => !(w in done))
  console.log('待抓', pending.length)
  const CONCURRENCY = 8
  let fetched = Object.keys(done).length
  let idx = 0
  async function worker() {
    while (idx < pending.length) {
      const w = pending[idx++]
      const ph = await fetchPhonetic(w)
      done[w] = ph // null 表示抓不到
      fetched++
      if (fetched % 200 === 0) {
        writeFileSync(PROGRESS_FILE, JSON.stringify(done))
        const hit = Object.values(done).filter(Boolean).length
        console.log(`${fetched}/${words.length} 有音标 ${hit}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  writeFileSync(PROGRESS_FILE, JSON.stringify(done))
  const entries = Object.entries(done).filter(([, v]) => v)
  const body = entries.map(([w, p]) => `  ${JSON.stringify(w)}: ${JSON.stringify(p)},`).join('\n')
  writeFileSync(OUT_FILE,
    `// 自动生成：node scripts/fetch-phonetics.mjs（${entries.length} 词有音标）\n` +
    `// 每日阅读词汇注释显示发音用；查不到的词走浏览器 speechSynthesis 朗读\n` +
    `export const wordPhonetics: Record<string, string> = {\n${body}\n}\n`)
  console.log('完成，有音标', entries.length, '/', words.length)
}

main()

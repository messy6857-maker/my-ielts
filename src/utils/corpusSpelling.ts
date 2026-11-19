// 听力语料库的词（卡片和练拼写共用），以及拼错时标出错字母（所有拼写练法共用）

export type CorpusChapter = 'ch2' | 'ch3' | 'ch4'
export interface CorpusWord {
  /** 和语料库自测卡片的 id 一致（错题记录共用 corpus:<id>） */
  id: string
  chapter: CorpusChapter
  /** 主拼写（播放发音、展示答案用） */
  word: string
  /** 所有算对的拼写：拼写规范一章英式、美式都算对 */
  accepted: string[]
  meaning: string
  pos: string
  /** 拼写要点：特别名词的“注意”（如“双 c 双 m”），拼写规范的英美写法 */
  note: string
}

interface Section { rows: unknown[][] }
type RawCorpus = Record<string, Section | undefined>

function cell(value: unknown): string {
  const v = Array.isArray(value)
    ? value[0]
    : value
  return typeof v === 'string'
    ? v.trim()
    : ''
}
function spellings(value: unknown): string[] {
  return cell(value).split(',').map(s => s.trim()).filter(Boolean)
}
function unique(list: string[]): string[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    const key = s.toLowerCase()
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

/** 从语料库数据（spelling_convention.js）取出三章的词；id 规则和自测卡片一致 */
export function buildCorpusWords(data: RawCorpus): CorpusWord[] {
  const out: CorpusWord[] = []
  data['Chapter2 拼写规范']?.rows.forEach((r, i) => {
    const british = spellings(r[0])
    const american = spellings(r[1])
    const meaning = cell(r[2])
    if (!british.length || !meaning)
      return
    out.push({
      id: `ch2-${i}`,
      chapter: 'ch2',
      word: british[0],
      accepted: unique([
        ...british,
        ...american,
      ]),
      meaning,
      pos: '',
      note: american.length
        ? `英式 ${british.join(' / ')}，美式 ${american.join(' / ')}`
        : '',
    })
  })
  data['Chapter3 特别名词']?.rows.forEach((r, i) => {
    const words = spellings(r[0])
    const meaning = cell(r[2])
    if (!words.length || !meaning)
      return
    out.push({
      id: `ch3-${i}`,
      chapter: 'ch3',
      word: words[0],
      accepted: unique(words),
      meaning,
      pos: '',
      note: cell(r[1]),
    })
  })
  data['Chapter4 形容词副词']?.rows.forEach((r) => {
    const words = spellings(r[0])
    const meaning = cell(r[2])
    if (!words.length || !meaning)
      return
    // 自测卡片用整格内容作 id（ch4-<词>）
    out.push({
      id: `ch4-${cell(r[0])}`,
      chapter: 'ch4',
      word: words[0],
      accepted: unique(words),
      meaning,
      pos: cell(r[1]),
      note: '',
    })
  })
  return out
}

export interface DiffChar { char: string, ok: boolean }
/**
 * 标出正确拼写里哪些字母没写对：和输入做最长公共子序列（不分大小写），
 * 不在公共子序列里的字母就是漏写或写错的。
 */
export function markMissed(input: string, answer: string): DiffChar[] {
  const a = input.toLowerCase()
  const b = answer.toLowerCase()
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array.from<number>({ length: b.length + 1 }).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ok = Array.from<boolean>({ length: b.length }).fill(false)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ok[j] = true
      i++
      j++
    }
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    }
    else {
      j++
    }
  }
  return [...answer].map((char, k) => ({ char, ok: ok[k] }))
}

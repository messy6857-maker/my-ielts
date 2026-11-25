// 文章逐句跟打/默写：分句、逐字比对（不碰存储和界面，便于测试）。
//
// 比对规则：
// - 不分大小写；带重音的字母按普通字母算（Türkiye 打 turkiye 也对）；弯引号、长破折号按普通符号算。
// - 默认不用打标点：标点自动跳过；连字符、斜杠、破折号当成空格（well-known 打 well known 或 well-known 都对）。
// - 打开“标点也要打”后，标点要和原文一致。
// - 连续空格算一个。

// 句点后面跟这些缩写时不断句
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Fig|approx|Inc|Ltd|Co|Corp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.$/i
// 单个大写字母加句点（U.S.、J. K. Rowling）也不断句
const INITIAL = /(?:^|[\s.])[A-Z]\.$/

/** 把文章分成句子：先按空行分段，再在句末标点（后面跟空格和大写字母/数字/引号）处断句。 */
export function splitSentences(passage: string): string[] {
  const out: string[] = []
  for (const paragraph of passage.split(/\n\s*\n/)) {
    const text = paragraph.replace(/\s+/g, ' ').trim()
    if (!text)
      continue
    const boundary = /[.!?]+["'”’)\]]*\s+(?=["'“‘([]?[A-Z0-9])/g
    let start = 0
    for (let m = boundary.exec(text); m; m = boundary.exec(text)) {
      const end = m.index + m[0].trimEnd().length
      const candidate = text.slice(start, end)
      if (ABBREVIATION.test(candidate) || INITIAL.test(candidate))
        continue
      out.push(candidate.trim())
      start = m.index + m[0].length
    }
    const tail = text.slice(start).trim()
    if (tail)
      out.push(tail)
  }
  return out
}

function fold(char: string): string {
  return char
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[‘’ʼ′`]/g, '\'')
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
}

/** 一个字符在比对时要求打成什么；null 表示自动跳过（标点、多余空格）。 */
function required(char: string, strict: boolean): string | null {
  if (/\s/.test(char))
    return ' '
  const f = fold(char)
  if (f.length !== 1)
    return null
  if (strict)
    return f
  if (f === '-' || f === '/')
    return ' '
  return /^[a-z0-9]$/.test(f)
    ? f
    : null
}

export interface TargetChar {
  /** 原文里的字符 */
  char: string
  /** 要求打成的字符；null 表示自动跳过 */
  need: string | null
}

export function typingTarget(sentence: string, strict = false): TargetChar[] {
  const out: TargetChar[] = []
  let last: string | null = null
  for (const char of sentence) {
    let need = required(char, strict)
    // 开头的空格、连续的空格只算一个
    if (need === ' ' && (last === null || last === ' '))
      need = null
    out.push({ char, need })
    if (need !== null)
      last = need
  }
  // 句末的空格不要求打
  for (let i = out.length - 1; i >= 0 && (out[i].need === null || out[i].need === ' '); i--)
    out[i].need = null
  return out
}

/** 把输入按同样的规则整理成要比对的字符序列（保留末尾空格：打完一个词按空格是正常的）。 */
export function normalizeTyped(input: string, strict = false): string {
  let out = ''
  for (const char of input) {
    const need = required(char, strict)
    if (need === null)
      continue
    if (need === ' ' && (out === '' || out.endsWith(' ')))
      continue
    out += need
  }
  return out
}

export type CharState = 'ok' | 'bad' | 'todo' | 'passed'
export interface CheckedChar {
  char: string
  state: CharState
  /** 打错时打成了什么（默写时显示它，而不是泄露正确答案） */
  typed?: string
  /** 是不是要打的字符（false = 自动跳过的标点/空格） */
  required: boolean
}
export interface TypingCheck {
  chars: CheckedChar[]
  /** 打错的字符数（含多打的） */
  errors: number
  /** 已经打了多少个要求的字符 */
  typed: number
  /** 一共要打多少个字符 */
  total: number
  done: boolean
}

export function checkTyping(input: string, sentence: string, strict = false): TypingCheck {
  const target = typingTarget(sentence, strict)
  const typed = normalizeTyped(input, strict)
  let k = 0
  let errors = 0
  const chars = target.map((t): CheckedChar => {
    if (t.need === null) {
      // 跳过的字符：前面要打的都打到了就算“已经过去”
      return {
        char: t.char,
        state: k < typed.length || (k > 0 && k === typed.length)
          ? 'passed'
          : 'todo',
        required: false,
      }
    }
    const c = typed[k++]
    if (c === undefined)
      return { char: t.char, state: 'todo', required: true }
    if (c === t.need)
      return { char: t.char, state: 'ok', required: true }
    errors++
    return {
      char: t.char,
      state: 'bad',
      typed: c,
      required: true,
    }
  })
  const total = target.filter(t => t.need !== null).length
  const extra = Math.max(0, typed.length - total)
  errors += extra
  return {
    chars,
    errors,
    typed: Math.min(typed.length, total),
    total,
    done: total > 0 && errors === 0 && typed.length === total,
  }
}

/** 英文单词数（算速度用）。 */
export function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length
}

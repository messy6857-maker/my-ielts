/** Word-level dictation compare: ignore case/punct; tolerate number forms. */

// A-5: keep thousands/decimal numbers whole ("1,800" / "3.50" must not split).
// A-6: keep apostrophe words whole, curly or straight ("don’t" / "don't").
const TOKEN_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?:st|nd|rd|th)?|[a-z0-9]+(?:['’][a-z0-9]+)?/gi

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
  thousand: '1000',
}

// A-9: ordinal words (first/second/third …) map to digits.
const ORDINAL_WORDS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
}

// A-9: common spoken abbreviations (only unambiguous ones; "St." is left out).
const ABBREVIATIONS: Record<string, string> = {
  dr: 'doctor',
  mr: 'mister',
  mrs: 'missus',
}

const TENS_VALUES: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}
const ONES_VALUES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
}

// A-9: "fifty-one" → "51" before tokenizing (hyphen would otherwise split it
// into "50" + "1"). Only tens-ones compounds; multi-word hundreds like
// "one hundred" are NOT combined (documented partial, see fix report).
function expandHyphenatedNumbers(text: string): string {
  return text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens: string, ones: string) =>
      String(TENS_VALUES[tens.toLowerCase()] + ONES_VALUES[ones.toLowerCase()]),
  )
}

export type DiffMark = 'ok' | 'missing' | 'extra' | 'wrong'

export interface DiffToken {
  expected?: string
  actual?: string
  mark: DiffMark
}

export function tokenizeDictation(text: string): string[] {
  return (expandHyphenatedNumbers(text).match(TOKEN_RE) ?? [])
    .map(w => normalizeDictationToken(w))
}

export function normalizeDictationToken(token: string): string {
  // A-6: curly apostrophes canonicalize to straight ones, then apostrophes
  // are dropped entirely, so "don’t" / "don't" / "dont" all compare equal.
  // (Same mechanism the audit flagged; "its" vs "it's" also compare equal,
  // consistent with this feature's ignore-punctuation tolerance.)
  const t = token.toLowerCase().replace(/[’‘]/g, '\'').replace(/'/g, '')
  if (NUMBER_WORDS[t])
    return NUMBER_WORDS[t]
  if (ORDINAL_WORDS[t])
    return ORDINAL_WORDS[t]
  if (ABBREVIATIONS[t])
    return ABBREVIATIONS[t]
  // A-5: thousands separators ("1,800" → "1800") and decimal trailing
  // zeros ("3.50" → "3.5", "3.0" → "3").
  let s = t.replace(/,/g, '')
  if (s.includes('.')) {
    const [ip, fp = ''] = s.split('.')
    const frac = fp.replace(/0+$/, '')
    const intPart = String(Number(ip))
    return frac ? `${intPart}.${frac}` : intPart
  }
  // 1st / 2nd / 3rd → 1 / 2 / 3
  const ord = s.match(/^(\d+)(st|nd|rd|th)$/)
  if (ord)
    return ord[1]
  // strip leading zeros on pure digits except single 0
  if (/^\d+$/.test(s))
    return String(Number(s))
  return s
}

export function tokensEqual(a: string, b: string): boolean {
  if (a === b)
    return true
  // pound/number tolerance already normalized; allow 20 vs twenty via map
  return normalizeDictationToken(a) === normalizeDictationToken(b)
}

/** LCS-based alignment for highlight. */
export function diffDictation(expectedText: string, actualText: string): {
  tokens: DiffToken[]
  correct: number
  total: number
  accuracy: number
  perfect: boolean
} {
  const expected = tokenizeDictation(expectedText)
  const actual = tokenizeDictation(actualText)
  const n = expected.length
  const m = actual.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (tokensEqual(expected[i - 1], actual[j - 1]))
        dp[i][j] = dp[i - 1][j - 1] + 1
      else
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const matched: Array<{ ei: number; aj: number }> = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (tokensEqual(expected[i - 1], actual[j - 1])) {
      matched.push({ ei: i - 1, aj: j - 1 })
      i--
      j--
    }
    else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    }
    else {
      j--
    }
  }
  matched.reverse()
  const expMatched = new Set(matched.map(x => x.ei))
  const actMatched = new Set(matched.map(x => x.aj))
  const tokens: DiffToken[] = []
  let ei = 0
  let aj = 0
  while (ei < n || aj < m) {
    if (ei < n && aj < m && expMatched.has(ei) && actMatched.has(aj) && tokensEqual(expected[ei], actual[aj])) {
      tokens.push({ expected: expected[ei], actual: actual[aj], mark: 'ok' })
      ei++
      aj++
      continue
    }
    if (ei < n && !expMatched.has(ei)) {
      // look ahead if next actual is a wrong substitute
      if (aj < m && !actMatched.has(aj)) {
        tokens.push({ expected: expected[ei], actual: actual[aj], mark: 'wrong' })
        ei++
        aj++
      }
      else {
        tokens.push({ expected: expected[ei], mark: 'missing' })
        ei++
      }
      continue
    }
    if (aj < m && !actMatched.has(aj)) {
      tokens.push({ actual: actual[aj], mark: 'extra' })
      aj++
      continue
    }
    // sync pointers when one side already matched further
    if (ei < n && expMatched.has(ei))
      ei++
    else if (aj < m && actMatched.has(aj))
      aj++
    else
      break
  }
  const correct = tokens.filter(t => t.mark === 'ok').length
  const total = Math.max(expected.length, 1)
  const accuracy = correct / total
  return {
    tokens,
    correct,
    total: expected.length,
    accuracy,
    perfect: expected.length > 0 && correct === expected.length && actual.length === expected.length,
  }
}

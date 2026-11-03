/** Word-level dictation compare: ignore case/punct; tolerate number forms. */

const WORD_RE = /[a-z0-9]+(?:'[a-z0-9]+)?/gi

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

export type DiffMark = 'ok' | 'missing' | 'extra' | 'wrong'

export interface DiffToken {
  expected?: string
  actual?: string
  mark: DiffMark
}

export function tokenizeDictation(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map(w => normalizeDictationToken(w))
}

export function normalizeDictationToken(token: string): string {
  const t = token.toLowerCase()
  if (NUMBER_WORDS[t])
    return NUMBER_WORDS[t]
  // 1st / 2nd / 3rd → 1 / 2 / 3
  const ord = t.match(/^(\d+)(st|nd|rd|th)$/)
  if (ord)
    return ord[1]
  // strip leading zeros on pure digits except single 0
  if (/^\d+$/.test(t))
    return String(Number(t))
  return t
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
  const matched: Array<{ ei: number, aj: number }> = []
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

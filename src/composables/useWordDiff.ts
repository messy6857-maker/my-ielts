export interface DiffToken {
  type: 'same' | 'del' | 'ins'
  text: string
}

/**
 * 单词级 diff（LCS），用于对照原文和改写后文章，标出改动处。
 * 300 词左右的作文 O(n*m) 完全够用。
 */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  const a = oldText.match(/\S+/g) || []
  const b = newText.match(/\S+/g) || []
  const m = a.length
  const n = b.length
  // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    }
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    }
    else {
      out.push({ type: 'ins', text: b[j] })
      j++
    }
  }
  while (i < m)
    out.push({ type: 'del', text: a[i++] })
  while (j < n)
    out.push({ type: 'ins', text: b[j++] })
  return out
}

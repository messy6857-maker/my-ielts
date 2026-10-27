export interface DiffToken {
  type: 'same' | 'del' | 'ins'
  text: string
}
const isWs = (s: string) => /^\s+$/.test(s)
/** 把各类 unicode 空格统一成普通空格，避免不换行空格导致溢出 */
function normalize(text: string): string {
  return text.replace(
    /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g,
    ' ',
  )
}
/**
 * 单词级 diff（LCS），用于对照原文和改写后文章，标出改动处。
 * 保留空白符 token（换行/段落不丢失），空白符之间视为相等。
 * 300 词左右的作文 O(n*m) 完全够用。
 */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  const a = normalize(oldText).match(/\S+|\s+/g) || []
  const b = normalize(newText).match(/\S+|\s+/g) || []
  const m = a.length
  const n = b.length
  const same = (x: string, y: string) => x === y || (isWs(x) && isWs(y))
  // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = same(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (same(a[i], b[j])) {
      // 空白符取改写版的（保留 AI 的分段）
      out.push({ type: 'same', text: isWs(a[i]) ? b[j] : a[i] })
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
  while (i < m) out.push({ type: 'del', text: a[i++] })
  while (j < n) out.push({ type: 'ins', text: b[j++] })
  return out
}

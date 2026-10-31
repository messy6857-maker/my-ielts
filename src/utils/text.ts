const abbreviations = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'a.m',
  'p.m',
  'u.s',
  'u.k',
  'u.s.a',
  'ph.d',
  'ph',
])
export function splitSentences(text: string): string[] {
  const result: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (!'.!?'.includes(text[i]))
      continue
    if (
      text[i] === '.'
      && /\d/.test(text[i - 1] ?? '')
      && /\d/.test(text[i + 1] ?? '')
    )
      continue
    const word
      = text
        .slice(0, i)
        .match(/([a-z.]+)$/i)?.[1]
        .toLowerCase() ?? ''
    if (text[i] === '.' && (abbreviations.has(word) || /^[a-z]$/i.test(word)))
      continue
    let end = i + 1
    while (/^[.!?"'”’)]$/.test(text[end] ?? '')) end++
    if (end < text.length && !/\s/.test(text[end]))
      continue
    const sentence = text.slice(start, end).trim()
    if (sentence)
      result.push(sentence)
    start = end
    i = end - 1
  }
  const last = text.slice(start).trim()
  if (last)
    result.push(last)
  return result
}
export interface TextPiece {
  text: string
  highlighted: boolean
  index: number
}
export function highlightPieces(text: string, words: string[]): TextPiece[] {
  const matches: Array<{
    start: number
    end: number
    index: number
  }> = []
  words.forEach((word, index) => {
    if (!word.trim())
      return
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 纯英文单词/词组才包词边界，避免 art 误中 part/start；中文不走此分支
    const pattern = /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(word)
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi')
    for (const match of text.matchAll(pattern)) {
      matches.push({
        start: match.index!,
        end: match.index! + match[0].length,
        index,
      })
    }
  })
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const result: TextPiece[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor)
      continue
    if (match.start > cursor) {
      result.push({
        text: text.slice(cursor, match.start),
        highlighted: false,
        index: -1,
      })
    }
    result.push({
      text: text.slice(match.start, match.end),
      highlighted: true,
      index: match.index,
    })
    cursor = match.end
  }
  if (cursor < text.length)
    result.push({ text: text.slice(cursor), highlighted: false, index: -1 })
  return result.length ? result : [{ text, highlighted: false, index: -1 }]
}
/** First complete JSON object, respecting quoted braces and escaped quotes. */
export function extractJson(text: string): string {
  for (
    let start = text.indexOf('{');
    start >= 0;
    start = text.indexOf('{', start + 1)
  ) {
    let depth = 0
    let quoted = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (quoted) {
        if (escaped)
          escaped = false
        else if (c === '\\')
          escaped = true
        else if (c === '"')
          quoted = false
        continue
      }
      if (c === '"') {
        quoted = true
      }
      else if (c === '{') {
        depth++
      }
      else if (c === '}' && --depth === 0) {
        const candidate = text.slice(start, i + 1)
        try {
          JSON.parse(candidate)
          return candidate
        }
        catch {
          break
        }
      }
    }
  }
  throw new Error('AI 返回格式异常，请重试')
}

/** A selected phrase must belong to one paragraph in the passage, including nested marks. */
export function selectionInOneParagraph(selection: Selection): boolean {
  if (selection.rangeCount !== 1)
    return false
  const range = selection.getRangeAt(0)
  const element = (node: Node) =>
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement
  const first = element(range.startContainer)?.closest('p')
  const last = element(range.endContainer)?.closest('p')
  return !!first && first === last && !!first.closest('[data-passage]')
}

/** Split both line-start and inline speaker turns; times such as 2:30 remain text. */
export function transcriptSentenceEntries(transcript: string) {
  const label
    = /(?:^|\s)((?:Speaker\s+\d+(?:\s*\([^)]*\))?|Student\s+\d+|Narrator(?:\/Instructor)?|Instructor|[A-Z][A-Z '\-]{1,30}|[A-Z][a-z]+)):\s+/g
  return transcript
    .split('\n')
    .filter(line => line.trim())
    .flatMap((line) => {
      const turns: Array<{ speaker: string; text: string }> = []
      let speaker = ''
      let cursor = 0
      for (const match of line.matchAll(label)) {
        if (/^(Note|Time|Example|Answer|Section|Question)$/i.test(match[1]))
          continue
        const before = line.slice(cursor, match.index).trim()
        if (before)
          turns.push({ speaker, text: before })
        speaker = match[1]
        cursor = match.index! + match[0].length
      }
      const last = line.slice(cursor).trim()
      if (last)
        turns.push({ speaker, text: last })
      return turns.flatMap(turn =>
        splitSentences(turn.text).map(text => ({
          text,
          speaker: turn.speaker,
          display: turn.speaker ? `${turn.speaker}: ${text}` : text,
        })),
      )
    })
}

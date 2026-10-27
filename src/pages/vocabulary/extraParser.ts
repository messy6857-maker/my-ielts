/**
 * 解析词汇表中「拓展」字段（extra），拆成可自测的词条。
 *
 * extra 原始格式示例：
 * - "horizontal adj. 水平的。broaden sb.'s horizons 开阔眼界"
 * - "excel v. 擅长；突出"
 * - "boa n. 蟒蛇 prey n. 猎物"
 * - "a disaster film/movie 灾难片"
 * - "复数形式：phenomena；a natural phenomenon 自然现象"
 * - "orginze a compaign"（无中文释义 → 丢弃）
 */

export interface ExtraEntry {
  word: string
  pos: string
  meaning: string
}

const POS = '(?:adj|adv|n|vi|vt|v|prep|conj|pron|num|art|interj)'
// 词性必须是空白分隔的独立 token，避免把 phenomenon 词尾的 n 误判成词性
const ENTRY_RE = new RegExp(
  `^([A-Za-z][A-Za-z'.\\-/() ]*?)(?:\\s+(${POS})\\.?)?\\s*([\u4E00-\u9FA5\uFF00-\uFFEF\u3000-\u303F].*)$`,
)

/** 去掉 "/词的" 这类跟在英文后的中文备注残留（保留 film/movie 这种英文内的斜杠） */
function cleanPiece(piece: string): string {
  return piece.replace(/\/[\u4E00-\u9FA5]+/g, '')
}

export function parseExtra(extra: string | undefined | null): ExtraEntry[] {
  if (!extra)
    return []
  const raw = extra.trim()
  if (raw === '' || raw === '-')
    return []
  const entries: ExtraEntry[] = []
  // 。分隔并列条目；；可能是并列条目，也可能是同一词条的多个释义
  for (const seg of raw.split('。')) {
    for (const pieceRaw of seg.split('；')) {
      const piece = cleanPiece(pieceRaw.trim())
      if (!piece)
        continue
      const m = piece.match(ENTRY_RE)
      if (m) {
        entries.push({
          word: m[1].trim(),
          pos: m[2] ? `${m[2]}.` : '',
          // 去掉释义开头的标点残留（如 "，有磁性的"）
          meaning: m[3].trim().replace(/^[，。；、\s]+/, ''),
        })
      }
      else if (
        entries.length > 0
        // 中文开头的无词头片段 → 视为上一词条的补充释义；含冒号的是备注，直接丢弃
        && /^[\u4E00-\u9FA5（(]/.test(piece)
        && !/[:：]/.test(piece)
      ) {
        entries[entries.length - 1].meaning += `；${piece}`
      }
      // 其余情况（纯英文无释义、备注等）直接丢弃
    }
  }
  return entries.filter(e => e.word.length > 0 && e.meaning.length > 0)
}

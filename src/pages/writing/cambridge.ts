// 剑桥真题作文题（剑18–剑21，每套 Test 1–4 的 Task 1 + Task 2，共 32 题）
// Task 1 为图片题（图表从 PDF 裁出）；Task 2 为纯文本题

export interface CambridgeWritingTask {
  /** 如 'c18-t1-task1' */
  id: string
  /** 如 '剑18' */
  book: string
  /** 如 'Test 1' */
  testLabel: string
  /** 1 = 小作文，2 = 大作文 */
  task: 1 | 2
  /** 英文题干原文（照搬书中文字） */
  promptEn: string
  /** 中文简介（一句话，如"柱状图：某国各年龄段上网时长"） */
  promptCn: string
  /** Task 1 图表图片 public 路径，如 '/writing/c18-t1-task1.png' */
  image?: string
}

// 各书真题聚合
import { cam18Writing } from './cam18'
import { cam19Writing } from './cam19'
import { cam20Writing } from './cam20'
import { cam21Writing } from './cam21'

export const CAMBRIDGE_WRITING: CambridgeWritingTask[] = [
  ...cam21Writing,
  ...cam20Writing,
  ...cam19Writing,
  ...cam18Writing,
]

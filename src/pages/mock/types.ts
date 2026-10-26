// 模考通用类型定义

export type MockQuestionType = 'multiple-choice' | 'multi-select' | 'tfng' | 'fill-blank' | 'matching' | 'map-label'

export interface MockQuestion {
  /** 题号，如 "Q1" */
  id: string
  type: MockQuestionType
  /** 题干（填空题用 ____ 标记空位） */
  question: string
  /** 选择题选项；TFNG 为 ["True", "False", "Not Given"] */
  options?: string[]
  /** 答案：单选为选项下标，填空为字符串（小写比较，支持字符串数组多答案），多选为下标数组 */
  answer: string | string[] | number | number[]
}

export interface ReadingPassage {
  title: string
  /** 段落用 \n\n 分隔 */
  passage: string
  questions: MockQuestion[]
  /** 可选：题目相关图片（如选项框、示意图） */
  image?: string
}

export interface ReadingMockTest {
  id: string
  title: string
  passages: ReadingPassage[]
  /** 秒，阅读 60 分钟 = 3600 */
  timeLimit: number
}

export interface ListeningPart {
  title: string
  /** 音频文件路径（相对 public/） */
  audio: string
  /** 录音脚本（精听/对答案用，不直接显示） */
  transcript?: string
  /** 地图/示意图（相对 public/，如地图题） */
  image?: string
  questions: MockQuestion[]
}

export interface ListeningMockTest {
  id: string
  title: string
  parts: ListeningPart[]
  /** 秒，听力 30+10 分钟 = 2400 */
  timeLimit: number
}

/** 雅思听力/阅读分数换算（40 题制） */
export function bandScore(correct: number): number {
  if (correct >= 39) return 9.0
  if (correct >= 37) return 8.5
  if (correct >= 35) return 8.0
  if (correct >= 33) return 7.5
  if (correct >= 30) return 7.0
  if (correct >= 27) return 6.5
  if (correct >= 23) return 6.0
  if (correct >= 20) return 5.5
  if (correct >= 16) return 5.0
  if (correct >= 13) return 4.5
  if (correct >= 10) return 4.0
  if (correct >= 8) return 3.5
  if (correct >= 6) return 3.0
  return 2.5
}

/** 判分：填空题忽略大小写和首尾空格；多选题用户答案为逗号分隔的下标 */
export function isCorrect(q: MockQuestion, userAnswer: string): boolean {
  if (q.type === 'fill-blank') {
    // 支持多答案：answer 可以是字符串或字符串数组
    const answers = Array.isArray(q.answer) ? q.answer : [q.answer]
    const user = userAnswer.trim().toLowerCase()
    return answers.some(a => user === String(a).trim().toLowerCase())
  }
  if (q.type === 'map-label') {
    // 地图标注：字母不区分大小写
    return userAnswer.trim().toUpperCase() === String(q.answer).trim().toUpperCase()
  }
  if (q.type === 'multi-select' && Array.isArray(q.answer)) {
    const userSet = new Set(userAnswer.split(',').filter(Boolean).map(s => Number(s)))
    const ansSet = new Set(q.answer as number[])
    return userSet.size === ansSet.size && [...ansSet].every(a => userSet.has(a))
  }
  return userAnswer === String(q.answer)
}

/** 多选题得分：选对几个得几分（Choose TWO 最多 2 分） */
export function multiSelectScore(q: MockQuestion, userAnswer: string): number {
  if (q.type !== 'multi-select' || !Array.isArray(q.answer))
    return isCorrect(q, userAnswer) ? 1 : 0
  const userSet = new Set(userAnswer.split(',').filter(Boolean).map(s => Number(s)))
  const ansSet = new Set(q.answer as number[])
  if (userSet.size > ansSet.size || [...userSet].some(a => !Number.isInteger(a) || a < 0 || a >= (q.options?.length ?? 0)))
    return 0
  let score = 0
  for (const a of userSet) {
    if (ansSet.has(a))
      score++
  }
  // 合法选择数量内按命中数给分；超选已在上面判为无效。
  return score
}

/** 秒 → mm:ss */
export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

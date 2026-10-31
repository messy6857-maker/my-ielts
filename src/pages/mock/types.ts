// 模考通用类型定义

export type MockQuestionType =
  | 'multiple-choice'
  | 'multi-select'
  | 'tfng'
  | 'fill-blank'
  | 'map-label'

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
  /** 可选：标题列表文本版（如剑 20 Test 3 Passage 2 的 i–vii；有图时用图，无图时用此文本） */
  headings?: string[]
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

/** 雅思听力/阅读分数换算；total 为卷面满分（默认 40），各档阈值按 total/40 等比缩放并向上取整，38 分卷全对可到 9.0 */
export function bandScore(correct: number, total = 40): number {
  const t = total > 0 ? total : 40
  const at = (base: number) => Math.ceil((base / 40) * t)
  if (correct >= at(39))
    return 9.0
  if (correct >= at(37))
    return 8.5
  if (correct >= at(35))
    return 8.0
  if (correct >= at(33))
    return 7.5
  if (correct >= at(30))
    return 7.0
  if (correct >= at(27))
    return 6.5
  if (correct >= at(23))
    return 6.0
  if (correct >= at(20))
    return 5.5
  if (correct >= at(16))
    return 5.0
  if (correct >= at(13))
    return 4.5
  if (correct >= at(10))
    return 4.0
  if (correct >= at(8))
    return 3.5
  if (correct >= at(6))
    return 3.0
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
    return (
      userAnswer.trim().toUpperCase() === String(q.answer).trim().toUpperCase()
    )
  }
  if (q.type === 'multi-select' && Array.isArray(q.answer)) {
    const userSet = new Set(
      userAnswer
        .split(',')
        .filter(Boolean)
        .map(s => Number(s)),
    )
    const ansSet = new Set(q.answer as number[])
    return (
      userSet.size === ansSet.size && [...ansSet].every(a => userSet.has(a))
    )
  }
  return userAnswer === String(q.answer)
}

/** 多选题得分：选对几个得几分（Choose TWO 最多 2 分）；用户选项数超过答案数时返回 0 分，防止全选刷分 */
export function multiSelectScore(q: MockQuestion, userAnswer: string): number {
  if (q.type !== 'multi-select' || !Array.isArray(q.answer))
    return isCorrect(q, userAnswer) ? 1 : 0
  const userSet = new Set(
    userAnswer
      .split(',')
      .filter(Boolean)
      .map(s => Number(s)),
  )
  const ansSet = new Set(q.answer as number[])
  // 防御：选项数超过答案数（例如全选）直接 0 分；界面层 toggleMultiSelect 也限制最多选答案个数
  if (userSet.size > ansSet.size)
    return 0
  let score = 0
  for (const a of userSet) {
    if (ansSet.has(a))
      score++
  }

  return score
}

/** 两页镜像的纯逻辑（M-Opt-#1）：只抽与模板/计时器/路由无关的部分，
 *  行为与两页原内联实现逐行一致，改一处漏一处的风险不再靠复制粘贴兜底。 */

/** 满分题数：多选题按答案个数计，其余每题 1 分 */
export function totalScorePoints(questions: MockQuestion[]): number {
  return questions.reduce(
    (s, q) =>
      s
      + (q.type === 'multi-select' && Array.isArray(q.answer)
        ? q.answer.length
        : 1),
    0,
  )
}

/** 交卷前得分为 0；交卷后按判分规则计分（多选按对几个得几分） */
export function countCorrect(
  questions: MockQuestion[],
  answers: Record<string, string>,
  submitted: boolean,
): number {
  if (!submitted)
    return 0
  return questions.reduce((sum, q) => {
    const ans = answers[q.id] ?? ''
    return (
      sum
      + (q.type === 'multi-select'
        ? multiSelectScore(q, ans)
        : isCorrect(q, ans)
          ? 1
          : 0)
    )
  }, 0)
}

export function mockQuestionStatus(
  q: MockQuestion,
  userAns: string,
  submitted: boolean,
): 'correct' | 'wrong' | 'partial' | 'unanswered' {
  if (!submitted)
    return 'unanswered'
  if (!userAns)
    return 'unanswered'
  if (q.type === 'multi-select') {
    const score = multiSelectScore(q, userAns)
    const max = Array.isArray(q.answer) ? q.answer.length : 1
    if (score === max)
      return 'correct'
    return score > 0 ? 'partial' : 'wrong'
  }
  return isCorrect(q, userAns) ? 'correct' : 'wrong'
}

/** 多选切换：已选则取消；未选且未达上限则加入；已达上限拒绝加入 */
export function toggleMultiSelectValue(
  current: string,
  idx: number,
  max: number,
): string {
  const set = new Set(current.split(',').filter(Boolean))
  const s = String(idx)
  if (set.has(s)) {
    set.delete(s)
  }
  else {
    if (set.size >= max)
      return current
    set.add(s)
  }
  return [...set].join(',')
}

/** 草稿续做时限：钳制到 [0, timeLimit]，无草稿时用整卷时限 */
export function restoreTimeLeft(
  savedTimeLeft: number | null | undefined,
  timeLimit: number,
): number {
  return savedTimeLeft == null
    ? timeLimit
    : Math.min(Math.max(0, savedTimeLeft), timeLimit)
}

/**
 * map-label 占位文案（M-Opt3）：答案形态为小写罗马数字（i–viii，标题匹配题
 * 的转录形态）时提示序号；其余（地图/配对题，答案为大写单字母，含大写 I）
 * 保留“输入字母”。大小写是区分依据：小写 i 是序号，大写 I 是字母。
 */
export function mapLabelPlaceholder(q: MockQuestion): string {
  if (q.type !== 'map-label')
    return '输入答案'
  const a = typeof q.answer === 'string' ? q.answer : ''
  if (a && a === a.toLowerCase() && /^[iv]+$/.test(a))
    return '输入序号，如 vii'
  return '输入字母'
}

/** 秒 → mm:ss */
export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function isRomanLabel(q: MockQuestion) {
  return (
    q.type === 'map-label'
    && typeof q.answer === 'string'
    && (/^[ivxlcdm]+$/.test(q.answer)
      || (q.answer.length > 1 && /^[IVXLCDM]+$/.test(q.answer)))
  )
}

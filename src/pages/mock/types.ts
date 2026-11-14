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

/** 换算表：[40 分卷最低正确数, band]，从高到低；低于最后一档为 2.5 */
type BandTable = ReadonlyArray<readonly [number, number]>

/** 听力（学术/培训通用），按 IELTS/IDP 公布的换算表 */
export const LISTENING_BAND_TABLE: BandTable = [
  [39, 9.0],
  [37, 8.5],
  [35, 8.0],
  [32, 7.5],
  [30, 7.0],
  [26, 6.5],
  [23, 6.0],
  [18, 5.5],
  [16, 5.0],
  [13, 4.5],
  [11, 4.0],
  [8, 3.5],
  [6, 3.0],
]

/** 学术类阅读，按常用公布换算表（band 5/6/7/8 分别需 15/23/30/35） */
export const ACADEMIC_READING_BAND_TABLE: BandTable = [
  [39, 9.0],
  [37, 8.5],
  [35, 8.0],
  [33, 7.5],
  [30, 7.0],
  [27, 6.5],
  [23, 6.0],
  [19, 5.5],
  [15, 5.0],
  [13, 4.5],
  [10, 4.0],
  [8, 3.5],
  [6, 3.0],
]

/** 分数换算；total 为卷面满分（默认 40），各档阈值按 total/40 等比缩放并向上取整，38 分卷全对可到 9.0。默认用听力表。 */
export function bandScore(
  correct: number,
  total = 40,
  table: BandTable = LISTENING_BAND_TABLE,
): number {
  const t = total > 0 ? total : 40
  const at = (base: number) => Math.ceil((base / 40) * t)
  for (const [base, band] of table) {
    if (correct >= at(base))
      return band
  }
  return 2.5
}

export function listeningBandScore(correct: number, total = 40): number {
  return bandScore(correct, total, LISTENING_BAND_TABLE)
}

export function readingBandScore(correct: number, total = 40): number {
  return bandScore(correct, total, ACADEMIC_READING_BAND_TABLE)
}

const UK_US_WORDS: Record<string, string> = {
  jewellery: 'jewelry',
  programme: 'program',
  programmes: 'programs',
  grey: 'gray',
  aluminium: 'aluminum',
  defence: 'defense',
  offence: 'offense',
  licence: 'license',
  pyjamas: 'pajamas',
  plough: 'plow',
  aeroplane: 'airplane',
  aeroplanes: 'airplanes',
  enrol: 'enroll',
  enrolment: 'enrollment',
  fulfil: 'fulfill',
  skilful: 'skillful',
  tyre: 'tire',
  tyres: 'tires',
  catalogue: 'catalog',
  dialogue: 'dialog',
  analogue: 'analog',
  analyse: 'analyze',
  analysed: 'analyzed',
  analysing: 'analyzing',
  paralyse: 'paralyze',
  practise: 'practice',
  practised: 'practiced',
  practising: 'practicing',
}
const OUR_KEEP = new Set(['our', 'four', 'hour', 'pour', 'tour', 'your', 'flour', 'sour', 'dour', 'devour', 'contour', 'detour'])
const ISE_KEEP = new Set([
  'advise', 'advertise', 'arise', 'comprise', 'compromise', 'concise', 'demise', 'despise', 'devise', 'disguise',
  'enterprise', 'exercise', 'expertise', 'franchise', 'improvise', 'merchandise', 'noise', 'otherwise', 'paradise',
  'praise', 'precise', 'premise', 'promise', 'raise', 'revise', 'rise', 'supervise', 'surprise', 'televise', 'wise',
  'cruise', 'bruise', 'poise', 'guise', 'excise', 'treatise', 'reprise', 'chemise', 'sunrise', 'moonrise',
  'likewise', 'clockwise', 'anticlockwise', 'incise', 'circumcise', 'apprise',
])
const LL_STEMS = new Set([
  'travel', 'cancel', 'model', 'label', 'level', 'fuel', 'signal', 'total', 'channel', 'dial', 'equal', 'marvel',
  'quarrel', 'tunnel', 'counsel', 'jewel', 'panel', 'shovel', 'rival', 'pedal', 'refuel', 'snorkel', 'kennel',
])
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december'

/** 英美拼写归一（只在比较时用，标准答案与用户答案做同样处理） */
function spellingKey(word: string): string {
  if (UK_US_WORDS[word])
    return UK_US_WORDS[word]
  // colour/colours/coloured → color…
  const our = word.match(/^([a-z]+)our(s|ed|ing|ite|ites|able|less|ful|er|ers)?$/)
  if (our && !OUR_KEEP.has(`${our[1]}our`))
    return `${our[1]}or${our[2] ?? ''}`
  // organisation → organization; organise/organised/organising → organize…
  if (/isations?$/.test(word))
    return word.replace(/isation(s?)$/, 'ization$1')
  const ise = word.match(/^([a-z]{2,})is(e|es|ed|ing)$/)
  if (ise && !ISE_KEEP.has(`${ise[1]}ise`))
    return `${ise[1]}iz${ise[2]}`
  // centre/metre/theatre → center…
  const tre = word.match(/^([a-z]{2,})tre(s?)$/)
  if (tre)
    return `${tre[1]}ter${tre[2]}`
  // travelled/cancelling/modeller → traveled…（只限常见词，避免把 installed 之类的错拼放过）
  const ll = word.match(/^([a-z]+)ll(ed|ing|er|ers)$/)
  if (ll && LL_STEMS.has(`${ll[1]}l`))
    return `${ll[1]}l${ll[2]}`
  return word
}

/**
 * 填空答案归一：忽略大小写、多余空格、句末标点、货币符号、千分位逗号、
 * 连字符、英美拼写差异，日期“April 24”与“24 April”等价。
 */
export function normalizeBlankAnswer(text: string): string {
  let s = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, '\'')
    .replace(/[‐-―]/g, '-')
    .replace(/[£$€¥]/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    // 连字符当空格（part-time = part time），数字之间的保留（如 9-5）
    .replace(/-/g, (m, i: number, str: string) =>
      /\d/.test(str[i - 1] ?? '') && /\d/.test(str[i + 1] ?? '') ? m : ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[.,;:!?]+$/, '')
  // 日期：24th April = 24 April = April 24（序数后缀只在带月份时忽略，3rd floor ≠ 3 floor）
  if (new RegExp(`\\b(?:${MONTHS})\\b`).test(s)) {
    s = s
      .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, '$1')
      .replace(/\b(\d{1,2}) of (?=[a-z])/g, '$1 ')
      .replace(new RegExp(`^(${MONTHS}) (\\d{1,2})$`), '$2 $1')
  }
  s = s
    .split(' ')
    .map(spellingKey)
    .join(' ')
  // 数字与单位之间的空格可有可无：1000 kg = 1000kg
  return s.replace(/(\d) (?=[a-z%])/g, '$1')
}

function blankMatches(expected: string, user: string): boolean {
  const a = normalizeBlankAnswer(expected)
  const b = normalizeBlankAnswer(user)
  if (!b)
    return false
  if (a === b)
    return true
  // 邮编/编号类（含数字）：空格不影响，DW30 7YZ = DW307YZ
  return /\d/.test(a) && a.replace(/ /g, '') === b.replace(/ /g, '')
}

/** 配对/标注题选项框是否在本题渲染：同一 Part 内连续且选项内容相同的
 * 题组只在首题渲染一次（如剑 21 Test3 听力 P3 的 6 题共用一框），其余题
 * 不再重复渲染整框。上一题非 map-label、无选项或选项内容不同时重新渲染。
 * 注意：相邻两组选项内容恰好完全相同时，后一组不再重复出框（框仍在
 * 本页上方可见）；组间以题型或选项变化分隔是常态，此边界可接受。 */
export function showOptionsBox(questions: MockQuestion[], index: number): boolean {
  const q = questions[index]
  if (!q || q.type !== 'map-label' || !q.options?.length)
    return false
  if (index === 0)
    return true
  const prev = questions[index - 1]
  if (!prev || prev.type !== 'map-label' || !prev.options?.length)
    return true
  return JSON.stringify(prev.options) !== JSON.stringify(q.options)
}

/** 判分：填空题按 normalizeBlankAnswer 归一后比较；多选题用户答案为逗号分隔的下标 */
export function isCorrect(q: MockQuestion, userAnswer: string): boolean {
  if (q.type === 'fill-blank') {
    // 支持多答案：answer 可以是字符串或字符串数组
    const answers = Array.isArray(q.answer) ? q.answer : [q.answer]
    return answers.some(a => blankMatches(String(a), userAnswer))
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

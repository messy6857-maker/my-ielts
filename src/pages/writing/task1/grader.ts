import { splitSentences } from '../../../utils/text'

// 雅思学术类小作文（Task 1）规则批改引擎
// 依据公开的四项评分标准：TA / CC / LR / GRA
// 注意：这是基于规则的练习用估分，不是官方评分

export type CriterionKey = 'ta' | 'cc' | 'lr' | 'gra'

export interface CriterionScore {
  key: CriterionKey
  label: string
  labelCn: string
  score: number
  strengths: string[]
  improvements: string[]
}

export interface EssayStats {
  words: number
  sentences: number
  paragraphs: number
  avgSentenceLen: number
  typeTokenRatio: number
  linkingTotal: number
  linkingUnique: number
  trendWords: number
  complexRatio: number
  dataRefs: number
  hasOverview: boolean
  comparisons: number
}

export interface GradeResult {
  overall: number
  criteria: CriterionScore[]
  stats: EssayStats
}

const CRITERION_META: Record<CriterionKey, { label: string; labelCn: string }>
  = {
    ta: { label: 'Task Achievement', labelCn: '任务完成度' },
    cc: { label: 'Coherence & Cohesion', labelCn: '连贯与衔接' },
    lr: { label: 'Lexical Resource', labelCn: '词汇资源' },
    gra: {
      label: 'Grammatical Range & Accuracy',
      labelCn: '语法多样性与准确性',
    },
  }

// ---------- 基础文本分析 ----------

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []
}

function splitParagraphs(text: string): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
  if (paras.length > 1)
    return paras
  // 兼容单换行分段
  const lines = text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
  return lines.length > 1 ? lines : [text.trim()]
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0
  for (const re of patterns) {
    const m = text.match(re)
    if (m)
      n += m.length
  }
  return n
}

function uniqueMatches(text: string, words: string[]): string[] {
  return words.filter((w) => {
    const pattern = w
      .split(' ')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')
    return new RegExp(`\\b${pattern}\\b`, 'i').test(text)
  })
}

// ---------- 词表 ----------

const OVERVIEW_MARKERS = [
  'overall',
  'in general',
  'generally speaking',
  'generally,',
  'it is clear that',
  'it can be seen that',
  'in summary',
  'to sum up',
  'the main trend',
  'main trends',
  'the most noticeable',
  'striking feature',
]

const LINKING_DEVICES = [
  'however',
  'moreover',
  'furthermore',
  'in addition',
  'besides',
  'in contrast',
  'on the other hand',
  'on the contrary',
  'conversely',
  'while',
  'whereas',
  'although',
  'though',
  'despite',
  'in spite of',
  'therefore',
  'consequently',
  'as a result',
  'thus',
  'hence',
  'similarly',
  'likewise',
  'in comparison',
  'compared to',
  'compared with',
  'in terms of',
  'with regard to',
  'regarding',
  'for example',
  'for instance',
  'namely',
  'in particular',
  'particularly',
  'overall',
  'finally',
  'firstly',
  'secondly',
  'subsequently',
  'meanwhile',
  'nevertheless',
  'nonetheless',
  'instead',
  'alternatively',
  'accordingly',
]

const TREND_VOCAB = [
  'increase',
  'increased',
  'increases',
  'increasing',
  'decrease',
  'decreased',
  'decreases',
  'decreasing',
  'rise',
  'rose',
  'risen',
  'rises',
  'rising',
  'fall',
  'fell',
  'fallen',
  'falls',
  'falling',
  'grow',
  'grew',
  'grown',
  'grows',
  'growing',
  'growth',
  'decline',
  'declined',
  'declines',
  'declining',
  'drop',
  'dropped',
  'drops',
  'dropping',
  'surge',
  'surged',
  'soar',
  'soared',
  'plummet',
  'plummeted',
  'fluctuate',
  'fluctuated',
  'fluctuation',
  'fluctuations',
  'remain',
  'remained',
  'stable',
  'stability',
  'steady',
  'peak',
  'peaked',
  'reach a peak',
  'trough',
  'dramatic',
  'dramatically',
  'sharp',
  'sharply',
  'steep',
  'steeply',
  'gradual',
  'gradually',
  'slight',
  'slightly',
  'marginal',
  'marginally',
  'significant',
  'significantly',
  'considerable',
  'considerably',
  'account for',
  'accounts for',
  'accounted for',
  'comprise',
  'comprises',
  'comprised',
  'constitute',
  'constitutes',
  'proportion',
  'percentage',
  'overtake',
  'overtook',
  'surpass',
]

// 从句专属标记：只保留从属连词、关系代词与固定搭配。
// 已剔除 that / as / when / where / after / before / once / since / until：
// 它们常作介词或引导非从句成分，子串命中会把简单句系统性误算为复合句
// （原规则下复合句占比几乎恒 >= 0.4，GRA 常驻 +0.5）；这四个词的真从句
// 由 hasTrueSubordinateClause 按“标记 + 主谓结构”单独识别，不走子串。
// 已剔除 despite / in spite of / in order to：前两者只接名词/动名词短语，
// 后者只接不定式，都不是从句，子串命中同样是误判。
const COMPLEX_MARKERS = [
  'although',
  'though',
  'while',
  'whereas',
  'because',
  'which',
  'who',
  'whom',
  'whose',
  'if',
  'unless',
  'so that',
]

const COMPARISON_MARKERS = [
  'higher than',
  'lower than',
  'more than',
  'less than',
  'greater than',
  'compared to',
  'compared with',
  'in comparison',
  'in contrast',
  'while',
  'whereas',
  'by contrast',
  'similarly',
  'twice as',
]

// 段首判定：标记后须跟非字母（空格/标点/结尾），避免 overallocation 之类误触
function startsWithMarker(text: string, marker: string): boolean {
  if (!text.startsWith(marker))
    return false
  const next = text[marker.length]
  return next === undefined || !/[a-z]/.test(next)
}

// 概述段只认段首：某段以 overview 标记开头才算，不再全文子串匹配
// （细节段里顺带写一句 Overall, ... 不代表写了独立概述段）
function hasOverviewParagraph(paragraphs: string[]): boolean {
  return paragraphs.some((p) => {
    const pl = p.toLowerCase().trim()
    return OVERVIEW_MARKERS.some(m => startsWithMarker(pl, m))
  })
}

// 近似判断一段文字是否含谓语动词：助动词/情态动词、-ed 形式或常见不规则过去式
const FINITE_VERB_RE
  = /\b(am|is|are|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|shall|should|do|does|did)\b/
const IRREGULAR_PAST = [
  'rose',
  'fell',
  'grew',
  'went',
  'came',
  'saw',
  'took',
  'gave',
  'became',
  'stood',
  'reached',
  'remained',
  'accounted',
  'showed',
  'recorded',
]
// 常见现在时实义动词。注意 rise / fall / increase 等兼作名词：
// 只有当前置词不是冠词、形容词、介词时才算谓语（排除 the sharp rise、
// a fall in sales 这类名词短语），否则逗号短语会被误判为完整分句。
// 另排除 peak / costs：peak 在 reaching a peak 里是宾语，costs 常作主语名词。
const PRESENT_VERBS = [
  'rise',
  'rises',
  'fall',
  'falls',
  'show',
  'shows',
  'increase',
  'increases',
  'decrease',
  'decreases',
  'grow',
  'grows',
  'change',
  'changes',
  'vary',
  'varies',
  'remain',
  'remains',
  'stay',
  'stays',
  'stand',
  'stands',
  'drop',
  'drops',
  'climb',
  'climbs',
  'decline',
  'declines',
  'fluctuate',
  'fluctuates',
  'reach',
  'reaches',
  'exceed',
  'exceeds',
  'surpass',
  'surpasses',
  'dominate',
  'dominates',
  'lead',
  'leads',
  'follow',
  'follows',
  'continue',
  'continues',
  'begin',
  'begins',
  'start',
  'starts',
  'end',
  'ends',
]
const NON_VERB_PRECEDING = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'to',
  'of',
  'for',
  'from',
  'with',
  'by',
  'despite',
  'after',
  'before',
  'during',
  'over',
  'under',
  'sharp',
  'sharply',
  'dramatic',
  'dramatically',
  'slight',
  'slightly',
  'gradual',
  'gradually',
  'significant',
  'significantly',
  'steep',
  'steeply',
  'considerable',
  'considerably',
  'marginal',
  'marginally',
  'rapid',
  'rapidly',
  'substantial',
  'modest',
  'marked',
  'noticeable',
  'strong',
  'weak',
  'large',
  'small',
])
function wordTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []
}
function isFiniteVerbToken(token: string): boolean {
  if (FINITE_VERB_RE.test(` ${token} `))
    return true
  if (/\w+ed$/.test(token))
    return true
  if (IRREGULAR_PAST.includes(token))
    return true
  return PRESENT_VERBS.includes(token)
}
function hasFiniteVerb(fragment: string): boolean {
  const f = ` ${fragment.toLowerCase()} `
  if (FINITE_VERB_RE.test(f))
    return true
  if (/\b\w+ed\b/.test(f))
    return true
  if (IRREGULAR_PAST.some(v => f.includes(` ${v} `)))
    return true
  // 现在时实义动词须带主语位置：前一词不是冠词/形容词/介词，且不是句首孤词
  const tokens = wordTokens(fragment)
  return tokens.some(
    (t, i) =>
      i > 0
      && PRESENT_VERBS.includes(t)
      && !NON_VERB_PRECEDING.has(tokens[i - 1]),
  )
}

// that / when / where / as 引导的从句：须有主谓结构；宾语从句与关系从句均计入。
// shows that sales rose / as incomes grew 算；as a result / when in 2020 不算。
function hasTrueSubordinateClause(sentence: string): boolean {
  const tokens = wordTokens(sentence)
  const PREPOSITIONS = new Set([
    'in',
    'on',
    'at',
    'to',
    'of',
    'for',
    'from',
    'with',
    'by',
  ])
  // 在标记后 offset 1..12 处找谓语，允许带冠词的多词主语，排除介词短语。
  const clauseAfter = (idx: number, allowSubjectRelative: boolean): boolean => {
    if (
      allowSubjectRelative
      && idx + 1 < tokens.length
      && isFiniteVerbToken(tokens[idx + 1])
    )
      return true
    for (let off = 1; off <= 12; off++) {
      const vi = idx + off
      if (vi >= tokens.length)
        return false
      if (!isFiniteVerbToken(tokens[vi]))
        continue
      const between = tokens.slice(idx + 1, vi)
      if (
        PREPOSITIONS.has(between[0])
        || (between.length > 0 && NON_VERB_PRECEDING.has(between.at(-1)!))
      )
        continue
      // 现在时动词作谓语时，主语须在它前面（between 非空即已满足）；
      // 若谓语是现在时且紧贴标记（如 that rise），那是无主语结构，不算
      if (PRESENT_VERBS.includes(tokens[vi]) && between.length === 0)
        continue
      return true
    }
    return false
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'that') {
      // Object clauses and relative clauses both contribute grammatical complexity.
      if (clauseAfter(i, true))
        return true
    }
    else if (t === 'when' || t === 'where') {
      if (i + 1 < tokens.length && PREPOSITIONS.has(tokens[i + 1]))
        continue
      if (clauseAfter(i, false))
        return true
    }
    else if (t === 'as') {
      if (tokens[i + 1] === 'a' && tokens[i + 2] === 'result')
        continue
      if (i + 1 < tokens.length && PREPOSITIONS.has(tokens[i + 1]))
        continue
      if (clauseAfter(i, false))
        return true
    }
  }
  return false
}

// 逗号规则：须存在一个逗号，其两侧（累计左侧与右侧）均为完整分句
// （各 >= 3 词且含谓语），逗号分隔的短语/插入语（如 In 2020, ... / ..., reaching a peak）不再算数
function hasCommaClause(sentence: string): boolean {
  const parts = sentence.split(',')
  for (let i = 0; i < parts.length - 1; i++) {
    const left = parts.slice(0, i + 1).join(',')
    const right = parts.slice(i + 1).join(',')
    if (
      left.trim().split(/\s+/).length >= 3
      && right.trim().split(/\s+/).length >= 3
      && hasFiniteVerb(left)
      && hasFiniteVerb(right)
    )
      return true
  }
  return false
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// ---------- 主分析 ----------

export function analyzeEssay(text: string): EssayStats {
  const words = tokenize(text)
  // 词数口径统一为空白切分，与写作页显示/提交门槛一致；
  // tokenize（只认英文字母）只保留给句长、词汇多样性等语言学统计
  const displayWords = text.trim()
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)
  const lower = text.toLowerCase()

  const unique = new Set(words)

  const linkingFound = uniqueMatches(text, LINKING_DEVICES)
  const trendFound = uniqueMatches(text, TREND_VOCAB)
  const overviewFound = hasOverviewParagraph(paragraphs)

  // 数据引用：数字（带 % / million / thousand 等）出现次数
  const dataRefs
    = (text.match(/\d[\d,.]*\s*(%|percent|million|billion|thousand)/gi) || [])
      .length
    + (text.match(/\b\d+\s*(in \d{4}|from \d{4}|to \d{4}|by \d{4})/gi) || [])
      .length

  // 对比手法：比较级 / compared to / while / whereas 等
  const comparisons = uniqueMatches(text, COMPARISON_MARKERS).length

  // 复合句比例：含从句专属标记、真从句（that/when/where/as + 主谓结构）、
  // 被动语态，或逗号两侧均为完整分句的句子占比
  let complexCount = 0
  for (const s of sentences) {
    const sl = ` ${s.toLowerCase()} `
    const hasSub = COMPLEX_MARKERS.some(m => sl.includes(` ${m} `))
    const hasTrueClause = hasTrueSubordinateClause(s)
    const hasPassive = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/.test(sl)
    const commaClause = hasCommaClause(s)
    if (hasSub || hasTrueClause || hasPassive || commaClause)
      complexCount++
  }

  const avgLen = sentences.length > 0 ? words.length / sentences.length : 0

  return {
    // 注意：words 是空白切分词数（显示/清单/历史/规则打分共用）；
    // avgSentenceLen 与 typeTokenRatio 仍按 tokenize 词数计算
    words: displayWords,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    avgSentenceLen: Math.round(avgLen * 10) / 10,
    typeTokenRatio:
      words.length > 0
        ? Math.round((unique.size / words.length) * 100) / 100
        : 0,
    linkingTotal: countMatches(
      lower,
      LINKING_DEVICES.map(
        w => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'g'),
      ),
    ),
    linkingUnique: linkingFound.length,
    trendWords: trendFound.length,
    complexRatio:
      sentences.length > 0
        ? Math.round((complexCount / sentences.length) * 100) / 100
        : 0,
    dataRefs,
    hasOverview: overviewFound,
    comparisons,
  }
}

// ---------- 四项打分 ----------

function gradeTA(stats: EssayStats): CriterionScore {
  let score = 6.0
  const strengths: string[] = []
  const improvements: string[] = []

  if (stats.words < 150) {
    score -= 1.5
    improvements.push(
      `词数只有 ${stats.words}，不足 150 会被扣分（Task 1 要求至少 150 词）`,
    )
  }
  else {
    strengths.push(`词数 ${stats.words}，达到 150 词要求`)
    if (stats.words > 220)
      improvements.push('词数偏多（>220），注意精简，避免堆砌细节冲淡重点')
  }

  if (stats.hasOverview) {
    score += 0.5
    strengths.push('检测到 overview 概述段——这是 7 分以上的关键')
  }
  else {
    score -= 1.0
    improvements.push(
      '没有检测到 overview 概述段：用 Overall / In general 开头单独一段总结主要趋势（不要放数据），这是冲 7 分的硬性要求',
    )
  }

  if (stats.dataRefs >= 5) {
    score += 0.5
    strengths.push(`引用了 ${stats.dataRefs} 处具体数据，支撑充分`)
  }
  else if (stats.dataRefs <= 2) {
    score -= 0.5
    improvements.push(
      '数据引用太少，多用具体数字支撑关键特征（如 25%、3 million）',
    )
  }

  if (stats.comparisons >= 2) {
    score += 0.25
    strengths.push(
      '能做数据间的对比（comparative / while / whereas），符合 Task 1 要求',
    )
  }
  else {
    improvements.push(
      '多做对比：用 higher than / compared with / while / whereas 突出差异，这是考官看重的',
    )
  }

  return {
    key: 'ta',
    ...CRITERION_META.ta,
    score: roundHalf(clamp(score, 4, 8.5)),
    strengths,
    improvements,
  }
}

function gradeCC(stats: EssayStats): CriterionScore {
  let score = 6.0
  const strengths: string[] = []
  const improvements: string[] = []

  if (stats.paragraphs >= 4 && stats.paragraphs <= 5) {
    score += 0.5
    strengths.push(
      `${stats.paragraphs} 段结构清晰（引言 + 概述 + 细节段是经典结构）`,
    )
  }
  else if (stats.paragraphs <= 2) {
    score -= 1.0
    improvements.push(
      `只有 ${stats.paragraphs} 段：建议分成 4 段——改写引言、overview 概述、两个细节段`,
    )
  }
  else if (stats.paragraphs >= 7) {
    score -= 0.5
    improvements.push('段落过多过碎，合并相关内容，保持 4 段左右')
  }

  if (stats.linkingUnique >= 6) {
    score += 0.5
    strengths.push(`使用了 ${stats.linkingUnique} 种衔接手段，比较灵活`)
  }
  else if (stats.linkingUnique <= 2) {
    score -= 0.5
    improvements.push(
      '衔接词太少太单一，多用 however / in contrast / while / whereas / furthermore 等连接逻辑',
    )
  }
  else {
    strengths.push(`使用了 ${stats.linkingUnique} 种衔接手段`)
  }

  if (stats.linkingTotal > stats.linkingUnique * 3 && stats.linkingTotal > 6) {
    score -= 0.25
    improvements.push('衔接词有堆砌嫌疑，注意自然融入，不要每句都用')
  }

  return {
    key: 'cc',
    ...CRITERION_META.cc,
    score: roundHalf(clamp(score, 4, 8)),
    strengths,
    improvements,
  }
}

function gradeLR(stats: EssayStats, words: string[]): CriterionScore {
  let score = 6.0
  const strengths: string[] = []
  const improvements: string[] = []

  if (stats.typeTokenRatio >= 0.55) {
    score += 0.5
    strengths.push(`词汇多样性不错（TTR ${stats.typeTokenRatio}），重复较少`)
  }
  else if (stats.typeTokenRatio < 0.42 && stats.words >= 100) {
    score -= 0.5
    improvements.push(
      `词汇重复较多（TTR ${stats.typeTokenRatio}），多用同义替换（如 increase → rise / grow / climb）`,
    )
  }

  if (stats.trendWords >= 8) {
    score += 0.5
    strengths.push(
      `趋势/程度词汇丰富（${stats.trendWords} 个），如描述变化与程度的搭配`,
    )
  }
  else if (stats.trendWords <= 3) {
    score -= 0.5
    improvements.push(
      '趋势词汇太少：积累 rise / fall / fluctuate / remain stable / dramatic / marginal 等表达',
    )
  }

  // 高频词检查：出现次数最多的实词占比
  const freq = new Map<string, number>()
  for (const w of words) {
    if (w.length >= 5)
      freq.set(w, (freq.get(w) || 0) + 1)
  }

  let topWord = ''
  let topCount = 0
  for (const [w, c] of freq) {
    if (c > topCount) {
      topCount = c
      topWord = w
    }
  }
  if (topCount >= 8 && stats.words >= 120) {
    score -= 0.25
    improvements.push(
      `"${topWord}" 出现了 ${topCount} 次，找同义词替换，避免重复扣分`,
    )
  }

  return {
    key: 'lr',
    ...CRITERION_META.lr,
    score: roundHalf(clamp(score, 4, 8)),
    strengths,
    improvements,
  }
}

function gradeGRA(stats: EssayStats): CriterionScore {
  let score = 6.0
  const strengths: string[] = []
  const improvements: string[] = []

  if (stats.complexRatio >= 0.4) {
    score += 0.5
    strengths.push(
      `复合句占比 ${Math.round(stats.complexRatio * 100)}%，句式有变化`,
    )
  }
  else if (stats.complexRatio < 0.2) {
    score -= 0.75
    improvements.push(
      '几乎全是简单句：多用定语从句（which/who）、状语从句（while/although/because）和被动语态',
    )
  }

  if (stats.avgSentenceLen >= 12 && stats.avgSentenceLen <= 24) {
    strengths.push(`平均句长 ${stats.avgSentenceLen} 词，节奏合适`)
  }
  else if (stats.avgSentenceLen < 12 && stats.sentences >= 5) {
    score -= 0.5
    improvements.push(
      `平均句长只有 ${stats.avgSentenceLen} 词，句子偏短碎，尝试合并扩展`,
    )
  }
  else if (stats.avgSentenceLen > 28) {
    score -= 0.25
    improvements.push(
      `平均句长 ${stats.avgSentenceLen} 词偏长，注意断句和标点，避免一逗到底`,
    )
  }

  if (stats.sentences < 6 && stats.words >= 120) {
    score -= 0.5
    improvements.push('句子数量太少，检查是否漏了句号或把多句写成了一句')
  }

  return {
    key: 'gra',
    ...CRITERION_META.gra,
    score: roundHalf(clamp(score, 4, 8)),
    strengths,
    improvements,
  }
}

export function gradeTask1(text: string): GradeResult {
  const trimmed = text.trim()
  const stats = analyzeEssay(trimmed)
  const words = tokenize(trimmed)

  const criteria = [
    gradeTA(stats),
    gradeCC(stats),
    gradeLR(stats, words),
    gradeGRA(stats),
  ]
  const overall = roundHalf(
    criteria.reduce((s, c) => s + c.score, 0) / criteria.length,
  )

  return { overall, criteria, stats }
}

// 供 UI 展示的四项标准说明
export const CRITERION_GUIDE: {
  key: CriterionKey
  title: string
  points: string[]
}[] = [
  {
    key: 'ta',
    title: '任务完成度 Task Achievement',
    points: [
      '不少于 150 词（20 分钟）',
      '必须有独立的 overview 段：总结主要趋势/差异/阶段，不放具体数据',
      '筛选关键特征，用数据支撑，不要机械罗列所有数字',
      '开头改写题目，不要照抄',
    ],
  },
  {
    key: 'cc',
    title: '连贯与衔接 Coherence & Cohesion',
    points: [
      '经典 4 段：改写引言 → overview → 细节段1 → 细节段2',
      '衔接词灵活多样：however / in contrast / while / whereas / furthermore',
      '逻辑递进清晰，代词指代明确',
    ],
  },
  {
    key: 'lr',
    title: '词汇资源 Lexical Resource',
    points: [
      '趋势词汇：rise / fall / fluctuate / remain stable / peak',
      '程度副词：dramatically / slightly / marginally / considerably',
      '多用同义替换，避免重复；注意拼写',
    ],
  },
  {
    key: 'gra',
    title: '语法多样性与准确性 Grammatical Range & Accuracy',
    points: [
      '长短句结合，多用复合句：定语从句、状语从句、被动语态',
      '时态准确（多用过去时描述过去数据）',
      '标点规范，避免中式逗号一逗到底',
    ],
  },
]

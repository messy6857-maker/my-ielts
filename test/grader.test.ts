import { describe, expect, it } from 'vitest'
import { analyzeEssay, gradeTask1 } from '../src/pages/writing/task1/grader'

const GOOD_ESSAY = `The bar chart compares the proportion of households with internet access in five countries in 2020.

Overall, it is clear that Country A had the highest figure, while Country E recorded the lowest. In general, developed nations tended to enjoy considerably greater internet penetration than developing ones, although the gap has narrowed over time.

In 2020, approximately 95% of households in Country A had internet access, which was significantly higher than the 90% observed in Country B. By contrast, merely 45% of households in Country E were connected, less than half the figure for Country A. Meanwhile, Countries C and D stood at 75% and 68% respectively, whereas the global average was around 60%. Consequently, the disparity between the most and least connected nations remained striking.

Although Country E lagged behind considerably, its figure had risen dramatically from just 20% in 2010, indicating rapid growth. Furthermore, the gap between the highest and lowest countries reached 50 percentage points, which underscores the persistent digital divide between wealthy and poorer regions.`

const POOR_ESSAY
  = 'the chart show internet. country A is 95%. country B is 90%. country C is 75%. country D is 68%. country E is 45%. A is high. E is low.'

describe('analyzeEssay', () => {
  it('统计词数、段落、句子', () => {
    const s = analyzeEssay(GOOD_ESSAY)
    expect(s.words).toBeGreaterThanOrEqual(150)
    expect(s.paragraphs).toBe(4)
    expect(s.sentences).toBeGreaterThan(5)
  })

  it('检测到 overview', () => {
    expect(analyzeEssay(GOOD_ESSAY).hasOverview).toBe(true)
    expect(analyzeEssay(POOR_ESSAY).hasOverview).toBe(false)
  })

  it('overview 只认段首：细节段中段出现 overall 不算', () => {
    const midParagraph = `The bar chart shows internet access in five countries in 2020.

In 2020, Country A reached 95%, which was the highest figure. Overall, sales rose steadily in most countries, but Country E lagged behind at 45%. The gap between the highest and lowest figures remained large.`
    expect(analyzeEssay(midParagraph).hasOverview).toBe(false)
  })

  it('复合句：只有 that 的句子不再算复合句', () => {
    expect(analyzeEssay('The chart shows that sales rose in 2020.').complexRatio).toBe(0)
  })

  it('复合句：逗号分隔的短语不算，逗号两侧完整分句才算', () => {
    expect(analyzeEssay('In 2020, sales rose sharply, reaching a peak, before falling back.').complexRatio).toBe(0)
    expect(analyzeEssay('Sales rose in 2020, and they fell in 2021.').complexRatio).toBe(1)
  })

  it('复合句：真正的从句标记仍算（while / which）', () => {
    expect(analyzeEssay('Sales rose while costs fell.').complexRatio).toBe(1)
    expect(analyzeEssay('Country A reached 95%, which was the highest figure.').complexRatio).toBe(1)
  })

  it('统计衔接词和趋势词汇', () => {
    const s = analyzeEssay(GOOD_ESSAY)
    expect(s.linkingUnique).toBeGreaterThanOrEqual(4)
    expect(s.trendWords).toBeGreaterThanOrEqual(4)
  })
})

describe('gradeTask1', () => {
  it('好作文总分明显高于差作文', () => {
    const good = gradeTask1(GOOD_ESSAY)
    const poor = gradeTask1(POOR_ESSAY)
    expect(good.overall).toBeGreaterThan(poor.overall + 1.5)
  })

  it('好作文 TA 不低（有 overview + 足够词数）', () => {
    const r = gradeTask1(GOOD_ESSAY)
    const ta = r.criteria.find(c => c.key === 'ta')!
    expect(ta.score).toBeGreaterThanOrEqual(6.5)
  })

  it('差作文 TA 被词数和缺 overview 拉低', () => {
    const r = gradeTask1(POOR_ESSAY)
    const ta = r.criteria.find(c => c.key === 'ta')!
    expect(ta.score).toBeLessThanOrEqual(5)
    expect(ta.improvements.length).toBeGreaterThan(0)
  })

  it('总分是四项平均（0.5 取整）', () => {
    const r = gradeTask1(GOOD_ESSAY)
    const avg = r.criteria.reduce((s, c) => s + c.score, 0) / 4
    expect(r.overall).toBe(Math.round(avg * 2) / 2)
  })

  it('空文本不崩溃', () => {
    const r = gradeTask1('')
    expect(r.overall).toBeGreaterThanOrEqual(0)
    expect(r.criteria).toHaveLength(4)
  })

  it('每项都有反馈', () => {
    const r = gradeTask1(GOOD_ESSAY)
    for (const c of r.criteria)
      expect(c.strengths.length + c.improvements.length).toBeGreaterThan(0)
  })
})

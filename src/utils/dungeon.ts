// 错词地牢：选词、出怪、判分的纯逻辑（不碰存储和界面，便于测试）
import type { WordSchedule } from '../composables/useSpacedRepetition'
import type { MistakeItem } from '../composables/useStudyData'

export interface DungeonWord {
  id: number | string
  /** 展示和判题用的主拼写 */
  word: string
  /** 可接受的全部拼写（英美变体等） */
  variants: string[]
  pos: string
  meaning: string
  chapter: string
}
/** 进门前选的词源，可以同时选多种 */
export interface DungeonSelection {
  today: boolean
  mistakes: boolean
  due: boolean
  chapters: string[]
}
export interface DungeonContext {
  /** useWordSchedule().schedules：键为 vocab:<id> */
  schedules: Record<string, WordSchedule | undefined>
  mistakes: MistakeItem[]
  now: number
}
export type QuestionKind = 'choice' | 'spell'
export type MonsterKind = 'slime' | 'bat' | 'elite' | 'boss'
export interface Monster {
  kind: MonsterKind
  word: DungeonWord
  /** 要连续答对的题型；每答对一题掉一格血 */
  phases: QuestionKind[]
  /** 选择题的四个选项（含正确答案），已打乱 */
  options: DungeonWord[]
  /** 这个词历史上错过几次（错词本次数，没有则用复习记录里的遗忘次数） */
  wrongCount: number
}

export const ROOMS_PER_RUN = 10
export const START_HEARTS = 3
/** 错到这个次数的词变成精英怪，两种题型都要答对 */
export const ELITE_WRONG_COUNT = 3
const DAY = 86400000
/** 词汇类错题：这些模块的错题能对应到词库里的词 */
const WORD_MISTAKE_MODULES = new Set([
  'flashcard',
  'typing',
  'vocabulary',
  'legacy_vocabulary',
])

export const MONSTER_LABEL: Record<MonsterKind, string> = {
  slime: '史莱姆',
  bat: '蝙蝠',
  elite: '精英怪',
  boss: 'Boss',
}
export const MONSTER_ICON: Record<MonsterKind, string> = {
  slime: '🟢',
  bat: '🦇',
  elite: '👹',
  boss: '🐉',
}

export type Rng = () => number

function norm(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface RawChapter { words: Array<Array<{ id: number | string, word: string[], pos: string, meaning: string }>> }
/** 把按章节分组的词库摊平成一个列表 */
export function flattenVocabulary(all: Record<string, RawChapter>): DungeonWord[] {
  const out: DungeonWord[] = []
  for (const [chapter, data] of Object.entries(all)) {
    for (const item of data.words.flat()) {
      const variants = (item.word ?? []).map(w => String(w).trim()).filter(Boolean)
      if (!variants.length || !String(item.meaning ?? '').trim())
        continue
      out.push({
        id: item.id,
        word: variants[0],
        variants,
        pos: item.pos ?? '',
        meaning: item.meaning,
        chapter,
      })
    }
  }
  return out
}

/** 本地今天 0 点 */
export function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
/** 这个词上次在自测里评分的时间（由到期时间和间隔倒推） */
export function lastReviewedAt(schedule: WordSchedule): number {
  return schedule.dueAt - schedule.interval * DAY
}

/** 每个词历史上错过几次：错词本次数优先，没有则用复习记录的遗忘次数 */
export function wrongCounts(words: DungeonWord[], ctx: DungeonContext): Map<DungeonWord, number> {
  const byId = new Map<string, number>()
  const byWord = new Map<string, number>()
  for (const m of ctx.mistakes) {
    if (!WORD_MISTAKE_MODULES.has(m.module))
      continue
    const flash = /^flashcard:(.+)$/.exec(m.key)
    if (flash)
      byId.set(flash[1], (byId.get(flash[1]) ?? 0) + m.count)
    else
      byWord.set(norm(m.title), (byWord.get(norm(m.title)) ?? 0) + m.count)
  }
  const out = new Map<DungeonWord, number>()
  for (const w of words) {
    const fromMistakes = (byId.get(String(w.id)) ?? 0)
      + w.variants.reduce((n, v) => n + (byWord.get(norm(v)) ?? 0), 0)
    out.set(w, fromMistakes || (ctx.schedules[`vocab:${w.id}`]?.lapses ?? 0))
  }
  return out
}
/** 今天最近一次答错这个词的时间（没有则 0） */
function mistakeTimes(words: DungeonWord[], ctx: DungeonContext): Map<DungeonWord, number> {
  const byId = new Map<string, number>()
  const byWord = new Map<string, number>()
  for (const m of ctx.mistakes) {
    if (!WORD_MISTAKE_MODULES.has(m.module))
      continue
    const flash = /^flashcard:(.+)$/.exec(m.key)
    if (flash)
      byId.set(flash[1], Math.max(byId.get(flash[1]) ?? 0, m.lastAt))
    else
      byWord.set(norm(m.title), Math.max(byWord.get(norm(m.title)) ?? 0, m.lastAt))
  }
  const out = new Map<DungeonWord, number>()
  for (const w of words)
    out.set(w, Math.max(byId.get(String(w.id)) ?? 0, ...w.variants.map(v => byWord.get(norm(v)) ?? 0)))
  return out
}

export interface SourceWords {
  /** 今天在单词自测里评过分的词，加上今天记进错词本的词 */
  today: DungeonWord[]
  /** 错词本里能对应到词库的词 */
  mistakes: DungeonWord[]
  /** 今天该复习的词 */
  due: DungeonWord[]
}
/** 各词源现在各有哪些词 */
export function sourceWords(words: DungeonWord[], ctx: DungeonContext): SourceWords {
  const dayStart = startOfDay(ctx.now)
  const counts = wrongCounts(words, { ...ctx, schedules: {} })
  const times = mistakeTimes(words, ctx)
  const today: DungeonWord[] = []
  const mistakes: DungeonWord[] = []
  const due: DungeonWord[] = []
  for (const w of words) {
    const schedule = ctx.schedules[`vocab:${w.id}`]
    const reviewedToday = !!schedule && lastReviewedAt(schedule) >= dayStart && lastReviewedAt(schedule) <= ctx.now
    if (reviewedToday || (times.get(w) ?? 0) >= dayStart)
      today.push(w)
    if ((counts.get(w) ?? 0) > 0)
      mistakes.push(w)
    if (schedule && schedule.dueAt <= ctx.now)
      due.push(w)
  }
  return { today, mistakes, due }
}

/** 按选择合并词源；同一个词在多章出现只留一个 */
export function buildPool(words: DungeonWord[], selection: DungeonSelection, ctx: DungeonContext): DungeonWord[] {
  const sources = sourceWords(words, ctx)
  const chapters = new Set(selection.chapters)
  const picked = new Set<DungeonWord>()
  if (selection.today)
    sources.today.forEach(w => picked.add(w))
  if (selection.mistakes)
    sources.mistakes.forEach(w => picked.add(w))
  if (selection.due)
    sources.due.forEach(w => picked.add(w))
  const seen = new Set<string>()
  const out: DungeonWord[] = []
  for (const w of words) {
    if (!picked.has(w) && !chapters.has(w.chapter))
      continue
    const key = norm(w.word)
    if (seen.has(key))
      continue
    seen.add(key)
    out.push(w)
  }
  return out
}

function shuffle<T>(list: T[], rng: Rng): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
/** 不放回地按权重抽 n 个 */
function weightedSample<T>(list: T[], weight: (item: T) => number, n: number, rng: Rng): T[] {
  const rest = list.map(item => ({
    item,
    w: Math.max(0.0001, weight(item)),
  }))
  const out: T[] = []
  while (out.length < n && rest.length) {
    let roll = rng() * rest.reduce((sum, r) => sum + r.w, 0)
    let index = rest.length - 1
    for (let i = 0; i < rest.length; i++) {
      roll -= rest[i].w
      if (roll < 0) {
        index = i
        break
      }
    }
    out.push(rest.splice(index, 1)[0].item)
  }
  return out
}

/** 选择题的干扰项：优先同词性，释义和拼写都不能和正确答案撞 */
export function pickOptions(word: DungeonWord, allWords: DungeonWord[], rng: Rng): DungeonWord[] {
  const taken = new Set([
    norm(word.word),
  ])
  const meanings = new Set([
    word.meaning.trim(),
  ])
  const distractors: DungeonWord[] = []
  const usable = (w: DungeonWord) => !taken.has(norm(w.word)) && !meanings.has(w.meaning.trim())
  for (const candidates of [
    allWords.filter(w => w.pos === word.pos),
    allWords,
  ]) {
    for (const w of shuffle(candidates, rng)) {
      if (distractors.length >= 3)
        break
      if (!usable(w))
        continue
      taken.add(norm(w.word))
      meanings.add(w.meaning.trim())
      distractors.push(w)
    }
  }
  return shuffle([word, ...distractors], rng)
}

/**
 * 生成一局：从选中的词里抽最多 ROOMS_PER_RUN 个（错得多的更容易抽中），
 * 其中错得最多的那个放最后当 Boss（都没错过就挑最长的词）。选中的词不够时房间数相应减少。
 */
export function buildRun(pool: DungeonWord[], allWords: DungeonWord[], ctx: DungeonContext, rng: Rng = Math.random): Monster[] {
  if (!pool.length)
    return []
  const counts = wrongCounts(pool, ctx)
  const count = (w: DungeonWord) => counts.get(w) ?? 0
  const chosen = weightedSample(pool, w => 1 + Math.min(count(w), 5), ROOMS_PER_RUN, rng)
  const boss = chosen.reduce((best, w) => {
    if (count(w) !== count(best)) {
      return count(w) > count(best)
        ? w
        : best
    }
    return w.word.length > best.word.length
      ? w
      : best
  })
  const rest = shuffle(chosen.filter(w => w !== boss), rng)
  const monsters: Monster[] = rest.map((word) => {
    const elite = count(word) >= ELITE_WRONG_COUNT
    const kind: MonsterKind = elite
      ? 'elite'
      : (rng() < 0.5
          ? 'slime'
          : 'bat')
    return {
      kind,
      word,
      phases: elite
        ? ['choice', 'spell']
        : [
            kind === 'slime'
              ? 'choice'
              : 'spell',
          ],
      options: pickOptions(word, allWords, rng),
      wrongCount: count(word),
    }
  })
  monsters.push({
    kind: 'boss',
    word: boss,
    phases: ['choice', 'spell'],
    options: pickOptions(boss, allWords, rng),
    wrongCount: count(boss),
  })
  return monsters
}

/** 拼写是否正确：不分大小写，忽略首尾和多余空格，接受任一拼写变体 */
export function checkSpelling(input: string, word: DungeonWord): boolean {
  const answer = norm(input)
  return !!answer && word.variants.some(v => norm(v) === answer)
}

/** 答对一题的得分：基础 100，连击每层 +10（最多 +100），Boss 翻倍。combo 是答对这题之后的连击数 */
export function phaseScore(combo: number, kind: MonsterKind): number {
  const base = 100 + Math.min(Math.max(combo - 1, 0), 10) * 10
  return kind === 'boss'
    ? base * 2
    : base
}

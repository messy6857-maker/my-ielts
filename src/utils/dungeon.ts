// 错词地牢：选词、出怪、判分的纯逻辑（不碰存储和界面，便于测试）
import type { WordSchedule } from '../composables/useSpacedRepetition'
import type { MistakeItem } from '../composables/useStudyData'

/** 词来自哪个词库：词汇表、阅读考点词、听力 179、我的词表 */
export type DungeonDeck = 'vocabulary' | 'reading538' | 'listening179' | 'custom'
export const DECK_LABEL: Record<DungeonDeck, string> = {
  vocabulary: '词汇表',
  reading538: '阅读考点词',
  listening179: '听力 179',
  custom: '我的词表',
}
/**
 * 各词库要不要会拼写：词汇表要会读会拼；听力词考试要填空，也要会拼；
 * 阅读考点词只要看到能认出意思、想到同义替换，不出拼写题。
 */
export const DECK_NEEDS_SPELLING: Record<DungeonDeck, boolean> = {
  vocabulary: true,
  reading538: false,
  listening179: true,
  custom: true,
}
export interface DungeonWord {
  id: number | string
  /** 全局唯一，也是复习记录的键：vocab:<id> / reading538:<id> / listening179:<id> / custom:<小写单词> */
  key: string
  deck: DungeonDeck
  /** 展示和判题用的主拼写 */
  word: string
  /** 可接受的全部拼写（英美变体等） */
  variants: string[]
  pos: string
  meaning: string
  /** 词汇表的章节；其他词库为空 */
  chapter: string
  /** 同义替换（阅读、听力考点词才有） */
  synonyms: string[]
}
/** 进门前选的词源，可以同时选多种 */
export interface DungeonSelection {
  today: boolean
  mistakes: boolean
  due: boolean
  /** 我的词表里的一个词表（list 是词表 id） */
  custom: boolean
  list?: string
  chapters: string[]
  /** 整个选中的词库（阅读考点词、听力 179） */
  decks: DungeonDeck[]
}
export interface DungeonContext {
  /** 各词库的复习记录合在一起，键就是 DungeonWord.key */
  schedules: Record<string, WordSchedule | undefined>
  mistakes: MistakeItem[]
  /** 选中的那个词表里的词（DungeonWord.key） */
  customKeys?: string[]
  now: number
}
/** choice 看释义选词；spell 听音拼写；synonym 选同义替换；timed 限时拼写 */
export type QuestionKind = 'choice' | 'spell' | 'synonym' | 'timed'
export type MonsterKind = 'slime' | 'bat' | 'mimic' | 'archer' | 'elite' | 'boss'
export interface Monster {
  kind: MonsterKind
  word: DungeonWord
  /** 要连续答对的题型；每答对一题掉一格血 */
  phases: QuestionKind[]
  /** 选择题的四个选项（含正确答案），已打乱 */
  options: DungeonWord[]
  /** 同义替换题的选项（含一个正确的），已打乱；这个词出不了同义替换题时为空 */
  synonymOptions: string[]
  /** 这个词历史上错过几次（错词本次数，没有则用复习记录里的遗忘次数） */
  wrongCount: number
}

/** buildRun 不指定房间数时的默认值 */
export const ROOMS_PER_RUN = 10
/** 每层的房间数（最后一间是该层 Boss） */
export const ROOMS_PER_FLOOR = 5
export const START_HEARTS = 3
/** 错到这个次数的词变成精英怪，两种题型都要答对 */
export const ELITE_WRONG_COUNT = 3
/** 第一层限时拼写的秒数（越往下越短，见 floorRules） */
export const TIMED_SECONDS = 15
/** 每日地牢的层数 */
export const DAILY_FLOORS = 3

export type DungeonMode = 'quick' | 'classic' | 'endless'
export interface ModeInfo { id: DungeonMode, name: string, floors: number, desc: string }
export const MODES: ModeInfo[] = [
  {
    id: 'quick',
    name: '快速',
    floors: 3,
    desc: '3 层，几分钟一局',
  },
  {
    id: 'classic',
    name: '标准',
    floors: 10,
    desc: '10 层，打穿算通关',
  },
  {
    id: 'endless',
    name: '无尽',
    floors: Number.POSITIVE_INFINITY,
    desc: '没有尽头，看你能下到第几层',
  },
]

export interface FloorRules {
  /** 这一层会出现的普通怪 */
  kinds: MonsterKind[]
  /** 普通怪随机变成精英怪（两种题型）的概率 */
  eliteChance: number
  /** 限时拼写的秒数 */
  timedSeconds: number
  /** 得分倍率 */
  scoreMultiplier: number
  /** Boss 的拼写题是否限时 */
  bossTimed: boolean
}
/**
 * 越往下越难：第 1 层只有史莱姆和蝙蝠；第 2 层起出现骷髅弓手和变形怪；
 * 第 3 层起普通怪有概率变成精英怪（每层 +15%，最多 60%），Boss 的拼写题变成限时；
 * 限时每层少 1 秒（最少 8 秒）；得分每层 +20%。
 */
export function floorRules(floor: number): FloorRules {
  const f = Math.max(1, Math.floor(floor))
  return {
    kinds: f === 1
      ? ['slime', 'bat']
      : ['slime', 'bat', 'archer', 'mimic'],
    eliteChance: f < 3
      ? 0
      : Math.min(0.6, (f - 2) * 0.15),
    timedSeconds: Math.max(8, TIMED_SECONDS - (f - 1)),
    scoreMultiplier: 1 + (f - 1) * 0.2,
    bossTimed: f >= 3,
  }
}
const DAY = 86400000
/** 词汇类错题：这些模块的错题能对应到词汇表里的词 */
const WORD_MISTAKE_MODULES = new Set([
  'flashcard',
  'typing',
  'vocabulary',
  'legacy_vocabulary',
])

export const MONSTER_LABEL: Record<MonsterKind, string> = {
  slime: '史莱姆',
  bat: '蝙蝠',
  mimic: '变形怪',
  archer: '骷髅弓手',
  elite: '精英怪',
  boss: 'Boss',
}
export const MONSTER_ICON: Record<MonsterKind, string> = {
  slime: '🟢',
  bat: '🦇',
  mimic: '🎭',
  archer: '💀',
  elite: '👹',
  boss: '🐉',
}

export type RelicId = 'heart' | 'shield' | 'letter' | 'drum' | 'scout' | 'hourglass'
export interface Relic { id: RelicId, name: string, icon: string, desc: string }
export const RELICS: Relic[] = [
  {
    id: 'heart',
    name: '生命护符',
    icon: '❤️',
    desc: '立刻多一颗心',
  },
  {
    id: 'shield',
    name: '免死金牌',
    icon: '🛡️',
    desc: '下一次答错不扣心（一次）',
  },
  {
    id: 'letter',
    name: '首字母卷轴',
    icon: '📜',
    desc: '拼写题直接显示首字母和词长',
  },
  {
    id: 'drum',
    name: '连击战鼓',
    icon: '🥁',
    desc: '连击加分翻倍',
  },
  {
    id: 'scout',
    name: '侦察之眼',
    icon: '👁️',
    desc: '选择题去掉一个错误选项',
  },
  {
    id: 'hourglass',
    name: '沙漏',
    icon: '⏳',
    desc: '限时拼写多 5 秒',
  },
]
/**
 * 三选一：从还没拿过的遗物里随机给最多三个。生命护符可以重复拿，
 * 免死金牌用掉以后（armed 为 false）可以再拿，所以层数再多也总有得选。
 */
export function offerRelics(owned: RelicId[], rng: Rng = Math.random, armed = owned.includes('shield')): Relic[] {
  const available = RELICS.filter((r) => {
    if (r.id === 'heart')
      return true
    if (r.id === 'shield')
      return !armed
    return !owned.includes(r.id)
  })
  return shuffle(available, rng).slice(0, 3)
}

export type Rng = () => number

function norm(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

interface RawChapter { words: Array<Array<{ id: number | string, word: string[], pos: string, meaning: string }>> }
/** 把按章节分组的词汇表摊平成一个列表 */
export function flattenVocabulary(all: Record<string, RawChapter>): DungeonWord[] {
  const out: DungeonWord[] = []
  for (const [chapter, data] of Object.entries(all)) {
    for (const item of data.words.flat()) {
      const variants = (item.word ?? []).map(w => String(w).trim()).filter(Boolean)
      if (!variants.length || !String(item.meaning ?? '').trim())
        continue
      out.push({
        id: item.id,
        key: `vocab:${item.id}`,
        deck: 'vocabulary',
        word: variants[0],
        variants,
        pos: item.pos ?? '',
        meaning: item.meaning,
        chapter,
        synonyms: [],
      })
    }
  }
  return out
}
function cleanSynonyms(list: unknown, word: string): string[] {
  const seen = new Set([
    norm(word),
  ])
  const out: string[] = []
  for (const raw of Array.isArray(list)
    ? list
    : []) {
    const text = String(raw ?? '').replace(/\*/g, '').trim()
    if (!text || seen.has(norm(text)))
      continue
    seen.add(norm(text))
    out.push(text)
  }
  return out
}
type RawReadingWord = [number, string, string[], string[], string[], string?]
/** 阅读考点词（reading538words）：id 和阅读自测一致（<类名>-<序号>） */
export function flattenReading(cats: Array<{ title: string, words: RawReadingWord[] }>): DungeonWord[] {
  const out: DungeonWord[] = []
  for (const cat of cats) {
    for (const w of cat.words) {
      // 星号只是界面标记（that* 等），不属于拼写
      const word = String(w[1] ?? '').replace(/\*/g, '').trim()
      const meaning = (w[3] ?? []).join('；').trim()
      if (!word || !meaning)
        continue
      const id = `${cat.title}-${w[0]}`
      out.push({
        id,
        key: `reading538:${id}`,
        deck: 'reading538',
        word,
        variants: [word],
        pos: (w[2] ?? []).join(' ').trim() || '短语',
        meaning,
        chapter: '',
        synonyms: cleanSynonyms(w[4], word),
      })
    }
  }
  return out
}
/** 听力 179 考点词（listening179.json） */
export function flattenListening(list: Array<{ index: number, word: string, type?: string, meaning: string, replace?: string[] }>): DungeonWord[] {
  const out: DungeonWord[] = []
  for (const w of list) {
    const word = String(w.word ?? '').trim()
    const meaning = String(w.meaning ?? '').trim()
    if (!word || !meaning)
      continue
    out.push({
      id: w.index,
      key: `listening179:${w.index}`,
      deck: 'listening179',
      word,
      variants: [word],
      pos: w.type || '短语',
      meaning,
      chapter: '',
      synonyms: cleanSynonyms(w.replace, word),
    })
  }
  return out
}

/** 我的词表里的词（没有释义的出不了题，跳过）；id 和 key 跟学新词里的一样，进度共用 */
export function flattenWordLists(entries: Array<{ word: string, meaning: string, pos: string, synonyms: string[] }>): DungeonWord[] {
  const out: DungeonWord[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const word = e.word.trim().replace(/\s+/g, ' ')
    const id = word.toLowerCase()
    const meaning = e.meaning.trim()
    if (!word || !meaning || seen.has(id))
      continue
    seen.add(id)
    out.push({
      id,
      key: `custom:${id}`,
      deck: 'custom',
      word,
      variants: [word],
      pos: e.pos,
      meaning,
      chapter: '',
      synonyms: cleanSynonyms(e.synonyms, word),
    })
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

/** 错词本里的词汇类错题，按词的 key 或拼写归类后取某个数值 */
function mistakeIndex(ctx: DungeonContext, pick: (m: MistakeItem) => number, merge: (a: number, b: number) => number) {
  const byKey = new Map<string, number>()
  const byWord = new Map<string, number>()
  const put = (map: Map<string, number>, key: string, value: number) => map.set(key, map.has(key)
    ? merge(map.get(key)!, value)
    : value)
  for (const m of ctx.mistakes) {
    const flash = /^flashcard:(.+)$/.exec(m.key)
    if (/^(?:reading538|listening179|custom):/.test(m.key))
      put(byKey, m.key, pick(m))
    else if (!WORD_MISTAKE_MODULES.has(m.module))
      continue
    else if (flash)
      put(byKey, `vocab:${flash[1]}`, pick(m))
    else
      put(byWord, norm(m.title), pick(m))
  }
  return (w: DungeonWord): number[] => {
    const values: number[] = []
    if (byKey.has(w.key))
      values.push(byKey.get(w.key)!)
    // 拼写、打字类错题只记了单词本身，只对应词汇表里的词
    if (w.deck === 'vocabulary') {
      for (const v of w.variants) {
        if (byWord.has(norm(v)))
          values.push(byWord.get(norm(v))!)
      }
    }
    return values
  }
}
/** 每个词历史上错过几次：错词本次数优先，没有则用复习记录的遗忘次数 */
export function wrongCounts(words: DungeonWord[], ctx: DungeonContext): Map<DungeonWord, number> {
  const lookup = mistakeIndex(ctx, m => m.count, (a, b) => a + b)
  const out = new Map<DungeonWord, number>()
  for (const w of words) {
    const fromMistakes = lookup(w).reduce((n, v) => n + v, 0)
    out.set(w, fromMistakes || (ctx.schedules[w.key]?.lapses ?? 0))
  }
  return out
}
/** 最近一次答错这个词的时间（没有则 0） */
function mistakeTimes(words: DungeonWord[], ctx: DungeonContext): Map<DungeonWord, number> {
  const lookup = mistakeIndex(ctx, m => m.lastAt, Math.max)
  const out = new Map<DungeonWord, number>()
  for (const w of words)
    out.set(w, Math.max(0, ...lookup(w)))
  return out
}

export interface SourceWords {
  /** 今天在各个自测里评过分的词，加上今天记进错词本的词 */
  today: DungeonWord[]
  /** 错词本里能对应到词库的词 */
  mistakes: DungeonWord[]
  /** 今天该复习的词 */
  due: DungeonWord[]
  /** 选中的那个词表 */
  custom: DungeonWord[]
}
/** 各词源现在各有哪些词 */
export function sourceWords(words: DungeonWord[], ctx: DungeonContext): SourceWords {
  const dayStart = startOfDay(ctx.now)
  const counts = wrongCounts(words, { ...ctx, schedules: {} })
  const times = mistakeTimes(words, ctx)
  const today: DungeonWord[] = []
  const mistakes: DungeonWord[] = []
  const due: DungeonWord[] = []
  const customKeys = new Set(ctx.customKeys ?? [])
  const custom = words.filter(w => customKeys.has(w.key))
  for (const w of words) {
    const schedule = ctx.schedules[w.key]
    const reviewedToday = !!schedule && lastReviewedAt(schedule) >= dayStart && lastReviewedAt(schedule) <= ctx.now
    if (reviewedToday || (times.get(w) ?? 0) >= dayStart)
      today.push(w)
    if ((counts.get(w) ?? 0) > 0)
      mistakes.push(w)
    if (schedule && schedule.dueAt <= ctx.now)
      due.push(w)
  }
  return { today, mistakes, due, custom }
}

/** 按选择合并词源；同一个词在多章出现只留一个 */
export function buildPool(words: DungeonWord[], selection: DungeonSelection, ctx: DungeonContext): DungeonWord[] {
  const sources = sourceWords(words, ctx)
  const chapters = new Set(selection.chapters)
  const decks = new Set<DungeonDeck>(selection.decks)
  const picked = new Set<DungeonWord>()
  if (selection.custom)
    sources.custom.forEach(w => picked.add(w))
  if (selection.today)
    sources.today.forEach(w => picked.add(w))
  if (selection.mistakes)
    sources.mistakes.forEach(w => picked.add(w))
  if (selection.due)
    sources.due.forEach(w => picked.add(w))
  const seen = new Set<string>()
  const out: DungeonWord[] = []
  for (const w of words) {
    const wholeDeck = w.deck === 'vocabulary'
      ? chapters.has(w.chapter)
      : decks.has(w.deck)
    if (!picked.has(w) && !wholeDeck)
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

/** 同义替换题的选项：一个正确的同义词加三个别的词的同义词；凑不齐返回空（这个词出不了这种题） */
export function pickSynonymOptions(word: DungeonWord, allWords: DungeonWord[], rng: Rng): string[] {
  if (!word.synonyms.length)
    return []
  const own = new Set([
    norm(word.word),
    ...word.synonyms.map(norm),
  ])
  const others = new Set<string>()
  const distractors: string[] = []
  for (const other of shuffle(allWords.filter(w => w !== word && w.synonyms.length), rng)) {
    if (distractors.length >= 3)
      break
    // 别的词如果和这个词互为同义（共享同义词），它的同义词不能当干扰项
    if (own.has(norm(other.word)) || other.synonyms.some(sy => own.has(norm(sy))))
      continue
    const candidate = shuffle(other.synonyms, rng).find(sy => !others.has(norm(sy)))
    if (!candidate)
      continue
    others.add(norm(candidate))
    distractors.push(candidate)
  }
  if (distractors.length < 3)
    return []
  const answer = word.synonyms[Math.floor(rng() * word.synonyms.length)]
  return shuffle([answer, ...distractors], rng)
}
/** 同义替换题选得对不对 */
export function isSynonym(option: string, word: DungeonWord): boolean {
  return word.synonyms.some(sy => norm(sy) === norm(option))
}

export interface RunOptions {
  /** 房间数（含 Boss），默认 ROOMS_PER_RUN */
  rooms?: number
  /** 第几层：决定出哪些怪、多难；不给就是所有怪都可能出、没有额外难度 */
  floor?: number
  /** 这一局已经出过的词（DungeonWord.key）：优先出没出过的，全出过一轮后重新开始；会被本函数更新 */
  used?: Set<string>
}
/**
 * 生成一组房间：从选中的词里抽（错得多的更容易抽中），其中错得最多的那个放最后当 Boss
 * （都没错过就挑最长的词）。选中的词不够时房间数相应减少。
 */
export function buildRun(pool: DungeonWord[], allWords: DungeonWord[], ctx: DungeonContext, rng: Rng = Math.random, options: RunOptions = {}): Monster[] {
  if (!pool.length)
    return []
  const rooms = Math.min(options.rooms ?? ROOMS_PER_RUN, pool.length)
  const rules = options.floor === undefined
    ? null
    : floorRules(options.floor)
  const counts = wrongCounts(pool, ctx)
  const count = (w: DungeonWord) => counts.get(w) ?? 0
  const weight = (w: DungeonWord) => 1 + Math.min(count(w), 5)
  const used = options.used
  let fresh = used
    ? pool.filter(w => !used.has(w.key))
    : pool
  if (used && fresh.length === 0) {
    used.clear()
    fresh = pool
  }
  const chosen = weightedSample(fresh, weight, rooms, rng)
  // 没出过的词不够一层：用出过的词补齐，然后从头算新一轮
  if (chosen.length < rooms) {
    chosen.push(...weightedSample(pool.filter(w => !chosen.includes(w)), weight, rooms - chosen.length, rng))
    used?.clear()
  }
  chosen.forEach(w => used?.add(w.key))
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
  const make = (word: DungeonWord, isBoss: boolean): Monster => {
    const synonymOptions = pickSynonymOptions(word, allWords, rng)
    let single: Array<[MonsterKind, QuestionKind]> = [
      ['slime', 'choice'],
      ['bat', 'spell'],
      ['archer', 'timed'],
    ]
    if (synonymOptions.length)
      single.push(['mimic', 'synonym'])
    if (rules)
      single = single.filter(([kind]) => rules.kinds.includes(kind))
    // 不要求拼写的词：不出蝙蝠、骷髅弓手；精英怪和 Boss 也换成认词 + 同义替换
    const spelling = DECK_NEEDS_SPELLING[word.deck]
    if (!spelling)
      single = single.filter(([, q]) => q === 'choice' || q === 'synonym')
    const [kind, question] = single[Math.floor(rng() * single.length)]
    const elite = !isBoss && (count(word) >= ELITE_WRONG_COUNT || (!!rules && rules.eliteChance > 0 && rng() < rules.eliteChance))
    let phases: QuestionKind[] = [question]
    const recognize: QuestionKind[] = synonymOptions.length
      ? ['choice', 'synonym']
      : ['choice']
    if (isBoss) {
      const last: QuestionKind = rules?.bossTimed
        ? 'timed'
        : 'spell'
      phases = spelling
        ? [...recognize, last]
        : recognize
    }
    else if (elite) {
      phases = spelling
        ? [
            synonymOptions.length && rng() < 0.5
              ? 'synonym'
              : 'choice',
            'spell',
          ]
        : recognize
    }
    return {
      kind: isBoss
        ? 'boss'
        : (elite ? 'elite' : kind),
      word,
      phases,
      options: pickOptions(word, allWords, rng),
      synonymOptions,
      wrongCount: count(word),
    }
  }
  return [
    ...rest.map(w => make(w, false)),
    make(boss, true),
  ]
}
/** 生成第 floor 层的房间 */
export function buildFloor(pool: DungeonWord[], allWords: DungeonWord[], ctx: DungeonContext, rng: Rng, floor: number, used: Set<string>): Monster[] {
  return buildRun(pool, allWords, ctx, rng, { rooms: ROOMS_PER_FLOOR, floor, used })
}

/** 拼写是否正确：不分大小写，忽略首尾和多余空格，接受任一拼写变体 */
export function checkSpelling(input: string, word: DungeonWord): boolean {
  const answer = norm(input)
  return !!answer && word.variants.some(v => norm(v) === answer)
}

/**
 * 答对一题的得分：基础 100，连击每层 +10（最多 +100，有连击战鼓翻倍），Boss 翻倍，
 * 再乘所在层的倍率。combo 是答对这题之后的连击数
 */
export function phaseScore(combo: number, kind: MonsterKind, doubleCombo = false, multiplier = 1): number {
  const bonus = Math.min(Math.max(combo - 1, 0), 10) * 10 * (doubleCombo ? 2 : 1)
  return Math.round((100 + bonus) * (kind === 'boss'
    ? 2
    : 1) * multiplier)
}

/** 可复现的随机数：同一个种子每次给出同一串数（每日地牢用日期当种子） */
export function seededRng(seed: string): Rng {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let state = h >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type DailySource = 'today' | 'due' | 'mistakes' | 'all'
export const DAILY_SOURCE_LABEL: Record<DailySource, string> = {
  today: '今天学的词',
  due: '到期复习的词',
  mistakes: '错词',
  all: '词汇表',
}
/** 每日地牢打哪些词：今天学的；今天还没学就用到期复习的；再没有用错词；都没有就从整个词汇表里出 */
export function dailyPool(words: DungeonWord[], ctx: DungeonContext): { from: DailySource, pool: DungeonWord[] } {
  const none: DungeonSelection = {
    today: false,
    mistakes: false,
    due: false,
    custom: false,
    chapters: [],
    decks: [],
  }
  for (const from of ['today', 'due', 'mistakes'] as const) {
    const pool = buildPool(words, { ...none, [from]: true }, ctx)
    if (pool.length)
      return { from, pool }
  }
  return {
    from: 'all',
    pool: words.filter(w => w.deck === 'vocabulary'),
  }
}

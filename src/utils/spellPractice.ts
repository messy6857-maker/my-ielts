import type { WordSchedule } from '../composables/useSpacedRepetition'
import type { MistakeItem } from '../composables/useStudyData'
import type { DiffChar } from './corpusSpelling'
import type { StudyCard } from './studyDeck'
import { markMissed } from './corpusSpelling'

// 练拼写：取词、判分、记错规则（不碰存储和界面，便于测试）。
// 所有练法共用一套判分：不分大小写，忽略首尾和多余空格，多种写法都算对。

/** 听写：只听发音；看义拼写：看释义、听发音；跟打：看着单词打一遍；带同义替换：拼完再写同义替换（听力 179） */
export type SpellMode = 'dictation' | 'meaning' | 'typing' | 'synonym'
export const SPELL_MODES: Array<{ id: SpellMode, label: string, desc: string }> = [
  { id: 'dictation', label: '听写', desc: '只听发音，把词拼出来' },
  { id: 'meaning', label: '看义拼写', desc: '看释义、听发音，把词拼出来' },
  { id: 'typing', label: '跟打', desc: '看着单词打一遍，练手感' },
  { id: 'synonym', label: '带同义替换', desc: '拼完单词，再写出它的同义替换' },
]
/** 词从哪里来 */
export type SpellSource = 'vocabulary' | 'listening179' | 'corpus' | 'mistakes' | 'today' | 'custom'
export const SPELL_SOURCES: Array<{ id: SpellSource, label: string }> = [
  { id: 'vocabulary', label: '词汇表' },
  { id: 'listening179', label: '听力 179' },
  { id: 'corpus', label: '听力语料库' },
  { id: 'mistakes', label: '拼错过的词' },
  { id: 'today', label: '今天学的词' },
  { id: 'custom', label: '我的词表' },
]
export type CorpusChapterId = 'ch2' | 'ch3' | 'ch4'
export const CORPUS_CHAPTERS: Array<{ id: CorpusChapterId, label: string }> = [
  { id: 'ch2', label: '拼写规范' },
  { id: 'ch3', label: '特别名词' },
  { id: 'ch4', label: '形容词副词' },
]

export function normalizeSpelling(text: string): string {
  return text.toLowerCase().trim().replace(/[\xA0\u2000-\u200B\u202F\u205F\u3000]/g, ' ').replace(/\s+/g, ' ')
}
/** 拼对了返回匹配上的那个写法，否则返回 null */
export function matchSpelling(input: string, card: StudyCard): string | null {
  const answer = normalizeSpelling(input)
  if (!answer)
    return null
  return card.spellings.find(s => normalizeSpelling(s) === answer) ?? null
}
/** 输入最接近的那个正确写法，并标出其中没写对的字母 */
export function diffSpelling(input: string, card: StudyCard): DiffChar[] {
  let best = card.word
  let bestScore = Number.NEGATIVE_INFINITY
  for (const s of card.spellings) {
    const score = markMissed(input.trim(), s).filter(c => c.ok).length - s.length
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return markMissed(input.trim(), best)
}
/** 同义替换：用中英文逗号分开写，返回没写出来的那些 */
export function missingSynonyms(input: string, card: StudyCard): string[] {
  const written = new Set(input.split(/[,，]/).map(normalizeSpelling).filter(Boolean))
  return card.synonyms.filter(s => !written.has(normalizeSpelling(s)))
}
/** 跟打：已输入的部分里有没有打错的字母（和主拼写逐个字母比，不分大小写） */
export function typedWrong(input: string, card: StudyCard): boolean {
  const target = card.word.toLowerCase()
  const typed = input.toLowerCase()
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== target[i])
      return true
  }
  return false
}

/**
 * 边打边显示对错（听写、看义拼写用）：只标已经打出来的字母，不透露还剩几个。
 * 有多种写法时，和前缀对得最多的那个写法比；不分大小写。
 */
export function liveLetters(input: string, card: Pick<StudyCard, 'spellings' | 'word'>): Array<{ char: string, ok: boolean }> {
  const typed = input.toLowerCase()
  const prefixLength = (s: string) => {
    const target = s.toLowerCase()
    let n = 0
    while (n < typed.length && typed[n] === target[n])
      n++
    return n
  }
  let best = card.word
  let bestLength = -1
  for (const s of card.spellings.length
    ? card.spellings
    : [card.word]) {
    const n = prefixLength(s)
    if (n > bestLength) {
      best = s
      bestLength = n
    }
  }
  const target = best.toLowerCase()
  return [...input].map((char, i) => ({ char, ok: typed[i] === target[i] }))
}

export interface SpellMistake {
  module: 'vocabulary' | 'typing' | 'listening' | 'corpus' | 'wordlist'
  entry: { key: string, title: string, detail: string, hint?: string }
}
/** 拼错记到原来的错题分组：词汇表 → 词汇拼写（跟打 → 打字练习），听力 179 → 听力，语料库 → 语料库 */
export function spellMistake(card: StudyCard, mode: SpellMode): SpellMistake | null {
  const detail = `${card.pos} ${card.meaning}`.trim()
  if (card.deck === 'vocabulary') {
    return mode === 'typing'
      ? {
          module: 'typing',
          entry: {
            key: `typing:${card.word}`,
            title: card.word,
            detail,
            hint: card.example,
          },
        }
      : {
          module: 'vocabulary',
          entry: {
            key: `spelling:${card.id}`,
            title: card.spellings.join(' / '),
            detail,
            hint: card.example,
          },
        }
  }
  if (card.deck === 'listening179') {
    return {
      module: 'listening',
      entry: { key: `listening179:${card.id}`, title: card.word, detail: `${detail}；同义替换：${card.synonyms.join(' / ')}` },
    }
  }
  if (card.deck === 'corpus') {
    return {
      module: 'corpus',
      entry: {
        key: `corpus:${card.id}`,
        title: card.word,
        detail,
        hint: card.note || card.spellings.join(' / '),
      },
    }
  }
  if (card.deck === 'custom') {
    return {
      module: 'wordlist',
      entry: { key: card.key, title: card.word, detail },
    }
  }
  return null
}

/** 同一个词在词汇表多章出现时只留第一张 */
export function uniqueByWord(cards: StudyCard[]): StudyCard[] {
  const seen = new Set<string>()
  return cards.filter((c) => {
    const key = c.deck === 'vocabulary'
      ? `vocabulary:${normalizeSpelling(c.word)}`
      : c.key
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}
/** 错词本里拼错过的词（词汇拼写、打字练习、听力 179、语料库的错题） */
export function mistakenCards(cards: StudyCard[], mistakes: MistakeItem[]): StudyCard[] {
  const keys = new Set(mistakes.map(m => m.key))
  return uniqueByWord(cards.filter((c) => {
    if (c.deck === 'vocabulary')
      return keys.has(`spelling:${c.id}`) || c.spellings.some(s => keys.has(`typing:${s}`))
    return keys.has(c.key)
  }))
}
const DAY = 86400000
/** 今天在卡片自测里评过分的词（由到期时间和间隔倒推上次评分时间） */
export function todayCards(cards: StudyCard[], schedule: (card: StudyCard) => WordSchedule | undefined, now = Date.now()): StudyCard[] {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return uniqueByWord(cards.filter((c) => {
    const s = schedule(c)
    if (!s)
      return false
    const at = s.dueAt - s.interval * DAY
    return at >= start.getTime() && at <= now
  }))
}

/**
 * 取一轮的词。词汇表按章节练时，没拼过的排前面、按词表顺序；其他词源打乱。
 * size 为 0 表示全部。
 */
export function pickSpellRound(cards: StudyCard[], size: number, options: { answered?: (card: StudyCard) => boolean, rng?: () => number } = {}): StudyCard[] {
  let out = [...cards]
  if (options.answered) {
    const answered = options.answered
    out = [
      ...out.filter(c => !answered(c)),
      ...out.filter(c => answered(c)),
    ]
  }
  else {
    const rng = options.rng ?? Math.random
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
  }
  return size > 0
    ? out.slice(0, size)
    : out
}

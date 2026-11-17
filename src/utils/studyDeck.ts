// 统一卡片自测：各词库的卡片数据和它们对应的记录（复习进度、错题、统计、进度条），不碰存储和界面
import type { MistakeModule, ProgressModule } from '../composables/useStudyData'
import { buildCorpusWords } from './corpusSpelling'

// custom 是“我的词表”：自己导入或从网站词库里选的词，进度和网站词库分开记
export type DeckId = 'vocabulary' | 'reading538' | 'listening179' | 'corpus' | 'custom'
export const DECK_IDS: DeckId[] = [
  'vocabulary',
  'reading538',
  'listening179',
  'corpus',
  'custom',
]

export interface DeckMeta {
  name: string
  /** 卡片自测记错题的分组（和原来各自测页一致） */
  mistakeModule: MistakeModule
  /** 学习统计里自评次数的分类 */
  attemptNs: string
  /** 首页进度条（词汇表按章节另算，见 progressKey） */
  progressModule: ProgressModule
}
export const DECK_META: Record<DeckId, DeckMeta> = {
  vocabulary: {
    name: '词汇表',
    mistakeModule: 'flashcard',
    attemptNs: 'vocabulary',
    progressModule: 'flashcard',
  },
  reading538: {
    name: '阅读考点词',
    mistakeModule: 'reading',
    attemptNs: 'reading538',
    progressModule: 'reading_flashcard',
  },
  listening179: {
    name: '听力 179',
    mistakeModule: 'listening',
    attemptNs: 'listening179',
    progressModule: 'listening_flashcard',
  },
  corpus: {
    name: '听力语料库',
    mistakeModule: 'corpus',
    attemptNs: 'corpus',
    progressModule: 'corpus_flashcard',
  },
  custom: {
    name: '我的词表',
    mistakeModule: 'wordlist',
    attemptNs: 'custom',
    progressModule: 'custom_flashcard',
  },
}

export interface StudyCard {
  /** 全局唯一：<词库>:<id> */
  key: string
  deck: DeckId
  /** 和原来各自测页相同的 id（复习进度、错题都按它记） */
  id: string | number
  word: string
  /** 所有算对的拼写（词汇表的多种写法、语料库的英式美式）；第一个就是 word */
  spellings: string[]
  pos: string
  meaning: string
  /** 词汇表的章节；其他词库为空 */
  chapter: string
  /** 同义替换（阅读、听力考点词） */
  synonyms: string[]
  /** 阅读考点词的备注 */
  remark: string
  /** 拼写要点（语料库：英美写法、特别名词的注意点） */
  note: string
  /** 词汇表的例句和拓展词（详情懒加载后补上） */
  example: string
  extra: string
  hintWords: string[]
}

function card(deck: DeckId, id: string | number, fields: Partial<StudyCard> & Pick<StudyCard, 'word' | 'meaning'>): StudyCard {
  return {
    key: `${deck}:${id}`,
    deck,
    id,
    pos: '',
    chapter: '',
    synonyms: [],
    remark: '',
    note: '',
    example: '',
    extra: '',
    hintWords: [],
    spellings: [fields.word],
    ...fields,
  }
}

interface RawVocabularyWord { id: number | string, word: string[], pos: string, meaning: string, example?: string, extra?: string }
/**
 * 词汇表：按词条所在章节标记（同一个词出现在多章时各是一张卡、各自一份进度）。
 * chapterOf 给出词条 id 所在的章节（vocabularyMeta 的 WORD_CHAPTER_INDEX）。
 */
export function vocabularyCards(
  chapters: Record<string, { words: RawVocabularyWord[][] }>,
  chapterOf: (id: string | number) => string | undefined,
): StudyCard[] {
  const out: StudyCard[] = []
  for (const [chapter, data] of Object.entries(chapters)) {
    for (const w of data.words.flat()) {
      const word = w.word?.[0]
      if (!word)
        continue
      out.push(card('vocabulary', w.id, {
        word,
        spellings: w.word.filter(s => typeof s === 'string' && s.trim()),
        pos: w.pos ?? '',
        meaning: w.meaning ?? '',
        chapter: chapterOf(w.id) ?? chapter,
        example: w.example ?? '',
        extra: w.extra ?? '',
      }))
    }
  }
  return out
}

type RawReadingWord = [number, string, string[], string[], string[], string?]
/** 阅读考点词：id 为 <类名>-<序号>，和原阅读自测一致；词性为空的是短语 */
export function readingCards(cats: Array<{ title: string, words: RawReadingWord[] }>): StudyCard[] {
  return cats.flatMap(cat => cat.words.map(w => card('reading538', `${cat.title}-${w[0]}`, {
    word: w[1],
    pos: (w[2] || []).join(' ') || '短语',
    meaning: (w[3] || []).join('；'),
    synonyms: w[4] || [],
    remark: w[5] || '',
  })))
}

/** 听力 179：id 为序号；type 为空的是短语 */
export function listeningCards(list: Array<{ index: number, word: string, type?: string, meaning: string, replace?: string[] }>): StudyCard[] {
  return list.map(w => card('listening179', w.index, {
    word: w.word,
    pos: w.type || '短语',
    meaning: w.meaning,
    synonyms: Array.isArray(w.replace)
      ? w.replace
      : [],
  }))
}

/** 听力语料库：id 和原语料库自测一致（ch2-序号 / ch3-序号 / ch4-词） */
export function corpusCards(data: Parameters<typeof buildCorpusWords>[0]): StudyCard[] {
  return buildCorpusWords(data).map(w => card('corpus', w.id, {
    word: w.word,
    spellings: w.accepted,
    pos: w.pos,
    meaning: w.meaning,
    note: [
      w.chapter === 'ch3' && w.note
        ? `注意：${w.note}`
        : w.note,
      w.accepted.length > 1 && w.chapter !== 'ch2'
        ? `也可写作 ${w.accepted.slice(1).join(' / ')}`
        : '',
    ]
      .filter(Boolean)
      .join('；'),
  }))
}

/** 错题记录的键：词汇表沿用 flashcard:<id>，其他词库沿用 <词库>:<id> */
export function mistakeKey(c: StudyCard): string {
  return c.deck === 'vocabulary'
    ? `flashcard:${c.id}`
    : `${c.deck}:${c.id}`
}
/** 记错题时附的提示：词汇表用例句，考点词用同义替换，语料库用拼写要点 */
export function mistakeHint(c: StudyCard): string {
  if (c.deck === 'vocabulary')
    return c.example || `${c.word}: ${c.meaning}`
  if (c.deck === 'corpus')
    return c.note || c.word
  return c.synonyms.slice(0, 4).join(' / ')
}
/** 发音地址（相对路径由调用方用 resolveAudioUrl 补全）；阅读考点词用有道发音，去掉界面上的星号标记 */
export function audioPath(c: StudyCard): { local: string } | { remote: string } {
  if (c.deck === 'vocabulary')
    return { local: `vocabulary/audio/${c.chapter}/${c.word}.mp3` }
  if (c.deck === 'reading538') {
    const clean = c.word.replace(/\*/g, '')
    return { remote: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=1` }
  }
  if (c.deck === 'custom')
    return { remote: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(c.word)}&type=1` }
  return { local: `179_audios/${c.word}.mp3` }
}

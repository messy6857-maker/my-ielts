import type { StudyCard } from './studyDeck'
import { nsKey } from '../composables/useStudyData'
import { readValue, saveValue } from './storage'
import { readWordList } from './wordList'

// “我的词表”：自己建的词表，可以有多个、可以起名字。词可以粘贴、上传文件导入，也可以从网站词库里选。
// 词表里的词是一份独立的拷贝（deck = custom），学习进度和网站词库分开记，按单词本身记（同一个词在两个词表里是同一份进度）。
// 目前只存在这台设备的这个账号下，不参与云同步和备份。

export interface ListEntry {
  word: string
  meaning: string
  pos: string
  synonyms: string[]
}
export interface WordList {
  id: string
  name: string
  words: ListEntry[]
  updatedAt: number
}
const LISTS_KEY = 'study_wordlists_v1'
export const MAX_LIST_WORDS = 3000
/** 以前单词地牢和听写用的“我的词单”，第一次打开时搬成一个普通词表（id 固定，名字叫“我的词单”） */
export const DUNGEON_LIST_ID = 'dungeon'
export const DUNGEON_LIST_NAME = '我的词单'
const MIGRATED_KEY = 'study_wordlists_migrated_v1'
/** 听写、单词地牢往哪个词表里加词（记住上次选的） */
const TARGET_KEY = 'study_wordlist_target_v1'

export function entryId(word: string): string {
  return word.toLowerCase().trim().replace(/\s+/g, ' ')
}
function cleanEntry(raw: any): ListEntry | null {
  const word = typeof raw?.word === 'string'
    ? raw.word.trim().replace(/\s+/g, ' ')
    : ''
  if (!word || word.length > 60 || !/[a-z]/i.test(word))
    return null
  return {
    word,
    meaning: typeof raw.meaning === 'string'
      ? raw.meaning.trim().slice(0, 200)
      : '',
    pos: typeof raw.pos === 'string'
      ? raw.pos.trim().slice(0, 30)
      : '',
    synonyms: Array.isArray(raw.synonyms)
      ? raw.synonyms.filter((s: unknown): s is string => typeof s === 'string' && !!s.trim()).slice(0, 12)
      : [],
  }
}
/** 去掉重复的词（不分大小写），后面的同一个词补上前面缺的释义 */
export function mergeEntries(existing: ListEntry[], incoming: ListEntry[]): { words: ListEntry[], added: number, filled: number } {
  const words = existing.map(e => ({ ...e }))
  const index = new Map(words.map((e, i) => [
    entryId(e.word),
    i,
  ]))
  let added = 0
  let filled = 0
  for (const raw of incoming) {
    const e = cleanEntry(raw)
    if (!e)
      continue
    const at = index.get(entryId(e.word))
    if (at === undefined) {
      if (words.length >= MAX_LIST_WORDS)
        continue
      index.set(entryId(e.word), words.length)
      words.push(e)
      added++
    }
    else if (!words[at].meaning && e.meaning) {
      words[at] = {
        ...words[at],
        meaning: e.meaning,
        pos: words[at].pos || e.pos,
        synonyms: words[at].synonyms.length ? words[at].synonyms : e.synonyms,
      }
      filled++
    }
  }
  return { words, added, filled }
}
export function readLists(): WordList[] {
  const saved = readValue<unknown>(nsKey(LISTS_KEY), [])
  if (!Array.isArray(saved))
    return []
  const out: WordList[] = []
  for (const raw of saved) {
    if (!raw || typeof raw.id !== 'string' || !raw.id || out.some(l => l.id === raw.id))
      continue
    out.push({
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, 40)
        : '未命名词表',
      words: mergeEntries([], Array.isArray(raw.words)
        ? raw.words
        : []).words,
      updatedAt: Number(raw.updatedAt) || 0,
    })
  }
  return out
}
export function saveLists(lists: WordList[]) {
  saveValue(nsKey(LISTS_KEY), lists)
}
export function newList(name: string): WordList {
  return {
    id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 40) || '未命名词表',
    words: [],
    updatedAt: Date.now(),
  }
}

const POS_RE = /^((?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|art|aux|phr|abbr)\.\s*(?:[/&,]\s*)?)+)(.*)$/i
/**
 * 解析导入的文本：一行一个词，后面可以带释义。
 * 认得的写法：“abandon 放弃”“abandon,放弃”“abandon\t放弃”“abandon v. 放弃”“take off - 起飞”，也可以只有单词。
 * 没有字母的行（标题、空行、序号）跳过。
 */
export function parseImport(text: string): { entries: ListEntry[], skipped: number } {
  const entries: ListEntry[] = []
  let skipped = 0
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let line = rawLine.trim().replace(/^\d+[.、)）]\s*/, '')
    if (!line)
      continue
    // CSV 里带引号的格子
    line = line.replace(/"([^"]*)"/g, (_, inner: string) => inner.replace(/,/g, '，'))
    let word = line
    let rest = ''
    const tab = line.indexOf('\t')
    const cjk = line.search(/[㐀-鿿]/)
    const comma = line.search(/[,，;；]/)
    if (tab > 0) {
      word = line.slice(0, tab)
      rest = line.slice(tab + 1)
    }
    else if (comma > 0 && (cjk < 0 || comma < cjk)) {
      word = line.slice(0, comma)
      rest = line.slice(comma + 1)
    }
    else if (cjk > 0) {
      word = line.slice(0, cjk)
      rest = line.slice(cjk)
    }
    word = word.trim()
    // “abandon v.” 这种把词性写在单词后面的
    let pos = ''
    const tail = /^(.*?[a-z])\s+((?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|art|aux|phr|abbr)\.\s*(?:[/&]\s*)?)+)$/i.exec(word)
    if (tail) {
      word = tail[1]
      pos = tail[2].trim()
    }
    word = word.replace(/[\s\-–—:：=|]+$/, '').trim()
    rest = rest.replace(/\t/g, ' ').replace(/^[\s\-–—:：=|,，]+/, '').trim()
    const lead = POS_RE.exec(rest)
    if (lead && lead[1].trim()) {
      pos = pos || lead[1].trim()
      rest = lead[2].trim()
    }
    const entry = cleanEntry({
      word,
      meaning: rest,
      pos,
      synonyms: [],
    })
    // 表头行（word, meaning / 单词, 释义）不算
    const header = !!entry && /^(?:words?|english)$/i.test(entry.word) && /^(?:meanings?|chinese|translation|释义|中文|意思)/i.test(entry.meaning)
    if (entry && /^[a-z]/i.test(entry.word) && !header)
      entries.push(entry)
    else skipped++
  }
  return { entries, skipped }
}

/** 网站词库里的一张卡，拷贝成词表里的一个词 */
export function entryFromCard(card: StudyCard): ListEntry {
  return {
    word: card.word.replace(/\*/g, '').trim(),
    meaning: card.meaning,
    pos: card.pos === '短语'
      ? ''
      : card.pos,
    synonyms: card.synonyms.slice(0, 12),
  }
}
/** 词表里的一个词变成一张可以学的卡（id 是小写的单词本身） */
export function entryCard(entry: ListEntry): StudyCard {
  const id = entryId(entry.word)
  return {
    key: `custom:${id}`,
    deck: 'custom',
    id,
    word: entry.word,
    spellings: [entry.word],
    pos: entry.pos,
    meaning: entry.meaning,
    chapter: '',
    synonyms: entry.synonyms,
    remark: '',
    note: '',
    example: '',
    extra: '',
    hintWords: [],
  }
}
/** 给没有释义的词在网站词库里找释义（先精确匹配单词，找不到的留空） */
export function fillMeanings(entries: ListEntry[], siteCards: StudyCard[]): ListEntry[] {
  const index = new Map<string, StudyCard>()
  for (const c of siteCards) {
    for (const s of c.spellings) {
      const key = entryId(s.replace(/\*/g, ''))
      if (!index.has(key))
        index.set(key, c)
    }
  }
  return entries.map((e) => {
    if (e.meaning)
      return e
    const hit = index.get(entryId(e.word))
    return hit
      ? {
          ...e,
          meaning: hit.meaning,
          pos: e.pos || (hit.pos === '短语'
            ? ''
            : hit.pos),
          synonyms: e.synonyms.length
            ? e.synonyms
            : hit.synonyms.slice(0, 12),
        }
      : e
  })
}
/** 旧的“我的词单”还没搬过来（里面有词、这个账号还没搬过） */
export function needsListMigration(): boolean {
  return readWordList().length > 0 && !readValue<boolean>(nsKey(MIGRATED_KEY), false)
}
/**
 * 把旧的“我的词单”搬成一个普通词表。旧记录不删、不改；搬过一次就不再搬
 * （之后在词表里删掉的词不会被搬回来）。
 */
export function migrateOldWordList(siteCards: StudyCard[]) {
  if (!needsListMigration())
    return
  const lists = readLists()
  if (!lists.some(l => l.id === DUNGEON_LIST_ID)) {
    const words = dungeonListEntries(siteCards)
    if (words.length) {
      saveLists([
        ...lists,
        {
          id: DUNGEON_LIST_ID,
          name: DUNGEON_LIST_NAME,
          words,
          updatedAt: Date.now(),
        },
      ])
    }
  }
  saveValue(nsKey(MIGRATED_KEY), true)
}
/** 听写、单词地牢加词时默认加到哪个词表：上次选的，没有就第一个 */
export function targetListId(lists: WordList[]): string {
  const saved = readValue<string>(nsKey(TARGET_KEY), '')
  return lists.some(l => l.id === saved)
    ? saved
    : lists[0]?.id ?? ''
}
export function setTargetList(id: string) {
  saveValue(nsKey(TARGET_KEY), id)
}
/**
 * 往一个词表里加词（同一个词不重复加）。listId 为空或找不到时新建一个“我的词单”。
 * 返回加到了哪个词表、新加了几个。
 */
export function addEntriesToList(listId: string, entries: ListEntry[]): { listId: string, added: number } {
  const lists = readLists()
  let list = lists.find(l => l.id === listId)
  if (!list) {
    list = lists.find(l => l.id === DUNGEON_LIST_ID) ?? {
      ...newList(DUNGEON_LIST_NAME),
      id: DUNGEON_LIST_ID,
    }
    if (!lists.includes(list))
      lists.push(list)
  }
  const merged = mergeEntries(list.words, entries)
  list.words = merged.words
  list.updatedAt = Date.now()
  saveLists(lists)
  setTargetList(list.id)
  return { listId: list.id, added: merged.added }
}

/** 旧“我的词单”里存的是网站词库的 key（vocab:<id> / reading538:<id> / listening179:<id>），换成词表的词 */
export function dungeonListEntries(siteCards: StudyCard[]): ListEntry[] {
  const keys = new Set(readWordList())
  if (!keys.size)
    return []
  const picked = siteCards.filter(c => keys.has(c.deck === 'vocabulary'
    ? `vocab:${c.id}`
    : c.key))
  return mergeEntries([], picked.map(entryFromCard)).words
}

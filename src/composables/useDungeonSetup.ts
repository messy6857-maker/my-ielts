import type { DungeonDeck, DungeonMode, DungeonSelection, DungeonWord } from '../utils/dungeon'
import type { WordList } from '../utils/wordLists'
import type { useDeckStore } from './useDeckStore'
import type { useWordSchedule } from './useSpacedRepetition'
import type { useMistakes } from './useStudyData'
import { computed, ref, shallowRef } from 'vue'
import { getVocabularyChapterMeta, listVocabularyChapters, loadAllVocabulary } from '../pages/vocabulary/loadVocabulary'
import {
  buildPool,
  dailyPool,
  flattenListening,
  flattenReading,
  flattenVocabulary,
  flattenWordLists,
  MODES,
  sourceWords,
} from '../utils/dungeon'
import { loadWordLists } from '../utils/loadStudyCards'
import { readValue, saveValue } from '../utils/storage'
import { nsKey, studyDay } from './useStudyData'

// 单词地牢进门前的部分：选词源（今日 / 错词 / 到期 / 我的词表 / 章节 / 词库）、玩法、
// 各玩法最高纪录、今日地牢成绩，以及按这些选择算出来的词池。都按账号存在本机。
// 打怪的过程在 game.vue 里。

export interface ModeBest { score: number, floor: number }
export interface Best { combo: number, modes: Partial<Record<DungeonMode, ModeBest>> }
export interface DailyResult { date: string, score: number, won: boolean }

export function useDungeonSetup(stores: {
  scheduleStore: ReturnType<typeof useWordSchedule>
  deckStores: Record<string, ReturnType<typeof useDeckStore>>
  mistakes: ReturnType<typeof useMistakes>['mistakes']
}) {
  const { scheduleStore, deckStores, mistakes } = stores
  const SELECTION_KEY = 'dungeon_selection_v1'
  const BEST_KEY = 'dungeon_best_v1'
  const DAILY_KEY = 'dungeon_daily_v1'
  const chapters = listVocabularyChapters()
  const extraDecks: DungeonDeck[] = ['reading538', 'listening179']
  function readSelection(): DungeonSelection {
    const saved = readValue<Partial<DungeonSelection> | null>(nsKey(SELECTION_KEY), null)
    return {
      today: saved?.today ?? true,
      mistakes: saved?.mistakes ?? false,
      due: saved?.due ?? false,
      custom: saved?.custom ?? false,
      list: typeof saved?.list === 'string'
        ? saved.list
        : '',
      chapters: Array.isArray(saved?.chapters)
        ? saved.chapters.filter(c => chapters.includes(c))
        : [],
      decks: Array.isArray(saved?.decks)
        ? saved.decks.filter(d => extraDecks.includes(d))
        : [],
    }
  }
  const selection = ref<DungeonSelection>(readSelection())
  const allWords = shallowRef<DungeonWord[]>([])
  /** 我的词表（在“背单词 → 我的词表”里编辑） */
  const wordLists = shallowRef<WordList[]>([])
  const loading = ref(true)
  const loadError = ref(false)
  let loadSeq = 0
  async function loadWords() {
    const seq = ++loadSeq
    loading.value = true
    loadError.value = false
    try {
      const [vocabulary, reading, listening, lists] = await Promise.all([
        loadAllVocabulary(),
        import('../pages/reading/reading538words'),
        import('../pages/listening/listening179.json'),
        loadWordLists(),
      ])
      if (seq !== loadSeq)
        return
      wordLists.value = lists
      if (!lists.some(l => l.id === selection.value.list))
        selection.value.list = lists[0]?.id ?? ''
      allWords.value = [
        ...flattenVocabulary(vocabulary),
        ...flattenReading(reading.default as any),
        ...flattenListening(listening.default as any),
        ...flattenWordLists(lists.flatMap(l => l.words)),
      ]
    }
    catch {
      loadError.value = true
    }
    finally {
      loading.value = false
    }
  }
  loadWords()
  function readBest(): Best {
    const saved = readValue<any>(nsKey(BEST_KEY), null)
    const modes: Best['modes'] = {}
    for (const m of MODES) {
      const b = saved?.modes?.[m.id]
      if (b)
        modes[m.id] = { score: Number(b.score) || 0, floor: Number(b.floor) || 0 }
    }
    // 第一版只有一种玩法，记录是 { score, combo }：分数算到快速模式头上
    if (!saved?.modes && Number(saved?.score) > 0) {
      modes.quick = {
        score: Number(saved.score),
        floor: 0,
      }
    }
    return { combo: Number(saved?.combo) || 0, modes }
  }
  const best = ref<Best>(readBest())
  const MODE_KEY = 'dungeon_mode_v1'
  function readMode(): DungeonMode {
    const saved = readValue<unknown>(nsKey(MODE_KEY), 'quick')
    return MODES.some(m => m.id === saved)
      ? saved as DungeonMode
      : 'quick'
  }
  const mode = ref<DungeonMode>(readMode())
  /** 选中的那个词表里的词 */
  const customKeys = computed(() => (wordLists.value.find(l => l.id === selection.value.list)?.words ?? [])
    .map(w => `custom:${w.word.trim().replace(/\s+/g, ' ').toLowerCase()}`))
  function readDaily(): DailyResult | null {
    const saved = readValue<Partial<DailyResult> | null>(nsKey(DAILY_KEY), null)
    return saved && saved.date === studyDay()
      ? { date: saved.date, score: Number(saved.score) || 0, won: !!saved.won }
      : null
  }
  const dailyResult = ref<DailyResult | null>(readDaily())

  /** 进入页面（或回到选词页）时的时间：到期、今天学的都按它算 */
  const now = ref(Date.now())
  const context = computed(() => {
    const schedules = { ...scheduleStore.schedules.value }
    for (const w of allWords.value) {
      if (w.deck === 'vocabulary')
        continue
      const schedule = deckStores[w.deck].getSchedule(w.id)
      if (schedule)
        schedules[w.key] = schedule
    }
    return {
      schedules,
      mistakes: mistakes.value,
      customKeys: customKeys.value,
      now: now.value,
    }
  })
  const sources = computed(() => sourceWords(allWords.value, context.value))
  const pool = computed(() => buildPool(allWords.value, selection.value, context.value))
  const daily = computed(() => dailyPool(allWords.value, context.value))
  const deckCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const w of allWords.value)
      counts[w.deck] = (counts[w.deck] ?? 0) + 1
    return counts
  })
  function toggleChapter(chapter: string) {
    const list = selection.value.chapters
    selection.value.chapters = list.includes(chapter)
      ? list.filter(c => c !== chapter)
      : [...list, chapter]
  }
  function toggleDeck(deck: DungeonDeck) {
    const list = selection.value.decks
    selection.value.decks = list.includes(deck)
      ? list.filter(d => d !== deck)
      : [...list, deck]
  }
  function chapterLabel(chapter: string) {
    return getVocabularyChapterMeta(chapter)?.label || chapter.replace(/^\d+_/, '')
  }

  /** 开始一局时记住这次的选词和玩法 */
  function saveChoice() {
    saveValue(nsKey(SELECTION_KEY), selection.value)
    saveValue(nsKey(MODE_KEY), mode.value)
  }
  function saveBest(updated: Best) {
    best.value = updated
    saveValue(nsKey(BEST_KEY), updated)
  }
  function saveDaily(result: DailyResult) {
    dailyResult.value = result
    saveValue(nsKey(DAILY_KEY), dailyResult.value)
  }
  /** 换账号：用新账号的选择、词单和记录 */
  function reloadForAccount() {
    selection.value = readSelection()
    best.value = readBest()
    mode.value = readMode()
    dailyResult.value = readDaily()
    loadWords()
  }

  return {
    chapters,
    extraDecks,
    selection,
    allWords,
    wordLists,
    loading,
    loadError,
    loadWords,
    best,
    mode,
    customKeys,
    dailyResult,
    readDaily,
    now,
    context,
    sources,
    pool,
    daily,
    deckCounts,
    toggleChapter,
    toggleDeck,
    chapterLabel,
    saveChoice,
    saveBest,
    saveDaily,
    reloadForAccount,
  }
}

<script setup lang="ts">
import type { DungeonDeck, DungeonMode, DungeonSelection, DungeonWord, Monster, QuestionKind, Relic, RelicId, Rng } from '../utils/dungeon'
import { resolveAudioUrl } from '../composables/useAudio'
import { useAudioGroup } from '../composables/useAudioGroup'
import { useDeckStore } from '../composables/useDeckStore'
import { gradeSchedule, useCheckin, useWordSchedule } from '../composables/useSpacedRepetition'
import { recordAttempt } from '../composables/useStats'
import { nsKey, studyDay, useMistakes } from '../composables/useStudyData'
import {
  buildPool,
  buildFloor,
  checkSpelling,
  DAILY_FLOORS,
  DAILY_SOURCE_LABEL,
  dailyPool,
  DECK_LABEL,
  flattenListening,
  flattenReading,
  flattenVocabulary,
  floorRules,
  isSynonym,
  MODES,
  MONSTER_ICON,
  MONSTER_LABEL,
  offerRelics,
  phaseScore,
  ROOMS_PER_FLOOR,
  seededRng,
  sourceWords,
  START_HEARTS,
} from '../utils/dungeon'
import { readValue, saveValue } from '../utils/storage'
import { getVocabularyChapterMeta, listVocabularyChapters, loadAllVocabulary } from './vocabulary/loadVocabulary'

// 单词地牢：把选中的词变成怪物，一层 5 个房间，一层层往下打（快速 3 层 / 标准 10 层 / 无尽）。
// 答对算一次复习（只更新已经学过的词的复习进度，没学过的词仍算新词），答错记进错词本。
const managedAudio = useAudioGroup()
const { mistakes, addMistake } = useMistakes()
const scheduleStore = useWordSchedule()
const deckStores = {
  reading538: useDeckStore('reading538'),
  listening179: useDeckStore('listening179'),
}
const checkin = useCheckin()
const { currentUser } = useAuth()

const allWords = shallowRef<DungeonWord[]>([])
const loading = ref(true)
const loadError = ref(false)
async function loadWords() {
  loading.value = true
  loadError.value = false
  try {
    const [vocabulary, reading, listening] = await Promise.all([
      loadAllVocabulary(),
      import('./reading/reading538words'),
      import('./listening/listening179.json'),
    ])
    allWords.value = [
      ...flattenVocabulary(vocabulary),
      ...flattenReading(reading.default as any),
      ...flattenListening(listening.default as any),
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

// ---------- 进门前：选词源 ----------
const SELECTION_KEY = 'dungeon_selection_v1'
const BEST_KEY = 'dungeon_best_v1'
const LIST_KEY = 'dungeon_wordlist_v1'
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
    chapters: Array.isArray(saved?.chapters)
      ? saved.chapters.filter(c => chapters.includes(c))
      : [],
    decks: Array.isArray(saved?.decks)
      ? saved.decks.filter(d => extraDecks.includes(d))
      : [],
  }
}
const selection = ref<DungeonSelection>(readSelection())
interface ModeBest { score: number, floor: number }
interface Best { combo: number, modes: Partial<Record<DungeonMode, ModeBest>> }
function readBest(): Best {
  const saved = readValue<any>(nsKey(BEST_KEY), null)
  const modes: Best['modes'] = {}
  for (const m of MODES) {
    const b = saved?.modes?.[m.id]
    if (b)
      modes[m.id] = { score: Number(b.score) || 0, floor: Number(b.floor) || 0 }
  }
  // 第一版只有一种玩法，记录是 { score, combo }：分数算到快速模式头上
  if (!saved?.modes && Number(saved?.score) > 0)
    modes.quick = { score: Number(saved.score), floor: 0 }
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
function readCustomKeys(): string[] {
  const saved = readValue<unknown>(nsKey(LIST_KEY), [])
  return Array.isArray(saved)
    ? saved.filter((k): k is string => typeof k === 'string')
    : []
}
const customKeys = ref<string[]>(readCustomKeys())
interface DailyResult { date: string, score: number, won: boolean }
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

// ---------- 我的词单 ----------
const editorOpen = ref(false)
const search = ref('')
const SEARCH_LIMIT = 30
const searchResults = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return []
  const starts: DungeonWord[] = []
  const contains: DungeonWord[] = []
  for (const w of allWords.value) {
    const text = w.word.toLowerCase()
    if (text.startsWith(q))
      starts.push(w)
    else if (text.includes(q) || w.meaning.includes(q))
      contains.push(w)
  }
  return [
    ...starts,
    ...contains,
  ].slice(0, SEARCH_LIMIT)
})
function saveCustomKeys(keys: string[]) {
  customKeys.value = keys
  saveValue(nsKey(LIST_KEY), keys)
}
function toggleCustom(w: DungeonWord) {
  saveCustomKeys(customKeys.value.includes(w.key)
    ? customKeys.value.filter(k => k !== w.key)
    : [...customKeys.value, w.key])
}
function clearCustom() {
  saveCustomKeys([])
}

// ---------- 游戏中 ----------
type Stage = 'setup' | 'playing' | 'relic' | 'won' | 'left' | 'lost'
const stage = ref<Stage>('setup')
const monsters = ref<Monster[]>([])
/** 现在在第几层、这一局一共几层（无尽为 Infinity） */
const floor = ref(1)
const totalFloors = ref(1)
const floorLabel = computed(() => Number.isFinite(totalFloors.value)
  ? `第 ${floor.value} / ${totalFloors.value} 层`
  : `第 ${floor.value} 层`)
/** 这一局打哪些词、哪些已经出过、哪些已经记过复习结果 */
let runPool: DungeonWord[] = []
let usedKeys = new Set<string>()
let gradedKeys = new Set<string>()
const healed = ref(false)
const room = ref(0)
const phase = ref(0)
const hearts = ref(START_HEARTS)
const maxHearts = ref(START_HEARTS)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const defeated = ref(0)
/** 当前题目的结果：null 还没答 */
const result = ref<null | 'right' | 'wrong'>(null)
const picked = ref<DungeonWord | string | null>(null)
const spelling = ref('')
const hintShown = ref(false)
const timedOut = ref(false)
const shieldSaved = ref(false)
/** 这只怪物身上是否用过提示（决定这个词记成认识还是模糊） */
let monsterHinted = false
const missed = ref<Monster[]>([])
const newRecord = ref(false)
const spellInput = ref<HTMLInputElement | null>(null)
const continueButton = ref<HTMLButtonElement | null>(null)
// 遗物
const relics = ref<Relic[]>([])
const offered = ref<Relic[]>([])
const shieldReady = ref(false)
const has = (id: RelicId) => relics.value.some(r => r.id === id)
// 每日地牢
const isDaily = ref(false)
let runRng: Rng = Math.random

const monster = computed<Monster | undefined>(() => monsters.value[room.value])
const question = computed<QuestionKind | undefined>(() => monster.value?.phases[phase.value])
/** 选择题显示的选项；有侦察之眼时去掉最后一个错误选项 */
const wordOptions = computed<DungeonWord[]>(() => {
  const m = monster.value
  if (!m)
    return []
  if (!has('scout') || m.options.length < 3)
    return m.options
  const drop = [...m.options].reverse().find(o => o !== m.word)
  return m.options.filter(o => o !== drop)
})
const synonymOptions = computed<string[]>(() => {
  const m = monster.value
  if (!m)
    return []
  if (!has('scout') || m.synonymOptions.length < 3)
    return m.synonymOptions
  const drop = [...m.synonymOptions].reverse().find(o => !isSynonym(o, m.word))
  return m.synonymOptions.filter(o => o !== drop)
})

function playWord() {
  const w = monster.value?.word
  if (!w)
    return
  let url: string
  if (w.deck === 'vocabulary')
    url = resolveAudioUrl(`vocabulary/audio/${w.chapter}/${w.word}.mp3`)
  else if (w.deck === 'listening179')
    url = resolveAudioUrl(`179_audios/${w.word}.mp3`)
  else
    url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w.word)}&type=1`
  managedAudio.play(url, w.word)
}

// 限时拼写的倒计时
const timeLeft = ref(0)
let timerId: ReturnType<typeof setInterval> | null = null
let deadline = 0
function stopTimer() {
  if (timerId !== null)
    clearInterval(timerId)
  timerId = null
}
function startTimer() {
  stopTimer()
  const total = floorRules(floor.value).timedSeconds + (has('hourglass')
    ? 5
    : 0)
  deadline = Date.now() + total * 1000
  timeLeft.value = total
  timerId = setInterval(() => {
    timeLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (Date.now() >= deadline)
      timeUp()
  }, 200)
}

async function enterQuestion() {
  stopTimer()
  result.value = null
  picked.value = null
  spelling.value = ''
  hintShown.value = false
  timedOut.value = false
  shieldSaved.value = false
  await nextTick()
  if (question.value === 'spell' || question.value === 'timed') {
    playWord()
    spellInput.value?.focus()
  }
  if (question.value === 'timed')
    startTimer()
}
function begin(words: DungeonWord[], rng: Rng, asDaily: boolean, floors: number) {
  const used = new Set<string>()
  const first = buildFloor(words, allWords.value, context.value, rng, 1, used)
  if (!first.length)
    return
  runPool = words
  usedKeys = used
  gradedKeys = new Set()
  runRng = rng
  isDaily.value = asDaily
  floor.value = 1
  totalFloors.value = floors
  monsters.value = first
  room.value = 0
  phase.value = 0
  hearts.value = START_HEARTS
  maxHearts.value = START_HEARTS
  score.value = 0
  combo.value = 0
  maxCombo.value = 0
  defeated.value = 0
  missed.value = []
  relics.value = []
  offered.value = []
  shieldReady.value = false
  newRecord.value = false
  monsterHinted = false
  editorOpen.value = false
  stage.value = 'playing'
  enterQuestion()
}
function start() {
  now.value = Date.now()
  saveValue(nsKey(SELECTION_KEY), selection.value)
  saveValue(nsKey(MODE_KEY), mode.value)
  begin(pool.value, Math.random, false, MODES.find(m => m.id === mode.value)!.floors)
}
/** 每日地牢：用日期当随机种子，同一天、同一批词每次都是同一局 */
function startDaily() {
  now.value = Date.now()
  begin(daily.value.pool, seededRng(`daily:${studyDay()}`), true, DAILY_FLOORS)
}
function restart() {
  if (isDaily.value)
    startDaily()
  else
    start()
}

/** 一只怪物打完（击败或答错放跑）：记一次复习结果 */
function recordWord(m: Monster, wrongKind: QuestionKind | null) {
  const w = m.word
  let grade: 0 | 3 | 5 = 5
  if (wrongKind)
    grade = 0
  else if (monsterHinted)
    grade = 3
  const detail = `${w.pos} ${w.meaning}`.trim()
  // 词不够多时同一个词会在后面的层再出现：复习进度一局只更新一次，免得一天之内被连推好几档
  const firstTime = !gradedKeys.has(w.key)
  gradedKeys.add(w.key)
  // 只更新已经在自测里学过的词；没学过的词不建复习记录，在自测里仍算新词
  if (w.deck === 'vocabulary') {
    const previous = scheduleStore.get(w.id)
    if (previous && firstTime)
      scheduleStore.set(w.id, gradeSchedule(previous, grade))
    recordAttempt('vocabulary', grade)
    if (!wrongKind)
      return
    // 认错释义记到“单词自测”，拼错记到“打字练习”，和那两处的错题合并计数
    if (wrongKind === 'choice') {
      addMistake('flashcard', {
        key: `flashcard:${w.id}`,
        title: w.word,
        detail,
        hint: `${w.word}: ${w.meaning}`,
      })
    }
    else {
      addMistake('typing', {
        key: `typing:${w.word}`,
        title: w.word,
        detail,
        hint: `${w.word}: ${w.meaning}`,
      })
    }
    return
  }
  const deck = deckStores[w.deck]
  const previous = deck.getSchedule(w.id)
  if (previous && firstTime)
    deck.setSchedule(w.id, gradeSchedule(previous, grade))
  recordAttempt(w.deck, grade)
  // 阅读、听力考点词：和各自自测里的错题用同一条记录
  if (wrongKind) {
    const module = w.deck === 'reading538'
      ? 'reading'
      : 'listening'
    addMistake(module, {
      key: w.key,
      title: w.word,
      detail,
      hint: w.synonyms.slice(0, 4).join(' / '),
    })
  }
}

function finish(next: 'won' | 'left' | 'lost') {
  stopTimer()
  managedAudio.dispose()
  const updated: Best = { combo: Math.max(best.value.combo, maxCombo.value), modes: { ...best.value.modes } }
  if (!isDaily.value) {
    const previous = updated.modes[mode.value]
    newRecord.value = score.value > (previous?.score ?? 0)
    updated.modes[mode.value] = {
      score: Math.max(previous?.score ?? 0, score.value),
      floor: Math.max(previous?.floor ?? 0, floor.value),
    }
  }
  best.value = updated
  saveValue(nsKey(BEST_KEY), updated)
  if (isDaily.value) {
    const previous = readDaily()
    dailyResult.value = {
      date: studyDay(),
      score: Math.max(previous?.score ?? 0, score.value),
      won: next === 'won' || !!previous?.won,
    }
    saveValue(nsKey(DAILY_KEY), dailyResult.value)
    // 通关每日地牢算今天打卡
    if (next === 'won')
      checkin.checkin()
  }
  stage.value = next
}
/** 进下一题 / 下一个房间 / 打通一层去选遗物 / 结算 */
function advance() {
  const m = monster.value
  if (stage.value !== 'playing' || !m || result.value === null)
    return
  if (result.value === 'right' && phase.value + 1 < m.phases.length) {
    phase.value++
    enterQuestion()
    return
  }
  if (hearts.value <= 0) {
    finish('lost')
    return
  }
  if (room.value + 1 < monsters.value.length) {
    room.value++
    phase.value = 0
    monsterHinted = false
    enterQuestion()
    return
  }
  if (floor.value >= totalFloors.value) {
    finish('won')
    return
  }
  // 打通一层：回一颗心，三选一拿一件遗物，再往下走
  result.value = null
  healed.value = hearts.value < maxHearts.value
  if (healed.value)
    hearts.value++
  offered.value = offerRelics(relics.value.map(r => r.id), runRng, shieldReady.value)
  stage.value = 'relic'
}
function chooseRelic(relic: Relic) {
  if (stage.value !== 'relic' || !offered.value.includes(relic))
    return
  relics.value = [...relics.value, relic]
  offered.value = []
  if (relic.id === 'heart') {
    maxHearts.value++
    hearts.value++
  }
  if (relic.id === 'shield')
    shieldReady.value = true
  floor.value++
  monsters.value = buildFloor(runPool, allWords.value, context.value, runRng, floor.value, usedKeys)
  room.value = 0
  phase.value = 0
  monsterHinted = false
  stage.value = 'playing'
  enterQuestion()
}
/** 打通一层后不再往下：带着现在的成绩离开 */
function leave() {
  if (stage.value === 'relic' && !isDaily.value)
    finish('left')
}
function answer(correct: boolean) {
  const m = monster.value
  const kind = question.value
  if (!m || !kind || result.value !== null)
    return
  stopTimer()
  if (correct) {
    result.value = 'right'
    combo.value++
    maxCombo.value = Math.max(maxCombo.value, combo.value)
    score.value += phaseScore(combo.value, m.kind, has('drum'), floorRules(floor.value).scoreMultiplier)
    if (phase.value + 1 >= m.phases.length) {
      defeated.value++
      recordWord(m, null)
    }
  }
  else {
    result.value = 'wrong'
    combo.value = 0
    if (shieldReady.value) {
      shieldReady.value = false
      shieldSaved.value = true
    }
    else {
      hearts.value--
    }
    if (!missed.value.some(x => x.word.key === m.word.key))
      missed.value.push(m)
    recordWord(m, kind)
  }
  nextTick(() => continueButton.value?.focus())
}
function timeUp() {
  if (stage.value !== 'playing' || question.value !== 'timed' || result.value !== null)
    return
  timedOut.value = true
  answer(false)
}
function choose(option: DungeonWord) {
  if (result.value !== null || question.value !== 'choice')
    return
  picked.value = option
  answer(option === monster.value?.word)
}
function chooseSynonym(option: string) {
  const m = monster.value
  if (!m || result.value !== null || question.value !== 'synonym')
    return
  picked.value = option
  answer(isSynonym(option, m.word))
}
function submitSpelling() {
  const m = monster.value
  if (!m || result.value !== null || !spelling.value.trim())
    return
  answer(checkSpelling(spelling.value, m.word))
}
function showHint() {
  if (hintShown.value || result.value !== null)
    return
  hintShown.value = true
  monsterHinted = true
  combo.value = 0
  spellInput.value?.focus()
}
function backToSetup() {
  stopTimer()
  now.value = Date.now()
  dailyResult.value = readDaily()
  stage.value = 'setup'
}
// 换账号：回到选词页，用新账号的选择、词单和记录
watch(currentUser, () => {
  stopTimer()
  selection.value = readSelection()
  best.value = readBest()
  mode.value = readMode()
  customKeys.value = readCustomKeys()
  dailyResult.value = readDaily()
  stage.value = 'setup'
})

// 键盘：选择题按 1-4；出结果后按回车继续；选遗物按 1-3
function onKeydown(event: KeyboardEvent) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
    return
  if (stage.value === 'relic') {
    const relic = /^[1-3]$/.test(event.key)
      ? offered.value[Number(event.key) - 1]
      : undefined
    if (relic) {
      event.preventDefault()
      chooseRelic(relic)
    }
    return
  }
  if (stage.value !== 'playing')
    return
  if (result.value !== null) {
    if (event.key === 'Enter') {
      event.preventDefault()
      advance()
    }
    return
  }
  if (!/^[1-4]$/.test(event.key))
    return
  const index = Number(event.key) - 1
  if (question.value === 'choice' && wordOptions.value[index]) {
    event.preventDefault()
    choose(wordOptions.value[index])
  }
  else if (question.value === 'synonym' && synonymOptions.value[index]) {
    event.preventDefault()
    chooseSynonym(synonymOptions.value[index])
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', onKeydown)
})

function optionClass(isAnswer: boolean, isPicked: boolean) {
  if (result.value === null)
    return 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
  if (isAnswer)
    return 'border-green-500 bg-green-50 dark:bg-green-900'
  if (isPicked)
    return 'border-red-500 bg-red-50 dark:bg-red-900'
  return 'border-gray-200 opacity-60 dark:border-gray-700'
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mx-auto max-w-3xl border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-xl text-gray-900 font-bold dark:text-white">
          单词地牢
        </h3>
        <span v-if="best.combo > 0" class="text-sm text-gray-500 dark:text-gray-400">
          最长连击 {{ best.combo }}
        </span>
      </div>

      <p v-if="loading" class="py-10 text-center text-gray-500 dark:text-gray-400">
        正在加载词库…
      </p>
      <div v-else-if="loadError" class="py-10 text-center text-gray-700 dark:text-gray-200">
        <p class="mb-3">
          词库加载失败，请检查网络后重试。
        </p>
        <button class="rounded-lg bg-blue-600 px-4 py-2 text-white" @click="loadWords">
          重试
        </button>
      </div>

      <!-- 选词源 -->
      <div v-else-if="stage === 'setup'" class="text-gray-900 dark:text-white">
        <!-- 每日地牢 -->
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3 border border-orange-300 rounded-lg bg-orange-50 p-4 dark:border-orange-700 dark:bg-gray-700" data-daily>
          <div>
            <div class="font-bold">
              📅 每日地牢
              <span v-if="dailyResult?.won" class="ml-2 text-sm text-green-600 dark:text-green-400">今日已通关 · {{ dailyResult.score }} 分</span>
              <span v-else-if="dailyResult" class="ml-2 text-sm text-gray-500 dark:text-gray-300">今日最高 {{ dailyResult.score }} 分，还没通关</span>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-300">
              今天的固定关卡，共 {{ DAILY_FLOORS }} 层，打{{ DAILY_SOURCE_LABEL[daily.from] }}（{{ daily.pool.length }} 个），通关算今天打卡
            </div>
          </div>
          <button class="rounded-lg bg-orange-500 px-5 py-2 text-white font-bold" @click="startDaily">
            {{ dailyResult ? '再打一次' : '挑战' }}
          </button>
        </div>

        <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
          也可以自己选词、选模式：每层 {{ ROOMS_PER_FLOOR }} 个房间，最后一间是这层的 Boss。{{ START_HEARTS }} 颗心，答错扣一颗；每打通一层回一颗心、选一件遗物，越往下怪越强、分越高。答对算一次复习，答错记进错词本。
        </p>
        <h4 class="mb-2 font-bold">
          模式
        </h4>
        <div class="mb-4 grid gap-2 sm:grid-cols-3">
          <button
            v-for="m in MODES"
            :key="m.id"
            :data-mode="m.id"
            :aria-pressed="mode === m.id"
            class="border rounded-lg px-3 py-2 text-left"
            :class="mode === m.id
              ? 'border-blue-600 bg-blue-50 dark:bg-gray-700'
              : 'border-gray-300 dark:border-gray-600'"
            @click="mode = m.id"
          >
            <div class="font-bold">
              {{ m.name }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-300">
              {{ m.desc }}
            </div>
            <div v-if="best.modes[m.id]" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              最高 {{ best.modes[m.id]!.score }} 分<template v-if="best.modes[m.id]!.floor > 0">
                · 到过第 {{ best.modes[m.id]!.floor }} 层
              </template>
            </div>
          </button>
        </div>
        <h4 class="mb-2 font-bold">
          打哪些词（可以多选）
        </h4>
        <div class="mb-4 flex flex-col gap-2">
          <label class="flex flex-wrap items-center gap-2">
            <input v-model="selection.today" type="checkbox" data-source="today">
            今天学的词（{{ sources.today.length }}）
            <span class="text-xs text-gray-500 dark:text-gray-400">今天在自测里学过或记进错词本的词</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="selection.mistakes" type="checkbox" data-source="mistakes">
            错词（{{ sources.mistakes.length }}）
          </label>
          <label class="flex items-center gap-2">
            <input v-model="selection.due" type="checkbox" data-source="due">
            到期复习（{{ sources.due.length }}）
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2">
              <input v-model="selection.custom" type="checkbox" data-source="custom">
              我的词单（{{ sources.custom.length }}）
            </label>
            <button class="text-sm text-blue-600 underline dark:text-blue-400" @click="editorOpen = !editorOpen">
              {{ editorOpen ? '收起' : '编辑词单' }}
            </button>
          </div>
        </div>

        <!-- 词单编辑 -->
        <div v-if="editorOpen" class="mb-4 border border-gray-200 rounded-lg p-3 dark:border-gray-700" data-editor>
          <input
            v-model="search"
            type="search"
            aria-label="搜索单词或释义"
            placeholder="搜索单词或中文释义，点一下加入词单"
            class="mb-2 w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <ul v-if="searchResults.length" class="mb-2 max-h-60 overflow-auto text-sm">
            <li v-for="w in searchResults" :key="w.key">
              <button
                data-search-result
                class="w-full flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                :aria-pressed="customKeys.includes(w.key)"
                @click="toggleCustom(w)"
              >
                <span class="w-4">{{ customKeys.includes(w.key) ? '✓' : '+' }}</span>
                <span class="font-medium">{{ w.word }}</span>
                <span class="flex-1 truncate text-gray-500 dark:text-gray-400">{{ w.pos }} {{ w.meaning }}</span>
                <span class="text-xs text-gray-400">{{ DECK_LABEL[w.deck] }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="search.trim()" class="mb-2 text-sm text-gray-500 dark:text-gray-400">
            没有找到匹配的词
          </p>
          <div v-if="sources.custom.length" class="flex flex-wrap items-center gap-2 text-sm">
            <button
              v-for="w in sources.custom"
              :key="w.key"
              data-list-word
              class="border border-gray-300 rounded-full px-2 py-0.5 dark:border-gray-600"
              :title="`移出词单：${w.word}`"
              @click="toggleCustom(w)"
            >
              {{ w.word }} ×
            </button>
            <button class="text-red-600 underline dark:text-red-400" @click="clearCustom">
              清空词单
            </button>
          </div>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">
            词单还是空的
          </p>
        </div>

        <div class="mb-2 flex flex-wrap items-center gap-3">
          <h4 class="font-bold">
            按章节选
          </h4>
          <button class="text-sm text-blue-600 underline dark:text-blue-400" @click="selection.chapters = [...chapters]">
            全选
          </button>
          <button class="text-sm text-blue-600 underline dark:text-blue-400" @click="selection.chapters = []">
            清空
          </button>
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="chapter in chapters"
            :key="chapter"
            data-chapter
            :aria-pressed="selection.chapters.includes(chapter)"
            class="border rounded-full px-3 py-1 text-sm"
            :class="selection.chapters.includes(chapter)
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-600'"
            @click="toggleChapter(chapter)"
          >
            {{ chapterLabel(chapter) }}
          </button>
        </div>
        <h4 class="mb-2 font-bold">
          考点词（带同义替换题）
        </h4>
        <div class="mb-5 flex flex-wrap gap-2">
          <button
            v-for="deck in extraDecks"
            :key="deck"
            :data-deck="deck"
            :aria-pressed="selection.decks.includes(deck)"
            class="border rounded-full px-3 py-1 text-sm"
            :class="selection.decks.includes(deck)
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-600'"
            @click="toggleDeck(deck)"
          >
            {{ DECK_LABEL[deck] }}（{{ deckCounts[deck] ?? 0 }}）
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <button
            class="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-bold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pool.length === 0"
            @click="start"
          >
            进入地牢
          </button>
          <span class="text-sm text-gray-600 dark:text-gray-300">
            <template v-if="pool.length === 0">还没有选中任何词</template>
            <template v-else-if="pool.length < ROOMS_PER_FLOOR">选中 {{ pool.length }} 个词，每层 {{ pool.length }} 个房间，这些词会反复出现</template>
            <template v-else>选中 {{ pool.length }} 个词，每层抽 {{ ROOMS_PER_FLOOR }} 个，错得多的更容易遇到</template>
          </span>
        </div>
      </div>

      <!-- 选遗物 -->
      <div v-else-if="stage === 'relic'" class="text-center text-gray-900 dark:text-white">
        <h4 class="mb-1 text-lg font-bold">
          第 {{ floor }} 层通关！选一件遗物再往下走
        </h4>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {{ floorLabel }} · 得分 {{ score }} · {{ healed ? '回复了一颗心' : '心是满的' }}（{{ hearts }} / {{ maxHearts }}）
        </p>
        <div class="grid gap-3 sm:grid-cols-3">
          <button
            v-for="(relic, i) in offered"
            :key="relic.id"
            :data-relic="relic.id"
            class="border border-gray-300 rounded-lg p-4 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            @click="chooseRelic(relic)"
          >
            <div class="text-3xl" aria-hidden="true">
              {{ relic.icon }}
            </div>
            <div class="mt-1 font-bold">
              {{ relic.name }}
            </div>
            <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ relic.desc }}
            </div>
            <div class="mt-1 text-xs text-gray-400">
              {{ i + 1 }}
            </div>
          </button>
        </div>
        <button v-if="!isDaily" class="mt-4 text-sm text-gray-500 underline dark:text-gray-400" data-leave @click="leave">
          不往下了，带着成绩离开
        </button>
      </div>

      <!-- 战斗 -->
      <div v-else-if="stage === 'playing' && monster" class="text-gray-900 dark:text-white">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{{ isDaily ? '每日地牢 · ' : '' }}{{ floorLabel }} · 房间 {{ room + 1 }} / {{ monsters.length }}</span>
          <span :aria-label="`剩余 ${hearts} 颗心`">
            <span v-for="i in maxHearts" :key="i">{{ i <= hearts ? '❤️' : '🖤' }}</span>
          </span>
          <span>得分 {{ score }}</span>
          <span :class="combo >= 3 ? 'text-orange-500 font-bold' : ''">连击 {{ combo }}</span>
        </div>
        <div v-if="relics.length" class="mb-2 text-sm" aria-label="已有遗物">
          <span
            v-for="(relic, i) in relics"
            :key="i"
            class="mr-1"
            :class="relic.id === 'shield' && !shieldReady ? 'opacity-30' : ''"
            :title="`${relic.name}：${relic.desc}`"
          >{{ relic.icon }}</span>
        </div>
        <div class="mb-4 border border-gray-200 rounded-lg p-4 text-center dark:border-gray-700">
          <div class="text-5xl" aria-hidden="true">
            {{ MONSTER_ICON[monster.kind] }}
          </div>
          <div class="mt-1 font-bold">
            {{ MONSTER_LABEL[monster.kind] }}
            <span v-if="monster.wrongCount > 0" class="text-xs text-gray-500 font-normal dark:text-gray-400">错过 {{ monster.wrongCount }} 次</span>
          </div>
          <div class="mt-1 text-sm" :aria-label="`还要答对 ${monster.phases.length - phase - (result === 'right' ? 1 : 0)} 题`">
            <span v-for="n in monster.phases.length" :key="n">{{ n - 1 < phase || (n - 1 === phase && result === 'right') ? '▫️' : '🟥' }}</span>
          </div>
        </div>

        <!-- 选择题：看释义选单词 -->
        <div v-if="question === 'choice'">
          <p class="mb-3 text-center text-lg">
            <span class="text-sm text-gray-500 italic dark:text-gray-400">{{ monster.word.pos }}</span>
            {{ monster.word.meaning }}
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="(option, i) in wordOptions"
              :key="option.key"
              data-option
              class="border rounded-lg px-4 py-3 text-left"
              :class="optionClass(option === monster.word, option === picked)"
              :disabled="result !== null"
              @click="choose(option)"
            >
              <span class="mr-2 text-xs text-gray-400">{{ i + 1 }}</span>{{ option.word }}
            </button>
          </div>
        </div>
        <!-- 同义替换题 -->
        <div v-else-if="question === 'synonym'">
          <p class="mb-3 text-center">
            选出 <span class="text-lg font-bold">{{ monster.word.word }}</span> 的同义替换
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="(option, i) in synonymOptions"
              :key="option"
              data-option
              class="border rounded-lg px-4 py-3 text-left"
              :class="optionClass(isSynonym(option, monster.word), option === picked)"
              :disabled="result !== null"
              @click="chooseSynonym(option)"
            >
              <span class="mr-2 text-xs text-gray-400">{{ i + 1 }}</span>{{ option }}
            </button>
          </div>
        </div>
        <!-- 拼写题：听发音拼出来；限时题还给释义，但要在倒计时内拼完 -->
        <form v-else class="text-center" @submit.prevent="submitSpelling">
          <p v-if="question === 'timed'" class="mb-2 text-lg font-bold" :class="timeLeft <= 5 ? 'text-red-600 dark:text-red-400' : ''" role="timer">
            ⏱ {{ timeLeft }} 秒
          </p>
          <p class="mb-3">
            <template v-if="question === 'timed'">
              限时拼写：<span class="text-sm text-gray-500 italic dark:text-gray-400">{{ monster.word.pos }}</span> {{ monster.word.meaning }}
            </template>
            <template v-else>
              听发音，把这个词拼出来
            </template>
            <button type="button" class="ml-2 border border-gray-300 rounded-lg px-3 py-1 text-sm dark:border-gray-600" @click="playWord">
              🔊 再听一次
            </button>
          </p>
          <p v-if="has('letter')" class="mb-2 text-sm text-gray-600 dark:text-gray-300">
            📜 首字母 {{ monster.word.word[0] }}，共 {{ monster.word.word.length }} 个字符
          </p>
          <p v-if="hintShown" class="mb-3 text-sm text-gray-600 dark:text-gray-300">
            提示：{{ monster.word.pos }} {{ monster.word.meaning }}，首字母 {{ monster.word.word[0] }}
          </p>
          <input
            ref="spellInput"
            v-model="spelling"
            aria-label="拼写"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="result !== null"
            class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-center text-lg sm:w-80 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <div v-if="result === null" class="mt-3 flex justify-center gap-3">
            <button type="submit" class="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50" :disabled="!spelling.trim()">
              攻击
            </button>
            <button v-if="question === 'spell' && !hintShown" type="button" class="border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600" @click="showHint">
              提示（连击清零）
            </button>
          </div>
        </form>

        <div v-if="result !== null" class="mt-4 text-center" data-result>
          <p v-if="result === 'right'" class="text-green-600 font-bold dark:text-green-400">
            {{ phase + 1 >= monster.phases.length ? '击败！' : '命中！还差一击' }}
          </p>
          <p v-else class="text-red-600 dark:text-red-400">
            <span class="font-bold">{{ timedOut ? '时间到，怪物逃走了。' : '答错了，怪物逃走了。' }}</span>
            正确答案：{{ monster.word.word }}（{{ monster.word.pos }} {{ monster.word.meaning }}）
            <span v-if="question === 'synonym'">同义替换：{{ monster.word.synonyms.join(' / ') }}</span>
            <span v-if="shieldSaved" class="block text-gray-600 dark:text-gray-300">🛡️ 免死金牌挡下了这一击，没有扣心</span>
          </p>
          <button ref="continueButton" class="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-white" @click="advance">
            {{ hearts <= 0 ? '查看结果' : '继续' }}
          </button>
          <span class="ml-2 text-xs text-gray-400">回车</span>
        </div>
      </div>

      <!-- 结算 -->
      <div v-else class="text-center text-gray-900 dark:text-white">
        <div class="text-5xl" aria-hidden="true">
          {{ { won: '🏆', left: '🚪', lost: '💀' }[stage as 'won' | 'left' | 'lost'] }}
        </div>
        <h4 class="mt-2 text-lg font-bold">
          {{ { won: '通关！', left: `打通第 ${floor} 层后离开了地牢`, lost: `倒在了第 ${floor} 层` }[stage as 'won' | 'left' | 'lost'] }}
        </h4>
        <p class="mt-2">
          得分 {{ score }} · {{ floorLabel }} · 击败 {{ defeated }} 只 · 最长连击 {{ maxCombo }}
        </p>
        <p v-if="newRecord" class="mt-1 text-orange-500 font-bold">
          新的最高分！
        </p>
        <p v-if="isDaily" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {{ stage === 'won' ? '每日地牢已通关，今天已打卡 ✓' : '每日地牢还没通关，可以再打一次' }}
        </p>
        <div v-if="missed.length" class="mx-auto mt-4 max-w-md text-left text-sm">
          <p class="mb-1 text-gray-600 dark:text-gray-300">
            这些词已记进错词本：
          </p>
          <ul class="list-disc pl-5">
            <li v-for="m in missed" :key="m.word.key">
              {{ m.word.word }} <span class="text-gray-500 dark:text-gray-400">{{ m.word.pos }} {{ m.word.meaning }}</span>
            </li>
          </ul>
        </div>
        <div class="mt-5 flex flex-wrap justify-center gap-3">
          <button class="rounded-lg bg-blue-600 px-5 py-2 text-white" @click="restart">
            再来一局
          </button>
          <button class="border border-gray-300 rounded-lg px-5 py-2 dark:border-gray-600" @click="backToSetup">
            {{ isDaily ? '返回' : '重新选词' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

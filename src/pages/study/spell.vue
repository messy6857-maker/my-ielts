<script setup lang="ts">
import type { DiffChar } from '../../utils/corpusSpelling'
import type { CorpusChapterId, SpellMode, SpellSource } from '../../utils/spellPractice'
import type { DeckId, StudyCard } from '../../utils/studyDeck'
import type { WordList } from '../../utils/wordLists'
import { resolveAudioUrl } from '../../composables/useAudio'
import { useAudioGroup } from '../../composables/useAudioGroup'
import { nsKey, useMistakes } from '../../composables/useStudyData'
import { useStudyDeck } from '../../composables/useStudyDeck'
import { loadDeckCards, loadWordLists } from '../../utils/loadStudyCards'
import {
  CORPUS_CHAPTERS,
  diffSpelling,
  matchSpelling,
  missingSynonyms,
  mistakenCards,
  pickSpellRound,
  SPELL_MODES,
  SPELL_SOURCES,
  spellMistake,
  todayCards,
  typedWrong,
} from '../../utils/spellPractice'
import { readRecords, readValue, saveRecord, saveValue } from '../../utils/storage'
import { audioPath } from '../../utils/studyDeck'
import { entryCard } from '../../utils/wordLists'
import { listVocabularyChapters } from '../vocabulary/loadVocabulary'

// 练拼写：进来先选词从哪里来、用哪种练法、一轮多少个，点“开始”才出题。
// 一次一个词，所有练法共用一套判分；拼错记到原来的错题分组，本轮最后再考一次。
// 拼写练习不改复习进度；词汇表的答案、听力 179 的已学行、打字练习的进度照旧记录。
defineOptions({ name: 'StudySpellPage' })

const route = useRoute()
const managedAudio = useAudioGroup()
const { currentUser } = useAuth()
const { addMistake, mistakes } = useMistakes()
const { setProgress, markListening179RowStudied } = useProgress()
const SPELL_DECKS: DeckId[] = [
  'vocabulary',
  'listening179',
  'corpus',
  'custom',
]
const stores = Object.fromEntries(SPELL_DECKS.map(d => [
  d,
  useStudyDeck(d),
])) as Record<DeckId, ReturnType<typeof useStudyDeck>>

// —— 选择 ——
const chapters = listVocabularyChapters()
// 一轮多少个：10 / 20 / 50 / 自定义数量 / 全部（0 表示全部）
const SIZES = [10, 20, 50, 'custom', 0] as const
type Size = (typeof SIZES)[number]
function clampCount(value: unknown) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n >= 1
    ? Math.min(500, n)
    : 30
}
const SETTINGS_KEY = 'study_spell_v1'
interface Settings {
  source: SpellSource
  chapter: string
  corpus: CorpusChapterId[]
  mode: SpellMode
  size: Size
  /** 自定义数量 */
  custom: number
  /** 选了“我的词表”时练哪个词表 */
  list: string
}
const sourceIds = SPELL_SOURCES.map(s => s.id)
const modeIds = SPELL_MODES.map(m => m.id)
const corpusIds = CORPUS_CHAPTERS.map(c => c.id)
function readSettings(): Settings {
  const saved = readValue<Partial<Settings> | null>(nsKey(SETTINGS_KEY), null)
  const query = route?.query ?? {}
  // 旧的练习页地址会带上词源和练法跳过来
  const source = [query.source, saved?.source].find(v => sourceIds.includes(v as SpellSource)) as SpellSource | undefined
  const mode = [query.mode, saved?.mode].find(v => modeIds.includes(v as SpellMode)) as SpellMode | undefined
  const corpus = Array.isArray(saved?.corpus)
    ? saved.corpus.filter(c => corpusIds.includes(c))
    : []
  return {
    source: source ?? 'vocabulary',
    chapter: chapters.includes(saved?.chapter ?? '')
      ? saved!.chapter!
      : chapters[0],
    corpus: corpus.length
      ? corpus
      : [...corpusIds],
    mode: mode ?? 'meaning',
    size: SIZES.includes(saved?.size as any)
      ? saved!.size!
      : 20,
    custom: clampCount(saved?.custom),
    list: [query.list, saved?.list].find(v => typeof v === 'string' && v) as string | undefined ?? '',
  }
}
const settings = ref<Settings>(readSettings())
function toggleCorpus(id: CorpusChapterId) {
  const list = settings.value.corpus
  settings.value.corpus = list.includes(id)
    ? list.filter(c => c !== id)
    : [...list, id]
}

const cards = shallowRef<Record<DeckId, StudyCard[]> | null>(null)
const loadError = ref(false)
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loadError.value = false
  try {
    const [lists, own] = await Promise.all([
      Promise.all(SPELL_DECKS.map(d => loadDeckCards(d))),
      loadWordLists(),
    ])
    if (seq !== loadSeq)
      return
    wordLists.value = own
    if (!own.some(l => l.id === settings.value.list))
      settings.value.list = own[0]?.id ?? ''
    cards.value = Object.fromEntries(SPELL_DECKS.map((d, i) => [d, lists[i]])) as Record<DeckId, StudyCard[]>
  }
  catch {
    if (seq === loadSeq)
      loadError.value = true
  }
}
const now = ref(Date.now())
const wordLists = shallowRef<WordList[]>([])
const allCards = computed(() => cards.value
  ? SPELL_DECKS.flatMap(d => cards.value![d])
  : [])
const pools = computed<Record<SpellSource, StudyCard[]>>(() => {
  const all = cards.value
  if (!all) {
    return {
      vocabulary: [],
      listening179: [],
      corpus: [],
      mistakes: [],
      today: [],
      custom: [],
    }
  }
  return {
    vocabulary: all.vocabulary.filter(c => c.chapter === settings.value.chapter),
    listening179: all.listening179,
    corpus: all.corpus.filter(c => settings.value.corpus.some(ch => String(c.id).startsWith(`${ch}-`))),
    mistakes: mistakenCards(allCards.value, mistakes.value),
    today: todayCards(allCards.value, c => stores[c.deck].getSchedule(c.id), now.value),
    custom: (wordLists.value.find(l => l.id === settings.value.list)?.words ?? []).map(entryCard),
  }
})
const pool = computed(() => pools.value[settings.value.source])
// 带同义替换只有听力 179 能练
const modes = computed(() => SPELL_MODES.filter(m => m.id !== 'synonym' || settings.value.source === 'listening179'))
watch(() => settings.value.source, (source) => {
  if (source !== 'listening179' && settings.value.mode === 'synonym')
    settings.value.mode = 'meaning'
}, { immediate: true })
const roundLimit = computed(() => settings.value.size === 'custom'
  ? settings.value.custom
  : settings.value.size)
const roundCount = computed(() => roundLimit.value > 0
  ? Math.min(roundLimit.value, pool.value.length)
  : pool.value.length)

// 词汇表里已经填过的拼写答案（和词表练习模式是同一份）
const SPELL_KEY = 'vocabulary_spell_v2'
function spelledAnswers() {
  return readRecords<string>(SPELL_KEY, currentUser.value)
}

// —— 练习 ——
type Stage = 'setup' | 'playing' | 'done'
const stage = ref<Stage>('setup')
// 已经在这个页面时又打开了旧地址：在选择页就按地址里的词源和练法选上
watch(() => [route?.query.source, route?.query.mode], () => {
  if (stage.value === 'setup')
    settings.value = { ...settings.value, source: readSettings().source, mode: readSettings().mode }
})
const mode = ref<SpellMode>('meaning')
/** 本轮的题目队列；拼错的词会在队尾再出现一次 */
const queue = ref<StudyCard[]>([])
const index = ref(0)
/** 本轮的词数（不含重考） */
const roundSize = ref(0)
const firstTry = ref(0)
/** 本轮拼错过的词（按顺序，不重复） */
const missed = ref<StudyCard[]>([])
const retried = new Set<string>()
const input = ref('')
const synonymInput = ref('')
const result = ref<null | 'right' | 'wrong'>(null)
const matched = ref<string | null>(null)
const diff = ref<DiffChar[]>([])
const lostSynonyms = ref<string[]>([])
const hintShown = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)
const synonymEl = ref<HTMLInputElement | null>(null)
let typingHadError = false
let advanceTimer: ReturnType<typeof setTimeout> | null = null

const current = computed<StudyCard | undefined>(() => queue.value[index.value])
const isRetry = computed(() => index.value >= roundSize.value)
const hint = computed(() => {
  const c = current.value
  if (!c)
    return ''
  return c.deck === 'corpus' && String(c.id).startsWith('ch3-') && c.note
    ? c.note
    : `首字母 ${c.word[0]}，共 ${c.word.length} 个字母`
})

function play() {
  const c = current.value
  if (!c)
    return
  const path = audioPath(c)
  managedAudio.play('local' in path
    ? resolveAudioUrl(path.local)
    : path.remote, c.word)
}
function clearAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}
async function enter() {
  clearAdvance()
  input.value = ''
  synonymInput.value = ''
  result.value = null
  matched.value = null
  diff.value = []
  lostSynonyms.value = []
  hintShown.value = false
  typingHadError = false
  await nextTick()
  inputEl.value?.focus()
  play()
}
function begin(words: StudyCard[]) {
  if (!words.length)
    return
  mode.value = settings.value.mode
  queue.value = words
  roundSize.value = words.length
  index.value = 0
  firstTry.value = 0
  missed.value = []
  retried.clear()
  stage.value = 'playing'
  enter()
}
function startRound() {
  if (!cards.value || !pool.value.length)
    return
  saveValue(nsKey(SETTINGS_KEY), settings.value)
  // 词汇表按章节听写、看义拼写：没拼过的排前面，按词表顺序
  const byChapter = settings.value.source === 'vocabulary' && settings.value.mode !== 'typing'
  const answers = byChapter
    ? spelledAnswers()
    : {}
  begin(pickSpellRound(pool.value, roundLimit.value, byChapter
    ? {
        answered: c => !!answers[`${c.chapter}|${c.id}`],
      }
    : {}))
}
function retryMissed() {
  begin(pickSpellRound(missed.value, 0))
}
function recordMiss(card: StudyCard) {
  if (missed.value.includes(card))
    return
  missed.value.push(card)
  const m = spellMistake(card, mode.value)
  if (m)
    addMistake(m.module, m.entry)
}
/** 照旧更新的记录：词汇表已填的拼写答案和按章进度、听力 179 的已学行 */
function recordAnswer(card: StudyCard, answer: string) {
  if (card.deck === 'listening179') {
    markListening179RowStudied(Number(card.id))
  }
  else if (card.deck === 'vocabulary' && mode.value !== 'typing') {
    saveRecord(SPELL_KEY, `${card.chapter}|${card.id}`, answer.toLowerCase().trim() || undefined, currentUser.value)
    const answers = spelledAnswers()
    const inChapter = cards.value?.vocabulary.filter(c => c.chapter === card.chapter) ?? []
    const done = inChapter.filter(c => !!answers[`${c.chapter}|${c.id}`]).length
    setProgress('vocabulary', done, inChapter.length)
    setProgress(`spelling:${card.chapter}`, done, inChapter.length)
  }
}
function submit() {
  const c = current.value
  if (!c || mode.value === 'typing' || result.value !== null || !input.value.trim())
    return
  const hit = matchSpelling(input.value, c)
  const lost = mode.value === 'synonym'
    ? missingSynonyms(synonymInput.value, c)
    : []
  matched.value = hit
  lostSynonyms.value = lost
  if (!hit)
    diff.value = diffSpelling(input.value, c)
  if (hit && !lost.length) {
    result.value = 'right'
    if (!isRetry.value && !missed.value.includes(c))
      firstTry.value++
  }
  else {
    result.value = 'wrong'
    recordMiss(c)
    // 本轮最后再考一次（每个词只重考一次）
    if (!retried.has(c.key)) {
      retried.add(c.key)
      queue.value = [...queue.value, c]
    }
  }
  recordAnswer(c, input.value)
  nextTick(() => nextButton.value?.focus())
}
function next() {
  clearAdvance()
  if (index.value + 1 >= queue.value.length) {
    managedAudio.dispose()
    stage.value = 'done'
    return
  }
  index.value++
  enter()
}
// 带同义替换：在单词框里按回车先跳到同义替换框，不直接核对
function toSynonyms(event: KeyboardEvent) {
  if (mode.value === 'synonym' && result.value === null && synonymEl.value) {
    event.preventDefault()
    synonymEl.value.focus()
  }
}
// 跟打：看着单词打，打错过就记一次错题；打完自动进下一个
function onTyping() {
  const c = current.value
  if (!c || mode.value !== 'typing' || advanceTimer)
    return
  if (typedWrong(input.value, c))
    typingHadError = true
  if (!matchSpelling(input.value, c))
    return
  const owner = currentUser.value
  advanceTimer = setTimeout(() => {
    advanceTimer = null
    if (currentUser.value !== owner || stage.value !== 'playing' || current.value !== c)
      return
    if (typingHadError)
      recordMiss(c)
    else firstTry.value++
    recordAnswer(c, input.value)
    if (c.deck === 'vocabulary')
      setProgress('typing', index.value + 1, roundSize.value)
    next()
  }, 200)
}
function typedState(i: number): 'todo' | 'ok' | 'bad' {
  const typed = input.value[i]
  if (typed === undefined)
    return 'todo'
  return typed.toLowerCase() === current.value?.word[i]?.toLowerCase()
    ? 'ok'
    : 'bad'
}
function backToSetup() {
  clearAdvance()
  managedAudio.dispose()
  now.value = Date.now()
  stage.value = 'setup'
}
function onKeydown(event: KeyboardEvent) {
  if (stage.value === 'playing' && result.value !== null && event.key === 'Enter' && !event.repeat) {
    event.preventDefault()
    next()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearAdvance()
})
watch(currentUser, () => {
  clearAdvance()
  managedAudio.dispose()
  settings.value = readSettings()
  now.value = Date.now()
  stage.value = 'setup'
  load()
})
const sourceLabel = computed(() => SPELL_SOURCES.find(s => s.id === settings.value.source)!.label)
const modeLabel = computed(() => SPELL_MODES.find(m => m.id === mode.value)!.label)
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-2xl text-gray-900 dark:text-white">
      <!-- 选择 -->
      <template v-if="stage === 'setup'">
        <div class="mb-4 flex items-center gap-3" data-setup>
          <StudyBack to="/study" label="背单词" />
          <div>
            <h3 class="text-xl font-bold">
              练拼写
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              选好再开始。阅读考点词不要求拼写，所以不在这里。
            </p>
          </div>
        </div>
        <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <p v-if="loadError" class="text-sm text-amber-700" role="alert">
            词表加载失败。<button class="underline" @click="load">
              重试
            </button>
          </p>
          <p v-else-if="!cards" class="text-sm text-gray-600 dark:text-gray-300">
            词表加载中…
          </p>
          <template v-else>
            <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
              练哪些词
            </div>
            <div class="grid grid-cols-2 mb-3 gap-2 sm:grid-cols-3">
              <button
                v-for="s in SPELL_SOURCES"
                :key="s.id"
                :data-source="s.id"
                :aria-pressed="settings.source === s.id"
                class="border rounded-lg px-3 py-2 text-sm font-medium"
                :class="settings.source === s.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
                @click="settings.source = s.id"
              >
                {{ s.label }}<template v-if="s.id === 'mistakes' || s.id === 'today'">
                  （{{ pools[s.id].length }}）
                </template>
              </button>
            </div>
            <div v-if="settings.source === 'vocabulary'" class="mb-4">
              <select v-model="settings.chapter" aria-label="章节" class="block w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm sm:w-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                <option v-for="c in chapters" :key="c" :value="c">
                  {{ c }}
                </option>
              </select>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                想对着整张词表逐格填？<RouterLink to="/vocabulary?practice=1" class="underline">
                  打开词表的练习模式
                </RouterLink>
              </p>
            </div>
            <div v-else-if="settings.source === 'corpus'" class="mb-4 flex flex-wrap gap-2">
              <label v-for="c in CORPUS_CHAPTERS" :key="c.id" class="flex cursor-pointer items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm dark:border-gray-600">
                <input type="checkbox" :checked="settings.corpus.includes(c.id)" :data-corpus="c.id" @change="toggleCorpus(c.id)">
                {{ c.label }}
              </label>
            </div>
            <div v-else-if="settings.source === 'custom'" class="mb-4">
              <select v-if="wordLists.length" v-model="settings.list" aria-label="词表" class="block w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm sm:w-72 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                <option v-for="l in wordLists" :key="l.id" :value="l.id">
                  {{ l.name }}（{{ l.words.length }}）
                </option>
              </select>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <template v-if="!wordLists.length">
                  还没有词表。
                </template>
                <RouterLink to="/study/lists" class="underline">
                  {{ wordLists.length ? '管理词表' : '去新建一个' }}
                </RouterLink>
              </p>
            </div>
            <div v-else class="mb-4" />

            <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
              怎么练
            </div>
            <div class="grid mb-4 gap-2 sm:grid-cols-2">
              <button
                v-for="m in modes"
                :key="m.id"
                :data-mode="m.id"
                :aria-pressed="settings.mode === m.id"
                class="border rounded-lg px-3 py-2 text-left"
                :class="settings.mode === m.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700'"
                @click="settings.mode = m.id"
              >
                <div class="text-sm font-bold" :class="settings.mode === m.id ? 'text-blue-700 dark:text-blue-300' : ''">
                  {{ m.label }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ m.desc }}
                </div>
              </button>
            </div>

            <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
              一轮多少个
            </div>
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <button
                v-for="n in SIZES"
                :key="n"
                :data-size="n"
                :aria-pressed="settings.size === n"
                class="border rounded-lg px-3 py-2 text-sm font-medium"
                :class="settings.size === n ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
                @click="settings.size = n"
              >
                {{ n === 'custom' ? '自定义数量' : n ? `${n} 个` : '全部' }}
              </button>
              <input
                v-if="settings.size === 'custom'"
                :value="settings.custom"
                type="number"
                min="1"
                max="500"
                aria-label="自定义数量"
                class="block w-24 border border-gray-300 rounded-lg bg-white p-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                @change="settings.custom = clampCount(($event.target as HTMLInputElement).value)"
              >
            </div>

            <p class="mb-4 text-sm text-gray-600 dark:text-gray-300" data-preview>
              {{ pool.length ? `${sourceLabel}一共 ${pool.length} 个词，这一轮练 ${roundCount} 个。` : `${sourceLabel}里现在没有词。` }}
            </p>
            <button
              data-start
              class="rounded-lg bg-blue-600 px-8 py-2.5 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              :disabled="!pool.length"
              @click="startRound"
            >
              开始
            </button>
          </template>
        </div>
      </template>

      <!-- 练习 -->
      <template v-else-if="stage === 'playing' && current">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            data-back
            class="shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="backToSetup"
          >
            ← 返回选择
          </button>
          <span class="text-sm text-gray-500 dark:text-gray-400" data-progress>
            {{ modeLabel }} · {{ isRetry ? '再考一次' : `${index + 1} / ${roundSize}` }}
          </span>
        </div>
        <div class="border border-gray-200 rounded-2xl bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800" data-question>
          <div class="mb-4 flex items-center justify-center gap-3">
            <span v-if="mode === 'typing'" class="text-3xl font-black tracking-wide" data-target>
              <span
                v-for="(ch, i) in current.word"
                :key="i"
                :class="{ 'text-green-600': typedState(i) === 'ok', 'text-red-600 underline': typedState(i) === 'bad', 'text-gray-400': typedState(i) === 'todo' }"
              >{{ ch }}</span>
            </span>
            <span v-else class="text-sm text-gray-500 dark:text-gray-400">听发音，把词拼出来</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" aria-label="播放发音" @click="play">
              <i class="i-ph-speaker-high-bold block text-2xl" />
            </button>
          </div>
          <p v-if="mode !== 'dictation' || result !== null" class="mb-4 text-center" data-meaning>
            <span v-if="current.pos" class="mr-2 text-sm text-gray-400 italic" style="font-family: times">{{ current.pos }}</span>
            <span class="text-lg">{{ current.meaning }}</span>
          </p>

          <form @submit.prevent="submit">
            <input
              ref="inputEl"
              v-model="input"
              aria-label="拼写"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :disabled="result !== null"
              class="block w-full border border-gray-300 rounded-lg bg-white p-3 text-center text-xl dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              @input="onTyping"
              @keydown.enter="toSynonyms"
            >
            <input
              v-if="mode === 'synonym'"
              ref="synonymEl"
              v-model="synonymInput"
              aria-label="同义替换"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="同义替换，多个用逗号分开"
              :disabled="result !== null"
              class="mt-3 block w-full border border-gray-300 rounded-lg bg-white p-3 text-center dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
            <div v-if="result === null && mode !== 'typing'" class="mt-4 flex items-center justify-between gap-3">
              <button type="button" class="text-sm text-gray-500 underline dark:text-gray-400" @click="hintShown = true">
                提示
              </button>
              <button type="submit" class="rounded-lg bg-blue-600 px-6 py-2 text-white font-bold disabled:opacity-50" :disabled="!input.trim()">
                核对
              </button>
            </div>
          </form>
          <p v-if="hintShown && result === null" class="mt-3 text-sm text-amber-700 dark:text-amber-300" data-hint>
            {{ hint }}
          </p>

          <div v-if="result !== null" class="mt-4 text-center" data-answer>
            <p class="mb-2 font-bold" :class="result === 'right' ? 'text-green-600' : 'text-red-600'">
              {{ result === 'right' ? '拼对了' : '没拼对' }}
            </p>
            <p v-if="matched" class="text-2xl font-black">
              {{ matched }}
            </p>
            <p v-else class="text-2xl font-black" data-diff>
              <span v-for="(c, i) in diff" :key="i" :class="c.ok ? '' : 'text-red-600 underline'">{{ c.char }}</span>
            </p>
            <p v-if="current.spellings.length > 1" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              都算对：{{ current.spellings.join(' / ') }}
            </p>
            <p v-if="mode === 'synonym'" class="mt-2 text-sm" data-synonyms>
              同义替换：{{ current.synonyms.join(' / ') || '无' }}
              <span v-if="lostSynonyms.length" class="block text-red-600">没写出来：{{ lostSynonyms.join(' / ') }}</span>
            </p>
            <p v-if="current.note" class="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {{ current.note }}
            </p>
            <button ref="nextButton" class="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white font-bold" @click="next">
              {{ index + 1 >= queue.length ? '查看结果' : '下一个' }}
            </button>
            <span class="ml-2 text-xs text-gray-400">回车</span>
          </div>
        </div>
      </template>

      <!-- 结果 -->
      <template v-else>
        <div class="mb-4">
          <button
            data-back
            class="border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="backToSetup"
          >
            ← 返回选择
          </button>
        </div>
        <div class="border border-gray-200 rounded-2xl bg-white p-6 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800" data-done>
          <h4 class="text-2xl font-bold">
            这一轮练完了
          </h4>
          <p class="mt-2">
            {{ roundSize }} 个词，一次就对 {{ firstTry }} 个
          </p>
          <div v-if="missed.length" class="mx-auto mt-4 max-w-md text-left text-sm">
            <p class="mb-1 text-gray-600 dark:text-gray-300">
              这些词已记进错词本：
            </p>
            <ul class="list-disc pl-5">
              <li v-for="c in missed" :key="c.key">
                {{ c.word }} <span class="text-gray-500 dark:text-gray-400">{{ c.pos }} {{ c.meaning }}</span>
              </li>
            </ul>
          </div>
          <div class="mt-5 flex flex-wrap justify-center gap-3">
            <button class="rounded-lg bg-blue-600 px-5 py-2 text-white" @click="startRound">
              再来一轮
            </button>
            <button v-if="missed.length" class="border border-gray-300 rounded-lg px-5 py-2 dark:border-gray-600" @click="retryMissed">
              只练拼错的
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

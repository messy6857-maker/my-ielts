<script setup lang="ts">
import { resolveAudioUrl } from '../../composables/useAudio'
import { getMnemonic } from './mnemonics'
import { parseExtra } from './extraParser'
import { gradeSchedule } from '../../composables/useSpacedRepetition'
import { planQueue } from '../../composables/useDeckStore'
import { formatClock, formatDuration, useStudyTimer } from '../../composables/useStudyTimer'
import { getWordInfoWithFallback } from '../../composables/useWordInfo'
import { synonymPosData } from './synonymPos'
import { synonymMeanings } from './synonymMeanings'
import type { WordInfo } from '../../composables/useWordInfo'
import vocabulary from './vocabulary'

interface Card {
  id: number | string
  word: string
  pos: string
  meaning: string
  example: string
  extra: string // 拓展字段原文
  attempts: number
  isNew: boolean
  counted: boolean // 是否已计入今日新词
  hintWords: string[] // 联网找例句时的备选词（派生词等）
}

const CHAPTER_KEY = 'vocabulary_flashcard_chapter'
const chapters = Object.keys(vocabulary)
const category = ref(localStorage.getItem(CHAPTER_KEY) || chapters[0])
const { addMistake } = useMistakes()
const { setProgress } = useProgress()
const scheduleStore = useWordSchedule()
const daily = useDailyGoal()
const router = useRouter()
const timer = useStudyTimer()
const showExitModal = ref(false)
const lastSessionSec = ref(0)

function handleBack() {
  lastSessionSec.value = timer.pause()
  showExitModal.value = true
}
function cancelExit() {
  showExitModal.value = false
  timer.resume()
}
function confirmExit() {
  showExitModal.value = false
  router.push('/vocabulary')
}
const { streak: checkinStreak, weekDots: checkinWeekDots, checkin: doCheckin } = useCheckin()

// 每日目标输入框的双向绑定（可自定义数量）
const goalProxy = computed({
  get: () => daily.goal.value,
  set: (v: string | number) => daily.setGoal(Number(v)),
})

const queue = ref<Card[]>([])
const initialTotal = ref(0)
const reviewCount = ref(0) // 本轮复习词数（到期 + 补足）
const dueCount = ref(0) // 其中到期的词数
const newCount = ref(0) // 本轮新词数
const bestGrade = ref<Record<string, number>>({})
const stats = ref({ known: 0, vague: 0, unknown: 0 })
const finished = ref(false)
// 自评后展开学习的词条
const studying = ref<Card | null>(null)
const lastGrade = ref<0 | 3 | 5 | null>(null)
// 联网例句/同义词（自评前展示的提示；数据为构建时预抓取，运行时零等待）
const wordInfo = ref<WordInfo | null>(null)

const current = computed(() => (!studying.value ? queue.value[0] ?? null : null))
const remaining = computed(() => queue.value.length)
const studyMnemonic = computed(() => (studying.value
  ? getMnemonic(studying.value.word, studying.value.meaning, studying.value.example)
  : null))
// 自评前的例句巧记提示
const preMnemonic = computed(() => (current.value
  ? getMnemonic(current.value.word, current.value.meaning, current.value.example)
  : null))
// 学习面板：该词的拓展词汇（跟原词放在一起展示）
const studyExtras = computed(() => (studying.value ? parseExtra(studying.value.extra) : []))
// 拓展词汇配色：循环使用，方便区分不同的词
const extraColors = [
  'text-blue-600 dark:text-blue-400',
  'text-purple-600 dark:text-purple-400',
  'text-pink-600 dark:text-pink-400',
  'text-orange-600 dark:text-orange-400',
  'text-teal-600 dark:text-teal-400',
  'text-indigo-600 dark:text-indigo-400',
]
const extraDots = [
  'bg-blue-500', 'bg-purple-500', 'bg-pink-500',
  'bg-orange-500', 'bg-teal-500', 'bg-indigo-500',
]
// 同义词词性：从词库查（短语或生僻词查不到就不显示词性）
const wordPosMap = computed(() => {
  const map = new Map<string, string>()
  for (const ch of Object.keys(vocabulary)) {
    const chapter = (vocabulary as any)[ch]
    if (!chapter)
      continue
    for (const w of chapter.words.flat()) {
      const name = w.word?.[0]?.toLowerCase()
      if (name && w.pos && !map.has(name))
        map.set(name, w.pos)
    }
  }
  return map
})
function synonymPos(syn: string): string {
  // 先查本站词库，再查联网抓取的词性数据；都查不到就不显示（如实标注）
  const key = syn.trim().toLowerCase()
  return wordPosMap.value.get(key) || synonymPosData[key] || ''
}
function synonymMeaning(syn: string): string {
  return synonymMeanings[syn.trim().toLowerCase()] || ''
}
// 点击同义词展开/收起中文释义
const expandedSyns = ref(new Set<string>())
// 点击拓展词展开/收起中文释义
const expandedExtras = ref(new Set<number>())
function toggleExtraMeaning(i: number) {
  if (expandedExtras.value.has(i))
    expandedExtras.value.delete(i)
  else
    expandedExtras.value.add(i)
}
function toggleSynMeaning(syn: string) {
  const key = syn.trim().toLowerCase()
  if (expandedSyns.value.has(key))
    expandedSyns.value.delete(key)
  else
    expandedSyns.value.add(key)
}
const showAnswer = ref(false)
// 自评前例句巧记：拆词答案的显示开关（每张卡重置）
const showPreAnswer = ref(false)
const studyLapses = computed(() => {
  if (!studying.value)
    return 0
  return scheduleStore.get(studying.value.id)?.lapses ?? 0
})
const showMnemonic = ref(false)

let audio: HTMLAudioElement | null = null
function playAudio(word?: string) {
  const w = word || current.value?.word || studying.value?.word
  if (!w)
    return
  try {
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    audio = document.createElement('audio')
    audio.src = resolveAudioUrl(`vocabulary/audio/${category.value}/${w}.mp3`)
    audio.play().catch(() => {})
  }
  catch {
    // 忽略音频异常
  }
}

function toCard(w: any, isNew: boolean): Card {
  const extras = parseExtra(w.extra)
  return {
    id: w.id,
    word: w.word[0],
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    extra: w.extra || '',
    attempts: 0,
    isNew,
    counted: false,
    hintWords: extras.map(e => e.word).slice(0, 3),
  }
}

function buildQueue() {
  const chapter = (vocabulary as any)[category.value]
  const all = chapter ? chapter.words.flat() : []
  // 复习配额 = 3 × 每日新词目标（1:3）：到期优先，不足时从已学词里补；新词按今日剩余名额取
  const plan = planQueue(all, id => scheduleStore.get(id), daily.goal.value, daily.remaining.value)
  queue.value = [...plan.newWords.map(w => toCard(w, true)), ...plan.reviews.map(w => toCard(w, false))]
  initialTotal.value = queue.value.length
  reviewCount.value = plan.reviews.length
  dueCount.value = plan.dueCount
  newCount.value = plan.newWords.length
  bestGrade.value = {}
  stats.value = { known: 0, vague: 0, unknown: 0 }
  finished.value = initialTotal.value === 0
  studying.value = null
  lastGrade.value = null
  wordInfo.value = null
  if (queue.value.length > 0)
    playAudio(queue.value[0].word)
}

// 先自评：认识 / 不认识 / 模糊
function grade(g: 0 | 3 | 5) {
  const card = current.value
  if (!card)
    return
  // 更新间隔重复调度
  scheduleStore.set(card.id, gradeSchedule(scheduleStore.get(card.id), g))
  // 统计
  if (g === 5)
    stats.value.known++
  else if (g === 3)
    stats.value.vague++
  else
    stats.value.unknown++
  bestGrade.value[card.id] = Math.max(bestGrade.value[card.id] ?? -1, g)
  // 新词计入今日学习量（一天只计一次）
  if (card.isNew && !card.counted) {
    daily.recordNewWord()
    card.counted = true
  }
  card.attempts++
  queue.value.shift()

  if (g !== 5) {
    // 模糊 / 不认识：记入错词本
    addMistake('vocabulary', {
      key: `vocabulary:${card.id}`,
      title: card.word,
      detail: `${card.pos} ${card.meaning}`,
      hint: card.example,
    })
    // 本轮内复现：不认识放队尾，模糊插到后面第 5 个（最多复现 3 次）
    if (card.attempts < 3) {
      const insertAt = g === 3 ? Math.min(5, queue.value.length) : queue.value.length
      queue.value.splice(insertAt, 0, card)
    }
  }
  // 三种自评都展开完整词条学习
  lastGrade.value = g
  // 多次记错的词自动展开巧记
  showMnemonic.value = true // 自评后直接展开巧记，无需点击
  showAnswer.value = false
  studying.value = card
  playAudio(card.word)
}

function next() {
  studying.value = null
  lastGrade.value = null
  showAnswer.value = false
  showPreAnswer.value = false
  if (queue.value.length === 0)
    finishSession()
  else
    playAudio(queue.value[0].word)
}

/** 自评前加载例句/同义词：查内置预抓取数据（本词 → 派生词），同步返回 */
function loadWordInfo(card: Card) {
  wordInfo.value = getWordInfoWithFallback([card.word, ...card.hintWords])
}

function finishSession() {
  finished.value = true
  const known = Object.values(bestGrade.value).filter(v => v === 5).length
  setProgress('flashcard', known, initialTotal.value)
  // 完成一轮学习即打卡
  if (Object.keys(bestGrade.value).length > 0)
    doCheckin()
}

function restart() {
  buildQueue()
}

watch(category, (newVal) => {
  localStorage.setItem(CHAPTER_KEY, newVal)
  buildQueue()
})

// 卡片切换时预加载联网例句/同义词
watch(current, (c) => {
  if (c)
    loadWordInfo(c)
})

onMounted(() => {
  buildQueue()
  timer.start()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex flex-wrap justify-between items-center gap-3 mb-2">
        <div class="flex items-center gap-3">
          <button
            title="返回词表"
            class="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← 返回
          </button>
          <div>
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">单词自测</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">看到单词先凭感觉自评，再按需学习词条</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="category"
            class="block w-36 border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500"
          >
            <option v-for="c in chapters" :key="c" :value="c">{{ c }}</option>
          </select>
          <input
            v-model.lazy="goalProxy"
            type="number"
            min="1"
            max="500"
            title="每日学习数量（可自定义，下轮生效）"
            class="block w-20 border border-gray-300 rounded-lg bg-white p-2.5 text-sm text-center dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500"
          >
          <span class="text-sm text-gray-500 dark:text-gray-400">个/天</span>
        </div>
      </div>
      <!-- 打卡 + 今日计划 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-gray-400">
          今日计划：复习 {{ reviewCount }}（到期 {{ dueCount }}） · 新词 {{ newCount }} ｜
          今日新词 {{ daily.dailyCount }} / {{ daily.goal }}
        </p>
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300" title="本次学习计时">
            ⏱ {{ formatClock(timer.elapsed.value) }}
          </span>
          <span class="text-xs text-gray-400" title="今日累计学习时长（目标 2 小时）">
            今日 {{ formatDuration(timer.dailySeconds.value) }}
          </span>
          <div class="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" title="今日目标 2 小时">
            <div class="h-full bg-green-500 rounded-full transition-all" :style="{ width: Math.min(100, timer.dailySeconds.value / timer.dailyGoal * 100) + '%' }" />
          </div>
          <span class="text-xs font-bold text-orange-500">🔥 连续打卡 {{ checkinStreak }} 天</span>
          <div class="flex gap-1">
            <span
              v-for="(d, i) in checkinWeekDots"
              :key="i"
              :title="d.label"
              class="inline-block w-3 h-3 rounded-full"
              :class="d.checked ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'"
            />
          </div>
        </div>
      </div>

      <!-- Session stats -->
      <div v-if="!finished" class="grid grid-cols-4 gap-3 mb-6 text-center">
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">本轮剩余</div>
          <div class="text-lg font-bold dark:text-white">{{ remaining }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">认识</div>
          <div class="text-lg font-bold text-green-600">{{ stats.known }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">不认识</div>
          <div class="text-lg font-bold text-red-600">{{ stats.unknown }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">模糊</div>
          <div class="text-lg font-bold text-yellow-600">{{ stats.vague }}</div>
        </div>
      </div>

      <!-- Finish screen -->
      <div v-if="finished" class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 text-center">
        <h2 class="text-2xl font-bold mb-4 dark:text-white">
          {{ initialTotal === 0 ? '今日目标已完成 🎉' : '本轮完成 🎉' }}
        </h2>
        <div v-if="initialTotal > 0" class="flex justify-center gap-6 mb-6 text-sm">
          <span class="text-green-600 font-bold">认识 {{ stats.known }}</span>
          <span class="text-red-600 font-bold">不认识 {{ stats.unknown }}</span>
          <span class="text-yellow-600 font-bold">模糊 {{ stats.vague }}</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {{ initialTotal === 0
            ? `今日新词已学完（${daily.dailyCount} / ${daily.goal}），到期复习会按时出现`
            : '没掌握的词已按记忆曲线安排复现，并记入错词本' }}
        </p>
        <div class="flex justify-center gap-3">
          <button
            class="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
            @click="restart"
          >
            再来一轮
          </button>
          <button
            class="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
            @click="handleBack"
          >
            返回词表
          </button>
        </div>
      </div>

      <!-- 自评卡片：先显示三个选项 -->
      <div v-else-if="current" class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-8 text-center">
          <div class="mb-2">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="current.isNew
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'"
            >
              {{ current.isNew ? '新词' : '复习' }}
            </span>
          </div>
          <div class="flex items-center justify-center gap-3 mb-2">
            <span class="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-white">{{ current.word }}</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" @click="playAudio()">
              <i class="i-ph-speaker-high-bold text-2xl block" />
            </button>
          </div>

          <!-- 例句巧记：自评前展示，辅助回忆；无内容时隐藏 -->
          <div
            v-if="preMnemonic || (wordInfo && (wordInfo.examples.length > 0 || wordInfo.synonyms.length > 0)) || current.example"
            class="my-5 rounded-xl bg-sky-50 border border-sky-200 p-4 text-left dark:bg-sky-900/20 dark:border-sky-800"
          >
            <div class="mb-2 text-sm font-bold text-sky-700 dark:text-sky-300">💡 例句巧记</div>
            <!-- 拆词：先只给词块，答案（词义）点一下才显示 -->
            <template v-if="preMnemonic && preMnemonic.kind === 'parts'">
              <p class="mb-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                🧠 拆词：{{ (preMnemonic.parts ?? []).map(p => `${p.text}（${p.gloss}）`).join(' + ') }}
                <button v-if="!showPreAnswer" class="ml-1 text-xs text-sky-600 underline underline-offset-2 dark:text-sky-400" @click="showPreAnswer = true">
                  点击显示答案
                </button>
                <span v-else class="font-bold text-sky-700 dark:text-sky-300">
                  → 也就是「{{ current.meaning }}」
                </span>
              </p>
            </template>
            <p v-else-if="preMnemonic" class="mb-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              🧠 {{ preMnemonic.body }}
            </p>
            <div v-if="wordInfo && wordInfo.examples.length > 0">
              <p v-for="(ex, i) in wordInfo.examples.slice(0, 2)" :key="i" class="mb-1 text-sm italic leading-relaxed text-gray-600 dark:text-gray-400">
                🔗 “{{ ex }}”
                <span v-if="wordInfo.word !== current.word.toLowerCase()" class="not-italic text-xs text-gray-400">（{{ wordInfo.word }} 的例句）</span>
              </p>
            </div>
            <p v-else-if="current.example" class="text-sm italic leading-relaxed text-gray-600 dark:text-gray-400">
              🔗 “{{ current.example }}”
            </p>
            <p v-if="wordInfo && wordInfo.synonyms.length > 0" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              同义词：{{ wordInfo.synonyms.slice(0, 8).join(' · ') }}
            </p>
          </div>

          <p class="text-sm text-gray-400 mt-4 mb-6">看到这个词，第一感觉是？</p>
          <div class="grid grid-cols-3 gap-3">
            <button
              class="rounded-xl bg-green-50 border border-green-200 py-4 text-green-700 font-bold hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
              @click="grade(5)"
            >
              认识
            </button>
            <button
              class="rounded-xl bg-red-50 border border-red-200 py-4 text-red-700 font-bold hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
              @click="grade(0)"
            >
              不认识
            </button>
            <button
              class="rounded-xl bg-yellow-50 border border-yellow-200 py-4 text-yellow-700 font-bold hover:bg-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300"
              @click="grade(3)"
            >
              模糊
            </button>
          </div>
        </div>
      </div>

      <!-- 词条学习：按选择展示 -->
      <div v-else-if="studying" class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-8">
          <div class="text-center mb-2">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="lastGrade === 5
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : lastGrade === 0
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'"
            >
              {{ lastGrade === 5 ? '认识 · 确认一下' : lastGrade === 0 ? '不认识 · 记一下' : '模糊 · 再看看' }}
            </span>
          </div>
          <div class="flex items-center justify-center gap-3 mb-4">
            <span class="text-3xl font-black text-gray-900 dark:text-white">{{ studying.word }}</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" @click="playAudio()">
              <i class="i-ph-speaker-high-bold text-xl block" />
            </button>
          </div>
          <div class="text-center mb-4">
            <span class="text-sm italic text-gray-400 mr-2" style="font-family: times;">{{ studying.pos }}</span>
            <span class="text-xl font-medium text-gray-800 dark:text-gray-200">{{ studying.meaning }}</span>
          </div>
          <p v-if="studying.example" class="text-center text-gray-500 dark:text-gray-400 italic text-sm mb-6">
            {{ studying.example }}
          </p>

          <!-- 例句扩展：预抓取的真实例句 + 同义词 -->
          <div v-if="wordInfo && (wordInfo.examples.length > 0 || wordInfo.synonyms.length > 0)" class="mb-6 rounded-xl bg-sky-50 border border-sky-200 p-4 text-left dark:bg-sky-900/20 dark:border-sky-800">
            <div class="mb-2 text-sm font-bold text-sky-700 dark:text-sky-300">🔗 例句扩展</div>
            <div v-if="wordInfo.examples.length > 0">
              <p v-for="(ex, i) in wordInfo.examples.slice(0, 2)" :key="i" class="mb-1 text-sm italic leading-relaxed text-gray-600 dark:text-gray-400">
                “{{ ex }}”
                <span v-if="wordInfo.word !== studying.word.toLowerCase()" class="not-italic text-xs text-gray-400">（{{ wordInfo.word }} 的例句）</span>
              </p>
            </div>
            <div v-if="wordInfo.synonyms.length > 0" class="mt-2">
              <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">同义词：</p>
              <ul class="space-y-1.5">
                <li v-for="(syn, i) in wordInfo.synonyms.slice(0, 8)" :key="i" class="text-sm">
                  <span class="mr-1.5 inline-block w-2 h-2 rounded-full" :class="extraDots[i % extraDots.length]" />
                  <button
                    class="font-bold underline decoration-dotted underline-offset-2"
                    :class="extraColors[i % extraColors.length]"
                    @click="toggleSynMeaning(syn)"
                  >{{ syn }}</button>
                  <span v-if="synonymPos(syn)" class="ml-1 italic text-gray-500 dark:text-gray-400" style="font-family: times;">{{ synonymPos(syn) }}</span>
                  <span v-if="expandedSyns.has(syn.trim().toLowerCase()) && synonymMeaning(syn)" class="ml-2 text-gray-600 dark:text-gray-400">{{ synonymMeaning(syn) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 拓展词汇：跟原词放在一起展示，说明这个词有拓展可学 -->
          <div v-if="studyExtras.length > 0" class="mb-6 rounded-xl bg-teal-50 border border-teal-200 p-4 dark:bg-teal-900/20 dark:border-teal-800">
            <div class="mb-2 text-sm font-bold text-teal-700 dark:text-teal-300">
              📚 拓展词汇 <span class="font-normal text-teal-500">（{{ studyExtras.length }} 个可学）</span>
            </div>
            <ul class="space-y-3">
              <li v-for="(ex, i) in studyExtras" :key="i" class="text-sm leading-relaxed">
                <span class="mr-1.5 inline-block w-2 h-2 rounded-full" :class="extraDots[i % extraDots.length]" />
                <button
                  class="font-bold underline decoration-dotted underline-offset-2"
                  :class="extraColors[i % extraColors.length]"
                  @click="toggleExtraMeaning(i)"
                >{{ ex.word }}</button>
                <span v-if="ex.pos" class="ml-1 text-sm italic text-gray-500 dark:text-gray-400" style="font-family: times;">{{ ex.pos }}</span>
                <span v-if="expandedExtras.has(i)" class="ml-2 text-gray-600 dark:text-gray-400">{{ ex.meaning }}</span>
              </li>
            </ul>
          </div>

          <!-- 巧记：例句或简洁记法 -->
          <div class="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 dark:bg-amber-900/20 dark:border-amber-800">
            <button class="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300" @click="showMnemonic = !showMnemonic">
              <i class="i-carbon-idea block" />
              {{ studyMnemonic ? studyMnemonic.title : '巧记提示' }}
              <span v-if="studyLapses >= 2" class="text-xs font-normal text-amber-500">（这个词你已记错 {{ studyLapses }} 次）</span>
            </button>
            <div v-if="showMnemonic" class="mt-2 text-sm text-amber-800 dark:text-amber-200">
              <template v-if="studyMnemonic">
                <!-- 手写巧记：一句话 -->
                <p v-if="studyMnemonic.kind === 'curated'">{{ studyMnemonic.body }}</p>
                <!-- 拆词巧记：自评后直接显示完整微故事 -->
                <template v-else-if="studyMnemonic.kind === 'parts'">
                  <div class="flex flex-wrap gap-2 mb-1">
                    <span
                      v-for="(part, i) in studyMnemonic.parts"
                      :key="i"
                      class="rounded bg-amber-100 px-2 py-0.5 dark:bg-amber-900/50"
                    >{{ part.text }}<span class="text-amber-500">（{{ part.gloss }}）</span></span>
                  </div>
                  <p>{{ studyMnemonic.body }}</p>
                </template>
                <!-- 例句巧记：填空 + 点看答案 -->
                <template v-else-if="studyMnemonic.kind === 'sentence'">
                  <p class="italic mb-2">“{{ studyMnemonic.body }}”</p>
                  <button v-if="!showAnswer" class="text-xs underline underline-offset-2" @click="showAnswer = true">
                    想不起来？点我看答案
                  </button>
                  <p v-else class="font-bold">答案：{{ studyMnemonic.answer }}</p>
                </template>
              </template>
              <p v-else>试试拆音节跟读几遍，再结合上面的例句联想画面，效果会更好。</p>
            </div>
          </div>

          <button
            class="w-full rounded-xl bg-blue-600 py-3 text-white text-sm font-bold hover:bg-blue-700"
            @click="next"
          >
            下一个
          </button>
        </div>
      </div>

      <!-- 退出结算弹窗 -->
      <div v-if="showExitModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="cancelExit">
        <div class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-gray-800">
          <h3 class="mb-3 text-lg font-bold text-gray-900 dark:text-white">本次学习结束</h3>
          <p class="mb-2 text-3xl font-black text-blue-600 dark:text-blue-400">{{ formatDuration(lastSessionSec) }}</p>
          <p class="mb-1 text-sm text-gray-500 dark:text-gray-400">今日累计 {{ formatDuration(timer.dailySeconds.value) }}</p>
          <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div class="h-full rounded-full bg-green-500 transition-all" :style="{ width: Math.min(100, timer.dailySeconds.value / timer.dailyGoal * 100) + '%' }" />
          </div>
          <p class="mb-4 text-xs text-gray-400">
            {{ timer.dailySeconds.value >= timer.dailyGoal ? '今日目标已达成 🎉' : `距离今日目标 2 小时还差 ${formatDuration(timer.dailyGoal - timer.dailySeconds.value)}` }}
          </p>
          <div class="flex gap-3">
            <button
              class="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="cancelExit"
            >
              继续学习
            </button>
            <button
              class="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              @click="confirmExit"
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

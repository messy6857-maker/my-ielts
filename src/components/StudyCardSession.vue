<script setup lang="ts">
import type { WordSchedule } from '../composables/useSpacedRepetition'
import type { WordInfo } from '../composables/useWordInfo'
import type { DeckId, StudyCard } from '../utils/studyDeck'
import { resolveAudioUrl } from '../composables/useAudio'
import { useAudioGroup } from '../composables/useAudioGroup'
import { useGoBack } from '../composables/useGoBack'
import { gradeSchedule } from '../composables/useSpacedRepetition'
import { decrementAttempt, recordAttempt } from '../composables/useStats'
import { studyDay } from '../composables/useStudyData'
import { useStudyDeck } from '../composables/useStudyDeck'
import { formatClock, formatDuration, useStudyTimer } from '../composables/useStudyTimer'
import { loadVocabularyDetails } from '../composables/useVocabularyDetails'
import { loadWordInfoWithFallback } from '../composables/useWordInfo'
import { parseExtra } from '../pages/vocabulary/extraParser'
import {
  ensureSynonymPos,
  ensureVocabularyPos,
  ensureWordPhonetics,
  phonetic,
  synonymPosError,
} from '../pages/vocabulary/vocabExtras'
import { audioPath, DECK_IDS, DECK_META, mistakeHint, mistakeKey } from '../utils/studyDeck'

// 统一的卡片自测：先凭感觉自评认识 / 模糊 / 不认识，再看词条。所有词库共用这一套流程，
// 卡片上的提示按词库不同（词汇表：例句巧记、音标、拓展词；考点词：同义替换、备注；语料库：拼写要点）。
// 复习进度、每日新词、错题、统计都写回各词库原来的记录。

export interface StudyPlan {
  items: Array<{ card: StudyCard, isNew: boolean }>
  reviewCount: number
  dueCount: number
  newCount: number
}
const props = defineProps<{
  title: string
  subtitle?: string
  /** 数据是否已就绪；没就绪时不能自评（比如正在换章节） */
  ready: boolean
  /** 数据变了（换词库、换章节、加载完成）就加一，重新组一轮 */
  version: number
  build: () => StudyPlan
  /** 每张卡下面注明来自哪个词库（复习到期混排时用） */
  showDeck?: boolean
  /** 同一个词在词汇表多章出现时，一起更新的所有词条 id（跨章复习用） */
  aliasIds?: (card: StudyCard) => Array<string | number>
  /** 一轮里一个词都没有时显示的话 */
  emptyText?: string
  /** 返回键上写的上一级名字，比如“选择”；不传就是返回背单词 */
  backLabel?: string
}>()
const emit = defineEmits<{
  finished: [{ known: number, total: number }]
  /** 传了 backLabel 时，确认退出后交给上一级处理 */
  exit: []
}>()

interface SessionCard extends StudyCard {
  attempts: number
  isNew: boolean
  counted: boolean
}
interface GradeHistoryEntry {
  card: SessionCard
  grade: 0 | 3 | 5
  prevSchedule: WordSchedule | undefined
  /** 评分后的快照：撤销时当前进度和它不一致（别的设备改过）就不恢复进度，只恢复计数 */
  postSchedule: WordSchedule
  aliasSchedules: Array<{ id: string | number, previous: WordSchedule | undefined }>
  prevBest: number | undefined
  prevAttempts: number
  countedNew: boolean
  date: string
}

const managedAudio = useAudioGroup()
const stores = Object.fromEntries(DECK_IDS.map(d => [
  d,
  useStudyDeck(d),
])) as Record<DeckId, ReturnType<typeof useStudyDeck>>
const { addMistake, decrementMistake, patchMistakeHint } = useMistakes()
const { streak: checkinStreak, weekDots: checkinWeekDots, checkin: doCheckin } = useCheckin()
const { goBack } = useGoBack('/study')
const timer = useStudyTimer()
ensureWordPhonetics()

const queue = ref<SessionCard[]>([])
const initialTotal = ref(0)
const reviewCount = ref(0)
const dueCount = ref(0)
const newCount = ref(0)
const bestGrade = ref<Record<string, number>>({})
const stats = ref({ known: 0, vague: 0, unknown: 0 })
const finished = ref(false)
const studying = ref<SessionCard | null>(null)
const lastGrade = ref<0 | 3 | 5 | null>(null)
const gradeHistory = ref<GradeHistoryEntry[]>([])
/** 每换一张卡加一，晚到的例句、同义词不会落到别的卡上 */
let wordInfoSeq = 0

const current = computed(() => studying.value
  ? null
  : (queue.value[0] ?? null))
const remaining = computed(() => queue.value.length)

function playAudio(card?: StudyCard | null) {
  const c = card ?? current.value ?? studying.value
  if (!c)
    return
  const path = audioPath(c)
  managedAudio.play('local' in path
    ? resolveAudioUrl(path.local)
    : path.remote, c.word.replace(/\*/g, ''))
}

function buildQueue() {
  const plan = props.build()
  queue.value = plan.items.map(({ card, isNew }) => ({
    ...card,
    attempts: 0,
    isNew,
    counted: false,
  }))
  initialTotal.value = queue.value.length
  reviewCount.value = plan.reviewCount
  dueCount.value = plan.dueCount
  newCount.value = plan.newCount
  bestGrade.value = {}
  gradeHistory.value = []
  stats.value = { known: 0, vague: 0, unknown: 0 }
  finished.value = initialTotal.value === 0
  studying.value = null
  lastGrade.value = null
  wordInfoSeq++
  if (queue.value.length > 0)
    playAudio(queue.value[0])
}
watch(() => props.version, () => {
  if (props.ready)
    buildQueue()
})

// 先自评：认识 / 模糊 / 不认识
function grade(g: 0 | 3 | 5) {
  const card = current.value
  if (!card || !props.ready)
    return
  const store = stores[card.deck]
  const meta = DECK_META[card.deck]
  const countedNew = card.isNew && !card.counted
  const prevSchedule = store.getSchedule(card.id)
  const nextSchedule = gradeSchedule(prevSchedule, g)
  const aliases = card.deck === 'vocabulary' && props.aliasIds
    ? props.aliasIds(card).filter(id => String(id) !== String(card.id))
    : []
  gradeHistory.value.push({
    card,
    grade: g,
    prevSchedule,
    postSchedule: JSON.parse(JSON.stringify(nextSchedule)),
    aliasSchedules: aliases.map(id => ({
      id,
      previous: store.getSchedule(id),
    })),
    prevBest: bestGrade.value[card.key],
    prevAttempts: card.attempts,
    countedNew,
    date: studyDay(),
  })
  store.setSchedule(card.id, nextSchedule)
  for (const id of aliases)
    store.setSchedule(id, nextSchedule)
  recordAttempt(meta.attemptNs, g)
  if (g === 5)
    stats.value.known++
  else if (g === 3)
    stats.value.vague++
  else stats.value.unknown++
  bestGrade.value[card.key] = Math.max(bestGrade.value[card.key] ?? -1, g)
  if (countedNew) {
    store.recordNewWord(card.id)
    card.counted = true
  }
  card.attempts++
  queue.value.shift()
  if (g !== 5) {
    // 模糊 / 不认识：记进错词本，本轮内再出现（不认识放队尾，模糊插到后面第 5 个，最多 3 次）
    addMistake(meta.mistakeModule, {
      key: mistakeKey(card),
      title: card.word,
      detail: `${card.pos} ${card.meaning}`.trim(),
      hint: mistakeHint(card),
    })
    if (card.attempts < 3) {
      const insertAt = g === 3
        ? Math.min(5, queue.value.length)
        : queue.value.length
      queue.value.splice(insertAt, 0, card)
    }
  }
  lastGrade.value = g
  studying.value = card
  playAudio(card)
}

// 返回上一个，重新测试：还原进度、本轮统计、学习统计、错题、复现次数和新词计数
function goBackOne() {
  const entry = gradeHistory.value.pop()
  if (!entry)
    return
  const { card, grade: g, prevSchedule, postSchedule, prevBest, prevAttempts, countedNew } = entry
  const store = stores[card.deck]
  const same = (id: string | number) => JSON.stringify(store.getSchedule(id)) === JSON.stringify(postSchedule)
  if (same(card.id)) {
    if (prevSchedule)
      store.setSchedule(card.id, prevSchedule)
    else store.removeSchedule(card.id)
  }
  for (const alias of entry.aliasSchedules) {
    if (!same(alias.id))
      continue
    if (alias.previous)
      store.setSchedule(alias.id, alias.previous)
    else store.removeSchedule(alias.id)
  }
  if (prevBest === undefined)
    delete bestGrade.value[card.key]
  else bestGrade.value[card.key] = prevBest
  if (g === 5)
    stats.value.known = Math.max(0, stats.value.known - 1)
  else if (g === 3)
    stats.value.vague = Math.max(0, stats.value.vague - 1)
  else stats.value.unknown = Math.max(0, stats.value.unknown - 1)
  decrementAttempt(DECK_META[card.deck].attemptNs, g, entry.date)
  if (g !== 5)
    decrementMistake(mistakeKey(card), entry.date)
  if (countedNew) {
    store.decrementNewWord(card.id, entry.date)
    card.counted = false
  }
  card.attempts = prevAttempts
  queue.value = queue.value.filter(c => c.key !== card.key)
  queue.value.unshift(card)
  studying.value = null
  lastGrade.value = null
  playAudio(card)
}

// 完成屏按每个词的最好成绩去重计数
const finishStats = computed(() => {
  const vals = Object.values(bestGrade.value)
  return {
    known: vals.filter(v => v === 5).length,
    vague: vals.filter(v => v === 3).length,
    unknown: vals.filter(v => v === 0).length,
  }
})
function next() {
  studying.value = null
  lastGrade.value = null
  wordInfoSeq++
  if (queue.value.length === 0)
    finishSession()
  else playAudio(queue.value[0])
}
function finishSession() {
  finished.value = true
  emit('finished', { known: finishStats.value.known, total: initialTotal.value })
  if (Object.keys(bestGrade.value).length > 0)
    doCheckin()
}
function restart() {
  buildQueue()
}

// —— 词汇表卡片的详情（例句、拓展词）和联网例句、同义词 ——
const wordInfo = ref<WordInfo | null>(null)
const wordInfoError = ref(false)
const cardDetailsError = ref(false)
const wordInfoLoading = ref(false)
async function loadWordInfo(card: SessionCard) {
  const sequence = ++wordInfoSeq
  const owner = useAuth().currentUser.value
  const isActive = () => sequence === wordInfoSeq
    && owner === useAuth().currentUser.value
    && (current.value || studying.value) === card
  wordInfo.value = null
  wordInfoError.value = false
  cardDetailsError.value = false
  if (card.deck !== 'vocabulary')
    return
  wordInfoLoading.value = true
  try {
    const details = await loadVocabularyDetails(card.chapter)
    const detail = details[String(card.id)]
    // 详情晚到也补到这张卡上（哪怕已经自评、正在看词条）
    if (detail) {
      card.example = detail.example
      card.extra = detail.extra
      card.hintWords = parseExtra(detail.extra).map(x => x.word).slice(0, 3)
      if (card.example)
        patchMistakeHint(mistakeKey(card), card.example)
    }
  }
  catch {
    if (isActive())
      cardDetailsError.value = true
  }
  if (!isActive())
    return
  try {
    const info = await loadWordInfoWithFallback([card.word, ...card.hintWords])
    if (isActive())
      wordInfo.value = info
  }
  catch {
    if (isActive())
      wordInfoError.value = true
  }
  finally {
    if (isActive())
      wordInfoLoading.value = false
  }
  if (isActive() && wordInfo.value?.synonyms.length) {
    ensureSynonymPos()
    ensureVocabularyPos()
  }
}
function retryWordInfo() {
  const card = current.value || studying.value
  if (card)
    return loadWordInfo(card)
}
watch(() => current.value || studying.value, (c) => {
  if (c)
    loadWordInfo(c)
})
const studyLapses = computed(() => studying.value
  ? stores[studying.value.deck].getSchedule(studying.value.id)?.lapses ?? 0
  : 0)
function deckLabel(card: StudyCard) {
  const name = DECK_META[card.deck].name
  return card.deck === 'vocabulary' && card.chapter
    ? `${name} · ${card.chapter.replace(/^\d+_/, '')}`
    : name
}

// 退出：先显示这次学了多久
const showExitModal = ref(false)
const sessionTotal = ref(0)
function handleBack() {
  sessionTotal.value += timer.pause()
  showExitModal.value = true
}
function cancelExit() {
  showExitModal.value = false
  timer.resume()
}
function confirmExit() {
  showExitModal.value = false
  if (props.backLabel)
    emit('exit')
  else goBack()
}

const { currentUser } = useAuth()
watch(currentUser, () => {
  queue.value = []
  gradeHistory.value = []
  studying.value = null
  finished.value = true
  bestGrade.value = {}
  stats.value = { known: 0, vague: 0, unknown: 0 }
  initialTotal.value = 0
  reviewCount.value = 0
  dueCount.value = 0
  newCount.value = 0
  sessionTotal.value = 0
}, { flush: 'sync' })
onMounted(() => {
  if (props.ready)
    buildQueue()
  timer.start()
})
onUnmounted(() => {
  wordInfoSeq++
})
defineExpose({ restart })
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-900 lg:px-8 sm:px-6">
    <div class="mx-auto max-w-2xl">
      <p v-if="wordInfoError || cardDetailsError" role="alert" class="mb-3 text-sm text-amber-700">
        {{ cardDetailsError ? '章节例句与词条详情加载失败。' : '例句和同义词加载失败。' }}
        <button class="underline" :disabled="wordInfoLoading" @click="retryWordInfo">
          重试加载
        </button>
      </p>
      <p v-if="synonymPosError" class="mb-3 text-sm text-amber-700" role="status">
        同义词词性暂未加载。<button class="underline" @click="ensureSynonymPos">
          重试
        </button>
      </p>

      <!-- Header -->
      <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <button
            class="shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← 返回{{ backLabel || '背单词' }}
          </button>
          <div>
            <h1 class="text-2xl text-gray-900 font-extrabold dark:text-white">
              {{ title }}
            </h1>
            <p v-if="subtitle" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ subtitle }}
            </p>
          </div>
        </div>
        <slot name="controls" />
      </div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-gray-400">
          本轮：复习 {{ reviewCount }}（到期 {{ dueCount }}） · 新词 {{ newCount }}
          <slot name="plan" />
        </p>
        <div class="flex items-center gap-2">
          <span class="border border-blue-200 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-bold dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300" title="本次学习计时">
            ⏱ {{ formatClock(timer.elapsed.value) }}
          </span>
          <span class="text-xs text-gray-400" :title="`今日累计学习时长（目标 ${formatDuration(timer.dailyGoal)}）`">
            今日 {{ formatDuration(timer.dailySeconds.value) }}
          </span>
          <span class="text-xs text-orange-500 font-bold">🔥 连续打卡 {{ checkinStreak }} 天</span>
          <div class="flex gap-1">
            <span
              v-for="(d, i) in checkinWeekDots"
              :key="i"
              :title="d.label"
              class="inline-block h-3 w-3 rounded-full"
              :class="d.checked ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'"
            />
          </div>
        </div>
      </div>

      <p v-if="!ready" class="mb-3 text-sm text-gray-500" role="status">
        词表加载中…
      </p>

      <div v-if="!finished" class="grid grid-cols-4 mb-6 gap-3 text-center">
        <div class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-1 text-xs text-gray-500">
            本轮剩余
          </div>
          <div class="text-lg font-bold dark:text-white">
            {{ remaining }}
          </div>
        </div>
        <div class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-1 text-xs text-gray-500">
            认识
          </div>
          <div class="text-lg text-green-600 font-bold">
            {{ stats.known }}
          </div>
        </div>
        <div class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-1 text-xs text-gray-500">
            不认识
          </div>
          <div class="text-lg text-red-600 font-bold">
            {{ stats.unknown }}
          </div>
        </div>
        <div class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-1 text-xs text-gray-500">
            模糊
          </div>
          <div class="text-lg text-yellow-600 font-bold">
            {{ stats.vague }}
          </div>
        </div>
      </div>

      <!-- 完成屏 -->
      <div v-if="finished" class="border border-gray-200 rounded-2xl bg-white p-8 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800" data-finish>
        <h2 class="mb-4 text-2xl font-bold dark:text-white">
          {{ initialTotal === 0 ? '这一轮没有要学的词' : '本轮完成 🎉' }}
        </h2>
        <div v-if="initialTotal > 0" class="mb-6 flex justify-center gap-6 text-sm">
          <span class="text-green-600 font-bold">认识 {{ finishStats.known }}</span>
          <span class="text-red-600 font-bold">不认识 {{ finishStats.unknown }}</span>
          <span class="text-yellow-600 font-bold">模糊 {{ finishStats.vague }}</span>
        </div>
        <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {{ initialTotal === 0 ? (emptyText || '今天的新词已学完，到期复习会按时出现') : '没掌握的词已按记忆曲线安排复现，并记入错词本' }}
        </p>
        <div class="flex justify-center gap-3">
          <button class="rounded-lg bg-blue-700 px-6 py-2.5 text-sm text-white font-medium dark:bg-blue-600 hover:bg-blue-800" @click="restart">
            再来一轮
          </button>
          <button class="rounded-lg bg-gray-200 px-6 py-2.5 text-sm text-gray-700 font-medium dark:bg-gray-700 hover:bg-gray-300 dark:text-gray-200" @click="handleBack">
            返回{{ backLabel || '背单词' }}
          </button>
        </div>
      </div>

      <!-- 自评 -->
      <div v-else-if="current" class="overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800" data-card>
        <div class="p-8 text-center">
          <div class="mb-2">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="current.isNew ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'"
            >{{ current.isNew ? '新词' : '复习' }}</span>
          </div>
          <div class="mb-2 flex items-center justify-center gap-3">
            <span class="text-4xl text-gray-900 font-black tracking-tight sm:text-5xl dark:text-white" data-word>{{ current.word }}</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" @click="playAudio()">
              <i class="i-ph-speaker-high-bold block text-2xl" />
            </button>
          </div>
          <p v-if="current.deck === 'vocabulary' && phonetic(current.word)" class="mb-2 text-lg text-gray-400" style="font-family: times">
            {{ phonetic(current.word) }}
          </p>
          <p v-if="showDeck" class="text-xs text-gray-400" data-deck-label>
            来自 {{ deckLabel(current) }}
          </p>
          <VocabCardHints
            v-if="current.deck === 'vocabulary'"
            :key="`pre-${current.key}`"
            :card="current"
            phase="pre"
            :word-info="wordInfo"
          />
          <p class="mb-6 mt-4 text-sm text-gray-400">
            看到这个词，第一感觉是？
          </p>
          <div class="grid grid-cols-3 gap-3">
            <button class="border border-red-200 rounded-xl bg-red-50 py-4 text-red-700 font-bold dark:border-red-800 dark:bg-red-900/20 hover:bg-red-100 dark:text-red-300 disabled:opacity-50" :disabled="!ready" @click="grade(0)">
              不认识
            </button>
            <button class="border border-yellow-200 rounded-xl bg-yellow-50 py-4 text-yellow-700 font-bold dark:border-yellow-800 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:text-yellow-300 disabled:opacity-50" :disabled="!ready" @click="grade(3)">
              模糊
            </button>
            <button class="border border-green-200 rounded-xl bg-green-50 py-4 text-green-700 font-bold dark:border-green-800 dark:bg-green-900/20 hover:bg-green-100 dark:text-green-300 disabled:opacity-50" :disabled="!ready" @click="grade(5)">
              认识
            </button>
          </div>
        </div>
      </div>

      <!-- 看词条 -->
      <div v-else-if="studying" class="overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800" data-study>
        <div class="p-8">
          <div class="mb-2 text-center">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="lastGrade === 5 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : lastGrade === 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'"
            >{{ lastGrade === 5 ? '认识 · 确认一下' : lastGrade === 0 ? '不认识 · 记一下' : '模糊 · 再看看' }}</span>
          </div>
          <div class="mb-4 flex items-center justify-center gap-3">
            <span class="text-3xl text-gray-900 font-black dark:text-white">{{ studying.word }}</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" @click="playAudio()">
              <i class="i-ph-speaker-high-bold block text-xl" />
            </button>
          </div>
          <p v-if="studying.deck === 'vocabulary' && phonetic(studying.word)" class="mb-4 text-center text-lg text-gray-400" style="font-family: times">
            {{ phonetic(studying.word) }}
          </p>
          <p v-if="showDeck" class="mb-2 text-center text-xs text-gray-400">
            来自 {{ deckLabel(studying) }}
          </p>
          <div class="mb-4 text-center">
            <span v-if="studying.pos" class="mr-2 text-sm text-gray-400 italic" style="font-family: times">{{ studying.pos }}</span>
            <span class="text-xl text-gray-800 font-medium dark:text-gray-200">{{ studying.meaning }}</span>
          </div>

          <VocabCardHints
            v-if="studying.deck === 'vocabulary'"
            :key="`post-${studying.key}`"
            :card="studying"
            phase="post"
            :word-info="wordInfo"
            :lapses="studyLapses"
          />
          <template v-else>
            <div v-if="studying.synonyms.length > 0" class="mb-6 border border-teal-200 rounded-xl bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20" data-synonyms>
              <div class="mb-2 text-sm text-teal-700 font-bold dark:text-teal-300">
                🔗 同义替换
              </div>
              <p class="text-sm text-gray-700 leading-relaxed dark:text-gray-300">
                {{ studying.synonyms.join(' · ') }}
              </p>
            </div>
            <div v-if="studying.note" class="mb-6 border border-amber-200 rounded-xl bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20" data-note>
              <div class="mb-2 text-sm text-amber-700 font-bold dark:text-amber-300">
                ✏️ 拼写要点
              </div>
              <p class="text-sm text-gray-700 leading-relaxed dark:text-gray-300">
                {{ studying.note }}
              </p>
            </div>
            <div v-if="studying.remark" class="mb-6 border border-gray-200 rounded-xl bg-white p-4 dark:border-gray-700 dark:bg-gray-800" data-remark>
              <div class="mb-2 text-sm text-gray-500 font-bold dark:text-gray-400">
                📝 备注
              </div>
              <p class="text-sm text-gray-700 leading-relaxed dark:text-gray-300">
                {{ studying.remark }}
              </p>
            </div>
          </template>

          <div class="flex gap-3">
            <button
              v-if="gradeHistory.length > 0"
              class="flex-1 border border-gray-300 rounded-xl py-3 text-sm text-gray-600 font-bold dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="goBackOne"
            >
              ↩ 返回上一个，重新测试
            </button>
            <button class="flex-1 rounded-xl bg-blue-600 py-3 text-sm text-white font-bold hover:bg-blue-700" @click="next">
              下一个
            </button>
          </div>
        </div>
      </div>

      <!-- 退出结算弹窗 -->
      <div v-if="showExitModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="cancelExit">
        <div class="max-w-sm w-full rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-gray-800">
          <h3 class="mb-3 text-lg text-gray-900 font-bold dark:text-white">
            本次学习结束
          </h3>
          <p class="mb-2 text-3xl text-blue-600 font-black dark:text-blue-400">
            {{ formatDuration(sessionTotal) }}
          </p>
          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            今日累计 {{ formatDuration(timer.dailySeconds.value) }}
          </p>
          <div class="flex gap-3">
            <button class="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm text-gray-600 font-bold dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" @click="cancelExit">
              继续学习
            </button>
            <button class="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm text-white font-bold hover:bg-blue-700" @click="confirmExit">
              退出
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- 通用考点词自测卡片：听力 179 / 阅读 538 共用
     与词汇自测卡片（/vocabulary/flashcard）是独立入口、独立进度 -->
<script setup lang="ts">
import { speechLanguage, useAudioGroup } from '../composables/useAudioGroup'
import { studyDay } from '../composables/useStudyData'

import { gradeSchedule } from '../composables/useSpacedRepetition'
import { decrementAttempt, recordAttempt } from '../composables/useStats'
import { planQueue, useDeckStore } from '../composables/useDeckStore'
import {
  formatClock,
  formatDuration,
  useStudyTimer,
} from '../composables/useStudyTimer'
import { useGoBack } from '../composables/useGoBack'
import type { MistakeModule, ProgressModule } from '../composables/useStudyData'

const props = defineProps<{
  /** 存储隔离命名空间，如 listening179 / reading538 */
  ns: string
  title: string
  subtitle?: string
  backTo: string
  backLabel?: string
  cards: DeckCard[]
  /** 发音音频 URL（相对路径，自动适配部署基址） */
  audioFor: (word: string) => string
  mistakeModule: MistakeModule
  progressModule: ProgressModule
}>()

const managedAudio = useAudioGroup()

export interface DeckCard {
  id: string | number
  word: string
  pos: string
  meaning: string
  synonyms: string[]
}

interface Card extends DeckCard {
  attempts: number
  isNew: boolean
  counted: boolean
}

const deck = useDeckStore(props.ns)
const { goBack } = useGoBack(props.backTo)
const timer = useStudyTimer()
const showExitModal = ref(false)
// 页面级累计：每次退出弹窗的 pause() 段秒数累加，弹窗显示进页总时长
// （timer.pause() 只返回当前段，取消退出再退会只显示最后一段）
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
  // 站内栈有上一步则回上一步，否则去默认返回页，绝不离站
  goBack()
}
const { addMistake, decrementMistake } = useMistakes()
const { setProgress } = useProgress()
const {
  streak: checkinStreak,
  weekDots: checkinWeekDots,
  checkin: doCheckin,
} = useCheckin()

const goalProxy = computed({
  get: () => deck.goal.value,
  set: (v: string | number) => deck.setGoal(Number(v)),
})

const queue = ref<Card[]>([])
const initialTotal = ref(0)
const reviewCount = ref(0)
const dueCount = ref(0)
const newCount = ref(0)
const bestGrade = ref<Record<string, number>>({})
const stats = ref({ known: 0, vague: 0, unknown: 0 })
const finished = ref(false)
const studying = ref<Card | null>(null)
const lastGrade = ref<0 | 3 | 5 | null>(null)

const current = computed(() =>
  !studying.value ? (queue.value[0] ?? null) : null,
)
const remaining = computed(() => queue.value.length)

let audio: HTMLAudioElement | null = null
function playAudio(word?: string) {
  const w = word || current.value?.word || studying.value?.word
  if (!w)
    return
  try {
    // 新播放先取消旧朗读，避免 TTS 与新音频叠加
    speechSynthesis.cancel()
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    audio = managedAudio.create()
    audio.src = props.audioFor(w)
    // MP3 不存在时用浏览器朗读兜底（onerror 与 play().catch 只触发一次）
    let fellBack = false
    const fallback = () => {
      if (fellBack)
        return
      fellBack = true
      const u = new SpeechSynthesisUtterance(w)
      u.lang = speechLanguage()
      speechSynthesis.speak(u)
    }
    audio.onerror = fallback
    audio.play().catch(fallback)
  }
  catch {
    // 忽略音频异常
  }
}

function toCard(c: DeckCard, isNew: boolean): Card {
  return { ...c, attempts: 0, isNew, counted: false }
}

const gradeHistory = ref<GradeHistoryEntry[]>([])

function buildQueue() {
  // 复习配额 = 3 × 每日新词目标（1:3）：到期优先，不足时从已学词里补；新词按今日剩余名额取
  const plan = planQueue(
    props.cards,
    id => deck.getSchedule(id),
    deck.goal.value,
    deck.remaining.value,
  )
  queue.value = [
    ...plan.reviews.map(c => toCard(c, false)),
    ...plan.newWords.map(c => toCard(c, true)),
  ]
  initialTotal.value = queue.value.length
  reviewCount.value = plan.reviews.length
  dueCount.value = plan.dueCount
  newCount.value = plan.newWords.length
  bestGrade.value = {}
  gradeHistory.value = []
  stats.value = { known: 0, vague: 0, unknown: 0 }
  finished.value = initialTotal.value === 0
  studying.value = null
  lastGrade.value = null
  if (queue.value.length > 0)
    playAudio(queue.value[0].word)
}

// 自评历史：用于“返回上一个”时还原（对照词汇卡片）
// postSchedule 用于拉取重载后校验：当前调度与评分后快照不一致时跳过调度恢复，避免旧快照覆盖他设备的新值
interface GradeHistoryEntry {
  card: Card
  grade: 0 | 3 | 5
  prevSchedule: ReturnType<typeof deck.getSchedule>
  postSchedule: ReturnType<typeof deck.getSchedule>
  prevBest: number | undefined
  prevAttempts: number
  countedNew: boolean
  date: string
}

// 先自评：认识 / 不认识 / 模糊
function grade(g: 0 | 3 | 5) {
  const card = current.value
  if (!card)
    return
  const countedNew = card.isNew && !card.counted
  const nextSchedule = gradeSchedule(deck.getSchedule(card.id), g)
  gradeHistory.value.push({
    card,
    grade: g,
    prevSchedule: deck.getSchedule(card.id),
    postSchedule: JSON.parse(JSON.stringify(nextSchedule)),
    prevBest: bestGrade.value[card.id],
    prevAttempts: card.attempts,
    countedNew,
    date: studyDay(),
  })
  deck.setSchedule(card.id, nextSchedule)
  recordAttempt(props.ns, g)
  if (g === 5)
    stats.value.known++
  else if (g === 3)
    stats.value.vague++
  else stats.value.unknown++
  bestGrade.value[card.id] = Math.max(bestGrade.value[card.id] ?? -1, g)
  if (countedNew) {
    deck.recordNewWord(card.id)
    card.counted = true
  }
  card.attempts++
  queue.value.shift()

  if (g !== 5) {
    addMistake(props.mistakeModule, {
      key: `${props.ns}:${card.id}`,
      title: card.word,
      detail: `${card.pos} ${card.meaning}`.trim(),
      hint: card.synonyms.slice(0, 4).join(' / '),
    })
    if (card.attempts < 3) {
      const insertAt
        = g === 3 ? Math.min(5, queue.value.length) : queue.value.length
      queue.value.splice(insertAt, 0, card)
    }
  }
  lastGrade.value = g
  studying.value = card
  playAudio(card.word)
}

// 返回上一个，重新测试：还原调度、本轮统计、统计页累计、复现次数与新词计数
function goBackOne() {
  const entry = gradeHistory.value.pop()
  if (!entry)
    return
  const {
    card,
    grade: g,
    prevSchedule,
    postSchedule,
    prevBest,
    prevAttempts,
    countedNew,
  } = entry
  // 拉取重载可能已把该词调度换成他设备的新值：当前值与评分后快照不一致时，
  // 跳过调度恢复（只恢复计数类项目），避免旧快照覆盖他设备的新值
  if (
    JSON.stringify(deck.getSchedule(card.id)) === JSON.stringify(postSchedule)
  ) {
    if (prevSchedule)
      deck.setSchedule(card.id, prevSchedule)
    else deck.removeSchedule(card.id)
  }
  if (prevBest === undefined)
    delete bestGrade.value[card.id]
  else bestGrade.value[card.id] = prevBest
  if (g === 5)
    stats.value.known = Math.max(0, stats.value.known - 1)
  else if (g === 3)
    stats.value.vague = Math.max(0, stats.value.vague - 1)
  else stats.value.unknown = Math.max(0, stats.value.unknown - 1)
  decrementAttempt(props.ns, g, entry.date)
  if (g !== 5)
    decrementMistake(`${props.ns}:${card.id}`, entry.date)
  if (countedNew) {
    deck.decrementNewWord(card.id, entry.date)
    card.counted = false
  }
  card.attempts = prevAttempts
  queue.value = queue.value.filter(c => c.id !== card.id)
  queue.value.unshift(card)
  studying.value = null
  lastGrade.value = null
  playAudio(card.word)
}

// 完成屏统计按卡片最佳成绩去重计数，不按自评次数累加
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
  if (queue.value.length === 0)
    finishSession()
  else playAudio(queue.value[0].word)
}

function finishSession() {
  finished.value = true
  const known = Object.values(bestGrade.value).filter(v => v === 5).length
  setProgress(props.progressModule, known, initialTotal.value)
  if (Object.keys(bestGrade.value).length > 0)
    doCheckin()
}

function restart() {
  buildQueue()
}

// 重置记忆：二次确认后清空本卡片的 SM-2 调度 + 自测进度 + 今日新词计数
function resetMemory() {
  const ok = window.confirm(
    '确定要重置记忆吗？此操作不可撤销。\n\n将清除：\n- 本卡片全部单词的记忆曲线（所有词回到新词）\n- 本卡片自测进度\n- 今日已学新词计数\n\n不受影响：错词本、打卡、模考记录、学习统计历史',
  )
  if (!ok)
    return
  deck.clear()
  setProgress(props.progressModule, 0, 0)
  deck.resetDaily()
  timer.pause()
  buildQueue()
  timer.resume()
}

const { currentUser: sessionUser } = useAuth()
watch(
  sessionUser,
  () => {
    queue.value = []
    gradeHistory.value = []
    studying.value = null
    finished.value = true
    // 与 buildQueue 的重置项对齐：切账号后完成屏不再用旧账号残留渲染
    bestGrade.value = {}
    stats.value = { known: 0, vague: 0, unknown: 0 }
    initialTotal.value = 0
    reviewCount.value = 0
    dueCount.value = 0
    newCount.value = 0
    sessionTotal.value = 0
    timer.pause()
  },
  { flush: 'sync' },
)
onMounted(() => {
  buildQueue()
  timer.start()
})

// 离页时停掉 TTS 与音频，避免后台继续出声
onUnmounted(() => {
  speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio = null
  }
})
</script>

<template>
  <div
    class="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-900 lg:px-8 sm:px-6"
  >
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <button
            class="shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← {{ backLabel || '返回' }}
          </button>
          <div>
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">
              {{ title }}
            </h1>
            <p
              v-if="subtitle"
              class="mt-1 text-sm text-gray-500 dark:text-gray-400"
            >
              {{ subtitle }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model.lazy="goalProxy"
            type="number"
            min="1"
            max="500"
            title="每日学习数量（可自定义，下轮生效）"
            class="block w-20 border border-gray-300 rounded-lg bg-white p-2.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-blue-500"
          >
          <span class="text-sm text-gray-500 dark:text-gray-400">个/天</span>
          <button
            title="重置记忆：全部单词回到新词，从 0 开始"
            class="shrink-0 border border-red-300 rounded-lg bg-white px-3 py-2.5 text-sm text-red-600 dark:border-red-800 dark:bg-gray-800 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            @click="resetMemory"
          >
            🔄 重置记忆
          </button>
        </div>
      </div>
      <!-- 打卡 + 今日计划 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-gray-400">
          今日计划：复习 {{ reviewCount }}（到期 {{ dueCount }}） · 新词
          {{ newCount }} ｜ 今日新词 {{ deck.dailyCount }} / {{ deck.goal }}
        </p>
        <div class="flex items-center gap-2">
          <span
            class="border border-blue-200 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
            title="本次学习计时"
          >
            ⏱ {{ formatClock(timer.elapsed.value) }}
          </span>
          <span
            class="text-xs text-gray-400"
            title="今日累计学习时长（目标 2 小时）"
          >
            今日 {{ formatDuration(timer.dailySeconds.value) }}
          </span>
          <div
            class="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            title="今日目标 2 小时"
          >
            <div
              class="h-full rounded-full bg-green-500 transition-all"
              :style="{
                width: `${Math.min(
                  100,
                  (timer.dailySeconds.value / timer.dailyGoal) * 100,
                )}%`,
              }"
            />
          </div>
          <span class="text-xs font-bold text-orange-500">🔥 连续打卡 {{ checkinStreak }} 天</span>
          <div class="flex gap-1">
            <span
              v-for="(d, i) in checkinWeekDots"
              :key="i"
              :title="d.label"
              class="inline-block h-3 w-3 rounded-full"
              :class="
                d.checked ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
              "
            />
          </div>
        </div>
      </div>

      <!-- Session stats -->
      <div v-if="!finished" class="grid grid-cols-4 mb-6 gap-3 text-center">
        <div
          class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs text-gray-500">
            本轮剩余
          </div>
          <div class="text-lg font-bold dark:text-white">
            {{ remaining }}
          </div>
        </div>
        <div
          class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs text-gray-500">
            认识（自评次数）
          </div>
          <div class="text-lg font-bold text-green-600">
            {{ stats.known }}
          </div>
        </div>
        <div
          class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs text-gray-500">
            不认识（自评次数）
          </div>
          <div class="text-lg font-bold text-red-600">
            {{ stats.unknown }}
          </div>
        </div>
        <div
          class="border border-gray-200 rounded-xl bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs text-gray-500">
            模糊（自评次数）
          </div>
          <div class="text-lg font-bold text-yellow-600">
            {{ stats.vague }}
          </div>
        </div>
      </div>

      <!-- Finish screen -->
      <div
        v-if="finished"
        class="border border-gray-200 rounded-2xl bg-white p-8 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 class="mb-4 text-2xl font-bold dark:text-white">
          {{ initialTotal === 0 ? '今日目标已完成 🎉' : '本轮完成 🎉' }}
        </h2>
        <div
          v-if="initialTotal > 0"
          class="mb-6 flex justify-center gap-6 text-sm"
        >
          <span class="font-bold text-green-600">认识 {{ finishStats.known }}</span>
          <span class="font-bold text-red-600">不认识 {{ finishStats.unknown }}</span>
          <span class="font-bold text-yellow-600">模糊 {{ finishStats.vague }}</span>
        </div>
        <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {{
            initialTotal === 0
              ? `今日新词已学完（${deck.dailyCount} / ${deck.goal}），到期复习会按时出现`
              : '没掌握的词已按记忆曲线安排复现，并记入错词本'
          }}
        </p>
        <div class="flex justify-center gap-3">
          <button
            class="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800"
            @click="restart"
          >
            再来一轮
          </button>
          <button
            class="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 dark:bg-gray-700 hover:bg-gray-300 dark:text-gray-200"
            @click="handleBack"
          >
            {{ backLabel || '返回' }}
          </button>
        </div>
      </div>

      <!-- 自评卡片：先显示三个选项 -->
      <div
        v-else-if="current"
        class="overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="p-8 text-center">
          <div class="mb-2">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="
                current.isNew
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
              "
            >
              {{ current.isNew ? '新词' : '复习' }}
            </span>
          </div>
          <div class="mb-2 flex items-center justify-center gap-3">
            <span
              class="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl dark:text-white"
            >{{ current.word }}</span>
            <button
              class="p-2 text-gray-400 hover:text-blue-500"
              title="播放发音"
              @click="playAudio()"
            >
              <i class="i-ph-speaker-high-bold block text-2xl" />
            </button>
          </div>

          <p class="mb-6 mt-4 text-sm text-gray-400">
            看到这个词，第一感觉是？
          </p>
          <div class="grid grid-cols-3 gap-3">
            <button
              class="border border-red-200 rounded-xl bg-red-50 py-4 font-bold text-red-700 dark:border-red-800 dark:bg-red-900/20 hover:bg-red-100 dark:text-red-300"
              @click="grade(0)"
            >
              不认识
            </button>
            <button
              class="border border-yellow-200 rounded-xl bg-yellow-50 py-4 font-bold text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:text-yellow-300"
              @click="grade(3)"
            >
              模糊
            </button>
            <button
              class="border border-green-200 rounded-xl bg-green-50 py-4 font-bold text-green-700 dark:border-green-800 dark:bg-green-900/20 hover:bg-green-100 dark:text-green-300"
              @click="grade(5)"
            >
              认识
            </button>
          </div>
        </div>
      </div>

      <!-- 词条学习：按选择展示 -->
      <div
        v-else-if="studying"
        class="overflow-hidden border border-gray-200 rounded-2xl bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="p-8">
          <div class="mb-2 text-center">
            <span
              class="inline-block rounded-full px-3 py-1 text-xs font-bold"
              :class="
                lastGrade === 5
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : lastGrade === 0
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
              "
            >
              {{
                lastGrade === 5
                  ? '认识 · 确认一下'
                  : lastGrade === 0
                    ? '不认识 · 记一下'
                    : '模糊 · 再看看'
              }}
            </span>
          </div>
          <div class="mb-4 flex items-center justify-center gap-3">
            <span class="text-3xl font-black text-gray-900 dark:text-white">{{
              studying.word
            }}</span>
            <button
              class="p-2 text-gray-400 hover:text-blue-500"
              title="播放发音"
              @click="playAudio()"
            >
              <i class="i-ph-speaker-high-bold block text-xl" />
            </button>
          </div>
          <div class="mb-4 text-center">
            <span
              v-if="studying.pos"
              class="mr-2 text-sm italic text-gray-400"
              style="font-family: times"
            >{{ studying.pos }}</span>
            <span
              class="text-xl font-medium text-gray-800 dark:text-gray-200"
            >{{ studying.meaning }}</span>
          </div>

          <!-- 同义替换 -->
          <div
            v-if="studying.synonyms.length > 0"
            class="mb-6 border border-teal-200 rounded-xl bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20"
          >
            <div
              class="mb-2 text-sm font-bold text-teal-700 dark:text-teal-300"
            >
              🔗 同义替换
            </div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {{ studying.synonyms.join(' · ') }}
            </p>
          </div>

          <div class="flex gap-3">
            <button
              v-if="gradeHistory.length > 0"
              class="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-bold text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="goBackOne"
            >
              ↩ 返回上一个，重新测试
            </button>
            <button
              class="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
              @click="next"
            >
              下一个
            </button>
          </div>
        </div>
      </div>

      <!-- 退出结算弹窗 -->
      <div
        v-if="showExitModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="cancelExit"
      >
        <div
          class="max-w-sm w-full rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-gray-800"
        >
          <h3 class="mb-3 text-lg font-bold text-gray-900 dark:text-white">
            本次学习结束
          </h3>
          <p class="mb-2 text-3xl font-black text-blue-600 dark:text-blue-400">
            {{ formatDuration(sessionTotal) }}
          </p>
          <p class="mb-1 text-sm text-gray-500 dark:text-gray-400">
            今日累计 {{ formatDuration(timer.dailySeconds.value) }}
          </p>
          <div
            class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              class="h-full rounded-full bg-green-500 transition-all"
              :style="{
                width: `${Math.min(
                  100,
                  (timer.dailySeconds.value / timer.dailyGoal) * 100,
                )}%`,
              }"
            />
          </div>
          <p class="mb-4 text-xs text-gray-400">
            {{
              timer.dailySeconds.value >= timer.dailyGoal
                ? '今日目标已达成 🎉'
                : `距离今日目标 2 小时还差 ${formatDuration(timer.dailyGoal - timer.dailySeconds.value)}`
            }}
          </p>
          <div class="flex gap-3">
            <button
              class="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-bold text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
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

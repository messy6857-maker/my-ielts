<!-- 通用考点词自测卡片：听力 179 / 阅读 538 共用
     与词汇自测卡片（/vocabulary/flashcard）是独立入口、独立进度 -->
<script setup lang="ts">
import type { MistakeModule, ProgressModule } from '../composables/useStudyData'
import { planQueue, useDeckStore } from '../composables/useDeckStore'
import { gradeSchedule } from '../composables/useSpacedRepetition'
import { formatClock, formatDuration, useStudyTimer } from '../composables/useStudyTimer'

export interface DeckCard {
  id: string | number
  word: string
  pos: string
  meaning: string
  synonyms: string[]
}

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

interface Card extends DeckCard {
  attempts: number
  isNew: boolean
  counted: boolean
}

const deck = useDeckStore(props.ns)
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
  router.push(props.backTo)
}
const { addMistake } = useMistakes()
const { setProgress } = useProgress()
const { streak: checkinStreak, weekDots: checkinWeekDots, checkin: doCheckin } = useCheckin()

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

const current = computed(() => (!studying.value ? queue.value[0] ?? null : null))
const remaining = computed(() => queue.value.length)

const audioPlayer = useAudioPlayer()
function playAudio(word?: string) {
  const w = word || current.value?.word || studying.value?.word
  if (w)
    audioPlayer.play(props.audioFor(w))
}

function toCard(c: DeckCard, isNew: boolean): Card {
  return { ...c, attempts: 0, isNew, counted: false }
}

function buildQueue() {
  // 复习配额 = 3 × 每日新词目标（1:3）：到期优先，不足时从已学词里补；新词按今日剩余名额取
  const plan = planQueue(props.cards, id => deck.getSchedule(id), deck.goal.value, deck.remaining.value)
  queue.value = [...plan.newWords.map(c => toCard(c, true)), ...plan.reviews.map(c => toCard(c, false))]
  initialTotal.value = queue.value.length
  reviewCount.value = plan.reviews.length
  dueCount.value = plan.dueCount
  newCount.value = plan.newWords.length
  bestGrade.value = {}
  stats.value = { known: 0, vague: 0, unknown: 0 }
  finished.value = initialTotal.value === 0
  studying.value = null
  lastGrade.value = null
  if (queue.value.length > 0)
    playAudio(queue.value[0].word)
}

// 先自评：认识 / 不认识 / 模糊
function grade(g: 0 | 3 | 5) {
  const card = current.value
  if (!card)
    return
  deck.setSchedule(card.id, gradeSchedule(deck.getSchedule(card.id), g))
  if (g === 5)
    stats.value.known++
  else if (g === 3)
    stats.value.vague++
  else
    stats.value.unknown++
  bestGrade.value[card.id] = Math.max(bestGrade.value[card.id] ?? -1, g)
  if (card.isNew && !card.counted) {
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
      const insertAt = g === 3 ? Math.min(5, queue.value.length) : queue.value.length
      queue.value.splice(insertAt, 0, card)
    }
  }
  lastGrade.value = g
  studying.value = card
  playAudio(card.word)
}

function next() {
  studying.value = null
  lastGrade.value = null
  if (queue.value.length === 0)
    finishSession()
  else
    playAudio(queue.value[0].word)
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

const { currentUser } = useAuth()
watch(currentUser, () => {
  audioPlayer.stop()
  showExitModal.value = false
  buildQueue()
  timer.start()
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
            class="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← {{ backLabel || '返回' }}
          </button>
          <div>
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">
{{ title }}
</h1>
            <p v-if="subtitle" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
            class="block w-20 border border-gray-300 rounded-lg bg-white p-2.5 text-sm text-center dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500"
          >
          <span class="text-sm text-gray-500 dark:text-gray-400">个/天</span>
        </div>
      </div>
      <!-- 打卡 + 今日计划 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-gray-400">
          今日计划：复习 {{ reviewCount }}（到期 {{ dueCount }}） · 新词 {{ newCount }} ｜
          今日新词 {{ deck.dailyCount }} / {{ deck.goal }}
        </p>
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300" title="本次学习计时">
            ⏱ {{ formatClock(timer.elapsed.value) }}
          </span>
          <span class="text-xs text-gray-400" title="今日累计学习时长（目标 2 小时）">
            今日 {{ formatDuration(timer.dailySeconds.value) }}
          </span>
          <div class="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" title="今日目标 2 小时">
            <div class="h-full bg-green-500 rounded-full transition-all" :style="{ width: `${Math.min(100, timer.dailySeconds.value / timer.dailyGoal * 100) }%` }" />
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
          <div class="text-xs text-gray-500 mb-1">
本轮剩余
</div>
          <div class="text-lg font-bold dark:text-white">
{{ remaining }}
</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">
认识
</div>
          <div class="text-lg font-bold text-green-600">
{{ stats.known }}
</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">
不认识
</div>
          <div class="text-lg font-bold text-red-600">
{{ stats.unknown }}
</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">
模糊
</div>
          <div class="text-lg font-bold text-yellow-600">
{{ stats.vague }}
</div>
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
            ? `今日新词已学完（${deck.dailyCount} / ${deck.goal}），到期复习会按时出现`
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
            {{ backLabel || '返回' }}
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

          <p class="text-sm text-gray-400 mt-4 mb-6">
看到这个词，第一感觉是？
</p>
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
            <span v-if="studying.pos" class="text-sm italic text-gray-400 mr-2" style="font-family: times;">{{ studying.pos }}</span>
            <span class="text-xl font-medium text-gray-800 dark:text-gray-200">{{ studying.meaning }}</span>
          </div>

          <!-- 同义替换 -->
          <div v-if="studying.synonyms.length > 0" class="mb-6 rounded-xl bg-teal-50 border border-teal-200 p-4 dark:bg-teal-900/20 dark:border-teal-800">
            <div class="mb-2 text-sm font-bold text-teal-700 dark:text-teal-300">
🔗 同义替换
</div>
            <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
{{ studying.synonyms.join(' · ') }}
</p>
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
          <h3 class="mb-3 text-lg font-bold text-gray-900 dark:text-white">
本次学习结束
</h3>
          <p class="mb-2 text-3xl font-black text-blue-600 dark:text-blue-400">
{{ formatDuration(lastSessionSec) }}
</p>
          <p class="mb-1 text-sm text-gray-500 dark:text-gray-400">
今日累计 {{ formatDuration(timer.dailySeconds.value) }}
</p>
          <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div class="h-full rounded-full bg-green-500 transition-all" :style="{ width: `${Math.min(100, timer.dailySeconds.value / timer.dailyGoal * 100) }%` }" />
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

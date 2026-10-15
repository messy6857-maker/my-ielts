<script setup lang="ts">
import { getMnemonic } from './mnemonics'
import { gradeSchedule } from '../../composables/useSpacedRepetition'
import vocabulary from './vocabulary'

interface Card {
  id: number
  word: string
  pos: string
  meaning: string
  example: string
  attempts: number
}

const CHAPTER_KEY = 'vocabulary_flashcard_chapter'
const chapters = Object.keys(vocabulary)
const category = ref(localStorage.getItem(CHAPTER_KEY) || chapters[0])

const { addMistake } = useMistakes()
const { setProgress } = useProgress()
const scheduleStore = useWordSchedule()

const queue = ref<Card[]>([])
const initialTotal = ref(0)
const studied = ref(0)
const bestGrade = ref<Record<number, number>>({})
const stats = ref({ known: 0, vague: 0, unknown: 0 })
const revealed = ref(false)
const finished = ref(false)
const showMnemonic = ref(false)

const current = computed(() => queue.value[0] ?? null)
const mnemonic = computed(() => (current.value ? getMnemonic(current.value.word) : null))
const lapses = computed(() => {
  if (!current.value)
    return 0
  return scheduleStore.get(current.value.id)?.lapses ?? 0
})

let audio: HTMLAudioElement | null = null
function playAudio() {
  if (!current.value)
    return
  try {
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    audio = document.createElement('audio')
    audio.src = `vocabulary/audio/${category.value}/${current.value.word}.mp3`
    audio.play().catch(() => {})
  }
  catch {
    // 忽略音频异常
  }
}

function buildQueue() {
  const chapter = (vocabulary as any)[category.value]
  const all = chapter ? chapter.words.flat() : []
  const now = Date.now()
  const due: any[] = []
  const fresh: any[] = []
  for (const w of all) {
    const s = scheduleStore.get(w.id)
    if (!s)
      fresh.push(w)
    else if (s.dueAt <= now)
      due.push(w)
  }
  due.sort((a, b) => (scheduleStore.get(a.id)?.dueAt ?? 0) - (scheduleStore.get(b.id)?.dueAt ?? 0))
  queue.value = [...due, ...fresh].map(w => ({
    id: w.id,
    word: w.word[0],
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    attempts: 0,
  }))
  initialTotal.value = queue.value.length
  studied.value = 0
  bestGrade.value = {}
  stats.value = { known: 0, vague: 0, unknown: 0 }
  finished.value = false
  revealed.value = false
  showMnemonic.value = false
  if (queue.value.length > 0)
    onNewCard()
}

function onNewCard() {
  revealed.value = false
  // 多次记错的词，自动展开巧记提示
  showMnemonic.value = lapses.value >= 2
  playAudio()
}

function reveal() {
  revealed.value = true
}

function grade(g: 0 | 3 | 5) {
  const card = current.value
  if (!card || !revealed.value)
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
  studied.value++
  // 模糊 / 不认识：记入错词本（计次）
  if (g !== 5) {
    addMistake('vocabulary', {
      key: `vocabulary:${card.id}`,
      title: card.word,
      detail: `${card.pos} ${card.meaning}`,
      hint: card.example,
    })
  }
  // 没掌握的词本轮内复现：不认识放队尾，模糊插到后面第 5 个
  card.attempts++
  queue.value.shift()
  if (g !== 5 && card.attempts < 3) {
    const insertAt = g === 3 ? Math.min(5, queue.value.length) : queue.value.length
    queue.value.splice(insertAt, 0, card)
  }
  if (queue.value.length === 0) {
    finishSession()
  }
  else {
    onNewCard()
  }
}

function finishSession() {
  finished.value = true
  const known = Object.values(bestGrade.value).filter(v => v === 5).length
  setProgress('flashcard', known, initialTotal.value)
}

function restart() {
  buildQueue()
}

watch(category, (newVal) => {
  localStorage.setItem(CHAPTER_KEY, newVal)
  buildQueue()
})

onMounted(() => {
  buildQueue()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">单词自测</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">先回想词义，再翻卡自评：认识 / 模糊 / 不认识</p>
        </div>
        <select
          v-model="category"
          class="block w-44 border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500"
        >
          <option v-for="c in chapters" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <!-- Session stats -->
      <div v-if="!finished" class="grid grid-cols-4 gap-3 mb-6 text-center">
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">本轮进度</div>
          <div class="text-lg font-bold dark:text-white">{{ studied }} / {{ initialTotal }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">认识</div>
          <div class="text-lg font-bold text-green-600">{{ stats.known }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">模糊</div>
          <div class="text-lg font-bold text-yellow-600">{{ stats.vague }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">不认识</div>
          <div class="text-lg font-bold text-red-600">{{ stats.unknown }}</div>
        </div>
      </div>

      <!-- Finish screen -->
      <div v-if="finished" class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 text-center">
        <h2 class="text-2xl font-bold mb-4 dark:text-white">本轮完成 🎉</h2>
        <div class="flex justify-center gap-6 mb-6 text-sm">
          <span class="text-green-600 font-bold">认识 {{ stats.known }}</span>
          <span class="text-yellow-600 font-bold">模糊 {{ stats.vague }}</span>
          <span class="text-red-600 font-bold">不认识 {{ stats.unknown }}</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          没掌握的词已按记忆曲线安排复现，并记入错词本
        </p>
        <div class="flex justify-center gap-3">
          <button
            class="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
            @click="restart"
          >
            再来一轮
          </button>
          <router-link
            to="/vocabulary"
            class="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          >
            返回词表
          </router-link>
        </div>
      </div>

      <!-- Card -->
      <div v-else-if="current" class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <!-- Word face -->
        <div class="p-8 text-center border-b border-gray-100 dark:border-gray-700">
          <div class="flex items-center justify-center gap-3 mb-2">
            <span class="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-white">{{ current.word }}</span>
            <button class="p-2 text-gray-400 hover:text-blue-500" title="播放发音" @click="playAudio">
              <i class="i-ph-speaker-high-bold text-2xl block" />
            </button>
          </div>
          <p v-if="!revealed" class="text-sm text-gray-400 mt-4">回想一下它的意思，然后翻开卡片</p>
          <button
            v-if="!revealed"
            class="mt-4 rounded-full bg-blue-600 px-8 py-2.5 text-white text-sm font-medium hover:bg-blue-700"
            @click="reveal"
          >
            显示释义
          </button>
        </div>

        <!-- Meaning face -->
        <div v-if="revealed" class="p-8">
          <div class="text-center mb-4">
            <span class="text-sm italic text-gray-400 mr-2" style="font-family: times;">{{ current.pos }}</span>
            <span class="text-xl font-medium text-gray-800 dark:text-gray-200">{{ current.meaning }}</span>
          </div>
          <p v-if="current.example" class="text-center text-gray-500 dark:text-gray-400 italic text-sm mb-6">
            {{ current.example }}
          </p>

          <!-- 巧记 -->
          <div class="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 dark:bg-amber-900/20 dark:border-amber-800">
            <button class="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300" @click="showMnemonic = !showMnemonic">
              <i class="i-carbon-idea block" />
              巧记提示
              <span v-if="lapses >= 2" class="text-xs font-normal text-amber-500">（这个词你已记错 {{ lapses }} 次）</span>
            </button>
            <div v-if="showMnemonic" class="mt-2 text-sm text-amber-800 dark:text-amber-200">
              <template v-if="mnemonic">
                <div class="flex flex-wrap gap-2 mb-1">
                  <span
                    v-for="(part, i) in mnemonic.parts"
                    :key="i"
                    class="rounded bg-amber-100 px-2 py-0.5 dark:bg-amber-900/50"
                  >{{ part.text }}<span class="text-amber-500">（{{ part.gloss }}）</span></span>
                </div>
                <p>{{ mnemonic.note }}</p>
              </template>
              <p v-else>试试拆音节跟读几遍，再结合上面的例句联想画面，效果会更好。</p>
            </div>
          </div>

          <!-- Grade buttons -->
          <div class="grid grid-cols-3 gap-3">
            <button
              class="rounded-xl bg-red-50 border border-red-200 py-3 text-red-700 font-bold hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
              @click="grade(0)"
            >
              不认识
            </button>
            <button
              class="rounded-xl bg-yellow-50 border border-yellow-200 py-3 text-yellow-700 font-bold hover:bg-yellow-100 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300"
              @click="grade(3)"
            >
              模糊
            </button>
            <button
              class="rounded-xl bg-green-50 border border-green-200 py-3 text-green-700 font-bold hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
              @click="grade(5)"
            >
              认识
            </button>
          </div>
        </div>
      </div>

      <div v-else class="text-center text-gray-400 py-16">
        本章暂无单词
      </div>
    </div>
  </div>
</template>

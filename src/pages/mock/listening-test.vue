<script setup lang="ts">
import { mockTestList, loadMockTest } from './registry'
import type { MockTestPair } from './registry'
import { bandScore, formatCountdown, isCorrect, multiSelectScore } from './types'
import type { MockQuestion } from './types'
import { useRouter, useRoute } from 'vue-router'
import { saveMockRecord } from '~/composables/useMockHistory'

const router = useRouter()
const route = useRoute()
const testId = computed(() => (route.query.test as string) || 'cam21-test1')
const testPair = ref<MockTestPair | null>(null)
const test = computed(() => testPair.value?.listening)
const loading = ref(true)
const loadError = ref(false)
const started = ref(false) // 点"开始测试"后才计时
const timeLeft = ref(0)
const answers = ref<Record<string, string>>({})
const submitted = ref(false)
const activePart = ref(0)
const audioEl = ref<HTMLAudioElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let loadSeq = 0

// audio 的 ref 写在 v-for 里，Vue 会收成数组；逐个暂停
function pauseAllAudio() {
  const els = audioEl.value as unknown as HTMLAudioElement | HTMLAudioElement[] | null
  if (Array.isArray(els))
    els.forEach(el => el?.pause?.())
  else
    els?.pause?.()
}

// 异步加载选中的套题（按需加载，不一次全载入）
// loadSeq 防止快速切换时旧的加载覆盖新的；try/finally 保证 loading 一定复位
async function loadTest() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = false
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
  try {
    const pair = await loadMockTest(testId.value)
    if (seq !== loadSeq)
      return // 已被更新的加载取代
    testPair.value = pair
    answers.value = {}
    submitted.value = false
    activePart.value = 0
    started.value = false
  }
  catch {
    if (seq !== loadSeq)
      return
    loadError.value = true
  }
  finally {
    if (seq === loadSeq)
      loading.value = false
  }
}

// 点"开始测试"才重置状态并开始计时
function startTest() {
  if (!testPair.value || started.value)
    return
  started.value = true
  timeLeft.value = testPair.value.listening.timeLimit
  answers.value = {}
  submitted.value = false
  activePart.value = 0
  if (timer)
    clearInterval(timer)
  timer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0)
      submit()
  }, 1000)
}

onMounted(loadTest)
watch(testId, loadTest)

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
})

function submit() {
  if (submitted.value)
    return
  submitted.value = true
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
  // 保存做题记录
  const qs = allQuestions.value
  const total = qs.reduce((s, q) => s + (q.type === 'multi-select' && Array.isArray(q.answer) ? q.answer.length : 1), 0)
  saveMockRecord({
    id: testId.value,
    label: testPair.value?.label ?? testId.value,
    kind: 'listening',
    score: correctCount.value,
    total,
    band: band.value,
  })
}

const allQuestions = computed<MockQuestion[]>(() =>
  test.value?.parts.flatMap(p => p.questions) ?? [],
)

// 满分题数（多选题按答案个数计）
const scoredTotal = computed(() =>
  allQuestions.value.reduce((s, q) => s + (q.type === 'multi-select' && Array.isArray(q.answer) ? q.answer.length : 1), 0),
)

const correctCount = computed(() => {
  if (!submitted.value)
    return 0
  return allQuestions.value.reduce((sum, q) => {
    const ans = answers.value[q.id] ?? ''
    return sum + (q.type === 'multi-select' ? multiSelectScore(q, ans) : (isCorrect(q, ans) ? 1 : 0))
  }, 0)
})

const band = computed(() => bandScore(correctCount.value))

function setAnswer(qid: string, val: string) {
  if (!submitted.value)
    answers.value[qid] = val
}

function toggleMultiSelect(qid: string, idx: number) {
  if (submitted.value)
    return
  const current = new Set((answers.value[qid] ?? '').split(',').filter(Boolean))
  const s = String(idx)
  if (current.has(s))
    current.delete(s)
  else
    current.add(s)
  answers.value[qid] = [...current].join(',')
}

function questionStatus(q: MockQuestion): 'correct' | 'wrong' | 'partial' | 'unanswered' {
  if (!submitted.value)
    return 'unanswered'
  const userAns = answers.value[q.id] ?? ''
  if (!userAns)
    return 'unanswered'
  if (q.type === 'multi-select') {
    const score = multiSelectScore(q, userAns)
    const max = Array.isArray(q.answer) ? q.answer.length : 1
    if (score === max)
      return 'correct'
    return score > 0 ? 'partial' : 'wrong'
  }
  return isCorrect(q, userAns) ? 'correct' : 'wrong'
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 pt-6 2xl:px-0">
    <div v-if="loading" class="py-20 text-center text-gray-500">
      加载中…
    </div>
    <div v-else-if="loadError" class="py-20 text-center">
      <p class="mb-4 text-4xl">😢</p>
      <p class="mb-4 text-gray-500 dark:text-gray-400">题目加载失败，可能是网络抖动</p>
      <button
        class="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700"
        @click="loadTest"
      >
        🔄 重新加载
      </button>
    </div>
    <template v-else-if="test">
    <!-- 开始屏：点开始才计时 -->
    <div v-if="!started" class="mx-auto max-w-2xl py-16 text-center">
      <p class="mb-4 text-5xl">🎧</p>
      <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        {{ test.title }}
      </h2>
      <p class="mb-2 text-gray-500 dark:text-gray-400">
        共 {{ test.parts.length }} 个 Part · {{ scoredTotal }} 道题 · 限时 {{ Math.round(test.timeLimit / 60) }} 分钟
      </p>
      <p class="mb-8 text-sm text-gray-400 dark:text-gray-500">
        点击开始后计时启动，时间到自动交卷
      </p>
      <button
        class="rounded-xl bg-blue-600 px-10 py-3 text-lg font-bold text-white hover:bg-blue-700"
        @click="startTest"
      >
        ▶ 开始测试
      </button>
    </div>
    <div v-else>
    <div class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          🎧 {{ test.title }}
        </h2>
        <select
          :value="testId"
          class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
          @change="router.push({ path: '/mock/listening-test', query: { test: ($event.target as HTMLSelectElement).value } })"
        >
          <option v-for="t in mockTestList" :key="t.id" :value="t.id">
            {{ t.label }}
          </option>
        </select>
      </div>
      <div class="flex items-center gap-4">
        <span
          class="rounded-lg px-4 py-2 font-mono text-xl font-bold"
          :class="timeLeft < 300 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'"
        >
          ⏱ {{ formatCountdown(timeLeft) }}
        </span>
        <button
          v-if="!submitted"
          class="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700"
          @click="submit"
        >
          交卷
        </button>
      </div>
    </div>

    <div v-if="submitted" class="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p class="mb-2 text-5xl font-black text-blue-600 dark:text-blue-400">
        {{ band.toFixed(1) }}
      </p>
      <p class="text-gray-600 dark:text-gray-400">
        答对 {{ correctCount }} / 40 题
      </p>
    </div>

    <div v-if="!submitted" class="mb-6 flex gap-2">
      <button
        v-for="(_, i) in test.parts"
        :key="i"
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="activePart === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
        @click="activePart = i"
      >
        Part {{ i + 1 }}
      </button>
    </div>

    <div v-for="(p, pi) in test.parts" :key="pi" v-show="submitted || activePart === pi" class="mb-8">
      <article class="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          {{ p.title }}
        </h3>
        <audio
          v-if="!submitted"
          ref="audioEl"
          controls
          :src="p.audio"
          class="w-full"
        />
        <img
          v-if="p.image"
          :src="p.image"
          alt="题目示意图"
          class="mt-4 w-full max-w-2xl rounded-lg border border-gray-200 dark:border-gray-700"
        />
        <p v-if="submitted && p.transcript" class="mt-4 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">
          {{ p.transcript }}
        </p>
      </article>

      <div class="space-y-4">
        <div
          v-for="q in p.questions"
          :key="q.id"
          class="rounded-xl border p-4 dark:border-gray-700"
          :class="questionStatus(q) === 'correct' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : questionStatus(q) === 'wrong' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 bg-white dark:bg-gray-800'"
        >
          <p class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
            <span class="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-bold dark:bg-gray-700">{{ q.id }}</span>
            {{ q.question }}
          </p>

          <div v-if="q.type === 'multiple-choice' || q.type === 'tfng'" class="space-y-2">
            <button
              v-for="(opt, oi) in q.options"
              :key="oi"
              :disabled="submitted"
              class="block w-full rounded-lg border px-4 py-2 text-left text-sm"
              :class="submitted
                ? oi === q.answer
                  ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
                  : answers[q.id] === String(oi)
                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                    : 'border-gray-200 opacity-60 dark:border-gray-700'
                : answers[q.id] === String(oi)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'"
              @click="setAnswer(q.id, String(oi))"
            >
              {{ opt }}
            </button>
          </div>

          <!-- 多选题（Choose TWO） -->
          <div v-if="q.type === 'multi-select'" class="space-y-2">
            <button
              v-for="(opt, oi) in q.options"
              :key="oi"
              :disabled="submitted"
              class="block w-full rounded-lg border px-4 py-2 text-left text-sm"
              :class="submitted
                ? (q.answer as number[]).includes(oi)
                  ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
                  : (answers[q.id] ?? '').split(',').includes(String(oi))
                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                    : 'border-gray-200 opacity-60 dark:border-gray-700'
                : (answers[q.id] ?? '').split(',').includes(String(oi))
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'"
              @click="toggleMultiSelect(q.id, oi)"
            >
              <span class="mr-2 inline-block h-4 w-4 rounded border text-center text-xs leading-3" :class="(answers[q.id] ?? '').split(',').includes(String(oi)) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-400'">
                {{ (answers[q.id] ?? '').split(',').includes(String(oi)) ? '✓' : '' }}
              </span>
              {{ opt }}
            </button>
          </div>

          <input
            v-if="q.type === 'fill-blank'"
            :disabled="submitted"
            :value="answers[q.id] ?? ''"
            placeholder="输入答案"
            class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value)"
          />

          <input
            v-if="q.type === 'map-label'"
            :disabled="submitted"
            :value="answers[q.id] ?? ''"
            placeholder="输入字母 A-H"
            maxlength="1"
            class="w-24 rounded-lg border border-gray-300 px-4 py-2 text-center text-sm uppercase dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value)"
          />

          <p v-if="submitted && questionStatus(q) !== 'correct'" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            正确答案：{{ q.type === 'fill-blank' ? (Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer) : q.type === 'map-label' ? q.answer : q.options?.[q.answer as number] }}
          </p>
        </div>
      </div>
    </div>

    <div class="pb-12 text-center">
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="router.push('/listening')"
      >
        ← 返回听力
      </button>
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="router.push('/mock/history')"
      >
        📊 做题记录
      </button>
    </div>
    </div>
    </template>
  </div>
</template>

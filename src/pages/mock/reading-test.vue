<script setup lang="ts">
import { cam19Test1Reading } from './cam19-test1-reading'
import { bandScore, formatCountdown, isCorrect, multiSelectScore } from './types'
import type { MockQuestion } from './types'

const test = cam19Test1Reading
const timeLeft = ref(test.timeLimit)
const answers = ref<Record<string, string>>({})
const submitted = ref(false)
const activePassage = ref(0)
const showPassageModal = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0)
      submit()
  }, 1000)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

function submit() {
  if (submitted.value)
    return
  submitted.value = true
  if (timer)
    clearInterval(timer)
}

const allQuestions = computed<MockQuestion[]>(() =>
  test.passages.flatMap(p => p.questions),
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
  <div class="mx-auto max-w-7xl px-4 pt-6 2xl:px-0">
    <!-- 顶栏：标题 + 计时器 -->
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        📖 {{ test.title }}
      </h2>
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

    <!-- 成绩单 -->
    <div v-if="submitted" class="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p class="mb-2 text-5xl font-black text-blue-600 dark:text-blue-400">
        {{ band.toFixed(1) }}
      </p>
      <p class="text-gray-600 dark:text-gray-400">
        答对 {{ correctCount }} / 40 题
      </p>
    </div>

    <!-- Passage 切换 -->
    <div v-if="!submitted" class="mb-6 flex gap-2">
      <button
        v-for="(_, i) in test.passages"
        :key="i"
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="activePassage === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
        @click="activePassage = i"
      >
        Passage {{ i + 1 }}
      </button>
    </div>

    <!-- 题目区：桌面端左右分栏（左文章右题目），手机端上下堆叠 -->
    <div v-for="(p, pi) in test.passages" :key="pi" v-show="submitted || activePassage === pi" class="mb-8">
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- 左：文章 -->
        <article class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Passage {{ pi + 1 }}：{{ p.title }}
          </h3>
          <div class="space-y-4 text-gray-700 leading-relaxed dark:text-gray-300">
            <p v-for="(para, i) in p.passage.split('\n\n')" :key="i">
              {{ para }}
            </p>
          </div>
        </article>

        <!-- 右：题目 -->
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

          <!-- 选择题 / TFNG -->
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

          <!-- 填空题 -->
          <input
            v-if="q.type === 'fill-blank'"
            :disabled="submitted"
            :value="answers[q.id] ?? ''"
            placeholder="输入答案"
            class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value)"
          />

          <!-- 交卷后显示正确答案 -->
          <p v-if="submitted && questionStatus(q) !== 'correct'" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            正确答案：{{ q.type === 'fill-blank' ? q.answer : q.options?.[q.answer as number] }}
          </p>
        </div>
      </div>
      </div>
    </div>

    <div class="pb-12 text-center">
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="$router.push('/reading')"
      >
        ← 返回阅读
      </button>
    </div>

    <!-- 手机端悬浮"原文"按钮 -->
    <button
      v-if="!submitted"
      class="fixed bottom-6 right-6 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg lg:hidden hover:bg-blue-700"
      @click="showPassageModal = true"
    >
      📖 原文
    </button>

    <!-- 手机端原文弹窗 -->
    <div
      v-if="showPassageModal"
      class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 lg:hidden"
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 class="font-bold text-gray-900 dark:text-white">
          Passage {{ activePassage + 1 }}：{{ test.passages[activePassage].title }}
        </h3>
        <button
          class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold dark:bg-gray-700"
          @click="showPassageModal = false"
        >
          ✕ 关闭
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-4 py-4">
        <div class="space-y-4 text-gray-700 leading-relaxed dark:text-gray-300">
          <p v-for="(para, i) in test.passages[activePassage].passage.split('\n\n')" :key="i">
            {{ para }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

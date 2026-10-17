<script setup lang="ts">
import { CRITERION_GUIDE, gradeTask1 } from './grader'
import type { GradeResult } from './grader'
import { TASK1_INSTRUCTION, TASK1_PROMPTS } from './prompts'
import type { Task1Prompt } from './prompts'
import TaskChart from './TaskChart.vue'
import { nsKey } from '../../../composables/useStudyData'
import { readJson, writeJson } from '../../../composables/useAuth'

interface SavedEssay {
  id: number
  promptId: string
  promptTitleCn: string
  text: string
  overall: number
  criteria: { key: string, score: number }[]
  wordCount: number
  secondsUsed: number
  createdAt: number
}

const ESSAY_KEY = 'task1_essays_v1'
const TIME_LIMIT = 20 * 60

// ---------- 视图状态 ----------
const view = ref<'home' | 'write' | 'result'>('home')
const showGuide = ref(false)

// ---------- 历史 ----------
const history = ref<SavedEssay[]>([])
function loadHistory() {
  history.value = readJson<SavedEssay[]>(nsKey(ESSAY_KEY), [])
}
loadHistory()
function saveEssay(e: SavedEssay) {
  history.value = [e, ...history.value].slice(0, 50)
  writeJson(nsKey(ESSAY_KEY), history.value)
}
function removeEssay(id: number) {
  history.value = history.value.filter(e => e.id !== id)
  writeJson(nsKey(ESSAY_KEY), history.value)
}

// ---------- 写作 ----------
const prompt = ref<Task1Prompt | null>(null)
const essayText = ref('')
const secondsLeft = ref(TIME_LIMIT)
const timerOn = ref(false)
const timeUp = ref(false)
let timerId: ReturnType<typeof setInterval> | null = null

const wordCount = computed(() => essayText.value.trim().split(/\s+/).filter(Boolean).length)
const timeText = computed(() => {
  const s = Math.max(0, secondsLeft.value)
  return `${`${Math.floor(s / 60)}`.padStart(2, '0')}:${`${s % 60}`.padStart(2, '0')}`
})

function startWrite(p: Task1Prompt) {
  prompt.value = p
  essayText.value = ''
  secondsLeft.value = TIME_LIMIT
  timeUp.value = false
  timerOn.value = false
  if (timerId)
    clearInterval(timerId)
  view.value = 'write'
}

function toggleTimer() {
  if (timerOn.value) {
    timerOn.value = false
    if (timerId)
      clearInterval(timerId)
  }
  else {
    timerOn.value = true
    timerId = setInterval(() => {
      secondsLeft.value--
      if (secondsLeft.value <= 0) {
        secondsLeft.value = 0
        timeUp.value = true
        timerOn.value = false
        if (timerId)
          clearInterval(timerId)
      }
    }, 1000)
  }
}

function resetTimer() {
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  timeUp.value = false
  secondsLeft.value = TIME_LIMIT
}

function backHome() {
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  view.value = 'home'
  loadHistory()
}

// ---------- 批改 ----------
const result = ref<GradeResult | null>(null)
const resultPrompt = ref<Task1Prompt | null>(null)
const secondsUsed = ref(0)

function submitEssay() {
  if (wordCount.value < 50) {
    alert('词数太少（<50），先多写一点再批改吧')
    return
  }
  if (wordCount.value < 150 && !confirm(`只有 ${wordCount.value} 词，不足 150 会被扣分，确定提交批改吗？`))
    return
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  secondsUsed.value = TIME_LIMIT - secondsLeft.value
  result.value = gradeTask1(essayText.value)
  resultPrompt.value = prompt.value
  view.value = 'result'
  // 自动存档
  if (prompt.value && result.value) {
    saveEssay({
      id: Date.now(),
      promptId: prompt.value.id,
      promptTitleCn: prompt.value.titleCn,
      text: essayText.value,
      overall: result.value.overall,
      criteria: result.value.criteria.map(c => ({ key: c.key, score: c.score })),
      wordCount: result.value.stats.words,
      secondsUsed: secondsUsed.value,
      createdAt: Date.now(),
    })
  }
}

function reviewEssay(e: SavedEssay) {
  const p = TASK1_PROMPTS.find(x => x.id === e.promptId) || null
  resultPrompt.value = p
  essayText.value = e.text
  result.value = gradeTask1(e.text)
  secondsUsed.value = e.secondsUsed
  view.value = 'result'
}

function scoreColor(s: number): string {
  if (s >= 7)
    return 'text-green-600 dark:text-green-400'
  if (s >= 6)
    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

function formatDuration(s: number): string {
  return `${Math.floor(s / 60)}分${s % 60}秒`
}
</script>

<template>
  <div>
    <!-- ============ 首页：选题 + 评分标准 + 历史 ============ -->
    <div v-if="view === 'home'">
      <!-- 评分标准 -->
      <div class="mb-6 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button class="flex w-full items-center justify-between px-5 py-4" @click="showGuide = !showGuide">
          <span class="font-bold dark:text-white">📏 雅思小作文四项评分标准 <span class="text-xs font-normal text-gray-400">（了解规则才能拿分）</span></span>
          <span class="text-gray-400">{{ showGuide ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showGuide" class="grid gap-4 px-5 pb-5 md:grid-cols-2">
          <div v-for="g in CRITERION_GUIDE" :key="g.key" class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div class="mb-2 font-bold text-sm dark:text-white">{{ g.title }}</div>
            <ul class="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <li v-for="(pt, i) in g.points" :key="i" class="flex gap-1.5">
                <span class="text-blue-500">•</span><span>{{ pt }}</span>
              </li>
            </ul>
          </div>
          <p class="md:col-span-2 text-xs text-gray-400">
            本站批改是基于以上标准的规则估分（词数/段落/衔接词/词汇多样性/句式等可量化信号），用于练习参考，不是官方评分。
          </p>
        </div>
      </div>

      <!-- 选题 -->
      <h3 class="mb-3 text-lg font-bold dark:text-white">选择一道题开始写作</h3>
      <div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="p in TASK1_PROMPTS"
          :key="p.id"
          class="flex flex-col rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span class="mb-2 w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{{ p.typeCn }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">{{ p.titleCn }}</div>
          <button
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <!-- 历史 -->
      <h3 class="mb-3 text-lg font-bold dark:text-white">我的作文 <span class="text-sm font-normal text-gray-400">（按账号保存）</span></h3>
      <div v-if="history.length === 0" class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-600">
        还没有写过小作文，选一道题开始吧
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="e in history"
          :key="e.id"
          class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <span class="text-2xl font-bold" :class="scoreColor(e.overall)">{{ e.overall.toFixed(1) }}</span>
          <div class="flex-1 text-sm">
            <div class="font-medium dark:text-white">{{ e.promptTitleCn }}</div>
            <div class="text-xs text-gray-400">{{ e.wordCount }} 词 · 用时 {{ formatDuration(e.secondsUsed) }} · {{ formatDate(e.createdAt) }}</div>
          </div>
          <button class="text-sm text-blue-600 hover:underline dark:text-blue-400" @click="reviewEssay(e)">查看批改</button>
          <button class="text-sm text-gray-400 hover:text-red-500" @click="removeEssay(e.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- ============ 写作 ============ -->
    <div v-else-if="view === 'write' && prompt">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="backHome">← 返回选题</button>

      <div class="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-1 flex items-center gap-2">
          <span class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{{ prompt.typeCn }}</span>
          <span class="text-xs text-gray-400">{{ TASK1_INSTRUCTION }}</span>
        </div>
        <p class="mb-4 font-medium dark:text-white">{{ prompt.title }}</p>
        <TaskChart :prompt="prompt" />
        <details class="mt-3 text-sm">
          <summary class="cursor-pointer text-blue-600 dark:text-blue-400">💡 写作提示</summary>
          <ul class="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
            <li v-for="(t, i) in prompt.tips" :key="i">• {{ t }}</li>
          </ul>
        </details>
      </div>

      <!-- 计时 + 词数 -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div
          class="flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-lg font-bold dark:border-gray-700 dark:bg-gray-800"
          :class="timeUp ? 'border-red-300 text-red-600 dark:text-red-400' : 'border-gray-200 text-gray-800 dark:text-white'"
        >
          ⏱ {{ timeText }}
          <span v-if="timeUp" class="font-sans text-xs font-normal">时间到</span>
        </div>
        <button class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:text-white" @click="toggleTimer">
          {{ timerOn ? '⏸ 暂停' : '▶ 开始' }}
        </button>
        <button class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:text-white" @click="resetTimer">↺ 重置</button>
        <div class="ml-auto text-sm" :class="wordCount >= 150 ? 'text-green-600 font-bold' : 'text-gray-500 dark:text-gray-400'">
          {{ wordCount }} / 150 词
        </div>
      </div>
      <div class="mb-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div class="h-full rounded-full transition-all" :class="wordCount >= 150 ? 'bg-green-500' : 'bg-blue-500'" :style="{ width: `${Math.min(100, (wordCount / 150) * 100)}%` }" />
      </div>

      <textarea
        v-model="essayText"
        rows="14"
        placeholder="在这里写你的小作文（英文，至少 150 词）…&#10;&#10;建议结构：&#10;第1段：改写题目引言&#10;第2段：Overview 概述主要趋势&#10;第3-4段：细节 + 数据支撑"
        class="mb-4 block w-full rounded-xl border border-gray-300 bg-white p-4 text-sm leading-7 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />

      <div class="flex gap-3">
        <button
          class="flex-1 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800 dark:bg-blue-600"
          @click="submitEssay"
        >
          提交批改
        </button>
      </div>
    </div>

    <!-- ============ 批改结果 ============ -->
    <div v-else-if="view === 'result' && result">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="backHome">← 返回</button>

      <div class="mb-6 rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
        <div class="text-sm text-gray-400 mb-1">{{ resultPrompt?.titleCn }} · {{ result.stats.words }} 词 · 用时 {{ formatDuration(secondsUsed) }}</div>
        <div class="text-6xl font-bold" :class="scoreColor(result.overall)">{{ result.overall.toFixed(1) }}</div>
        <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">预估总分（四项平均）</div>
        <p class="mt-3 text-xs text-gray-400">规则估分，仅供练习参考，不是官方评分</p>
      </div>

      <div class="mb-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="c in result.criteria"
          :key="c.key"
          class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 flex items-baseline justify-between">
            <span class="font-bold text-sm dark:text-white">{{ c.labelCn }}</span>
            <span class="text-2xl font-bold" :class="scoreColor(c.score)">{{ c.score.toFixed(1) }}</span>
          </div>
          <div class="mb-3 text-xs text-gray-400">{{ c.label }}</div>
          <div v-if="c.strengths.length" class="mb-2 space-y-1">
            <div v-for="(s, i) in c.strengths" :key="'s' + i" class="flex gap-1.5 text-xs text-green-700 dark:text-green-400">
              <span>✓</span><span>{{ s }}</span>
            </div>
          </div>
          <div v-if="c.improvements.length" class="space-y-1">
            <div v-for="(s, i) in c.improvements" :key="'i' + i" class="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <span>→</span><span>{{ s }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据统计 -->
      <div class="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-3 font-bold text-sm dark:text-white">📊 写作数据</div>
        <div class="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
          <div><div class="text-xl font-bold dark:text-white">{{ result.stats.words }}</div><div class="text-xs text-gray-400">词数</div></div>
          <div><div class="text-xl font-bold dark:text-white">{{ result.stats.paragraphs }}</div><div class="text-xs text-gray-400">段落</div></div>
          <div><div class="text-xl font-bold dark:text-white">{{ result.stats.sentences }}</div><div class="text-xs text-gray-400">句子</div></div>
          <div><div class="text-xl font-bold dark:text-white">{{ result.stats.linkingUnique }}</div><div class="text-xs text-gray-400">衔接词种类</div></div>
          <div><div class="text-xl font-bold dark:text-white">{{ result.stats.trendWords }}</div><div class="text-xs text-gray-400">趋势词汇</div></div>
          <div><div class="text-xl font-bold dark:text-white">{{ Math.round(result.stats.complexRatio * 100) }}%</div><div class="text-xs text-gray-400">复合句占比</div></div>
        </div>
      </div>

      <details class="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <summary class="cursor-pointer font-bold text-sm dark:text-white">📝 我的原文</summary>
        <div class="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-300">{{ essayText }}</div>
      </details>

      <div class="flex gap-3">
        <button class="flex-1 rounded-xl border border-gray-300 px-5 py-3 text-sm dark:border-gray-600 dark:text-white" @click="backHome">返回列表</button>
        <button
          v-if="resultPrompt"
          class="flex-1 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 dark:bg-blue-600"
          @click="startWrite(resultPrompt)"
        >
          再写一篇
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { analyzeEssay } from '../task1/grader'
import type { EssayStats } from '../task1/grader'
import { CAMBRIDGE_WRITING } from '../cambridge'
import type { CambridgeWritingTask } from '../cambridge'
import { nsKey } from '../../../composables/useStudyData'
import { readJson, writeJson } from '../../../composables/useAuth'

const TASK2_QUESTIONS = CAMBRIDGE_WRITING.filter(q => q.task === 2)
const TASK2_INSTRUCTION = 'You should spend about 40 minutes on this task. Write at least 250 words.'

interface SavedTask2 {
  id: number
  promptId: string
  promptTitleCn: string
  text: string
  wordCount: number
  secondsUsed: number
  createdAt: number
}

const ESSAY_KEY = 'task2_essays_v1'
const TIME_LIMIT = 40 * 60

const view = ref<'home' | 'write' | 'result'>('home')
const history = ref<SavedTask2[]>([])
function loadHistory() {
  history.value = readJson<SavedTask2[]>(nsKey(ESSAY_KEY), [])
}
loadHistory()
function saveEssay(e: SavedTask2) {
  history.value = [e, ...history.value].slice(0, 50)
  writeJson(nsKey(ESSAY_KEY), history.value)
}
function removeEssay(id: number) {
  history.value = history.value.filter(e => e.id !== id)
  writeJson(nsKey(ESSAY_KEY), history.value)
}

const prompt = ref<CambridgeWritingTask | null>(null)
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

function promptTitleCn(p: CambridgeWritingTask) {
  return `${p.book} ${p.testLabel} · ${p.promptCn}`
}

function startWrite(p: CambridgeWritingTask) {
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

const stats = ref<EssayStats | null>(null)
const resultPrompt = ref<CambridgeWritingTask | null>(null)
const secondsUsed = ref(0)

function checklist(s: EssayStats): { ok: boolean, text: string }[] {
  return [
    { ok: s.words >= 250, text: `词数 ${s.words} / 250${s.words >= 250 ? '' : '（不足会被扣分）'}` },
    { ok: s.paragraphs >= 4, text: `段落 ${s.paragraphs} 个（建议 4–5 段：引言+2–3 个主体段+结尾）` },
    { ok: s.linkingTotal >= 6, text: `衔接词 ${s.linkingTotal} 个（however / moreover / in contrast 等）` },
    { ok: s.typeTokenRatio >= 0.45, text: `词汇多样性 ${(s.typeTokenRatio * 100).toFixed(0)}%（避免重复用词）` },
    { ok: s.complexRatio >= 0.25, text: `长难句占比 ${(s.complexRatio * 100).toFixed(0)}%（从句、非谓语）` },
    { ok: s.avgSentenceLen >= 12 && s.avgSentenceLen <= 25, text: `平均句长 ${s.avgSentenceLen.toFixed(1)} 词（12–25 较理想）` },
  ]
}

function submitEssay() {
  if (wordCount.value < 50) {
    alert('词数太少（<50），先多写一点吧')
    return
  }
  if (wordCount.value < 250 && !confirm(`只有 ${wordCount.value} 词，不足 250 会被扣分，确定提交吗？`))
    return
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  secondsUsed.value = TIME_LIMIT - secondsLeft.value
  stats.value = analyzeEssay(essayText.value)
  resultPrompt.value = prompt.value
  view.value = 'result'
  if (prompt.value && stats.value) {
    saveEssay({
      id: Date.now(),
      promptId: prompt.value.id,
      promptTitleCn: promptTitleCn(prompt.value),
      text: essayText.value,
      wordCount: stats.value.words,
      secondsUsed: secondsUsed.value,
      createdAt: Date.now(),
    })
  }
}

function reviewEssay(e: SavedTask2) {
  const p = TASK2_QUESTIONS.find(x => x.id === e.promptId) || null
  resultPrompt.value = p
  essayText.value = e.text
  stats.value = analyzeEssay(e.text)
  secondsUsed.value = e.secondsUsed
  view.value = 'result'
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
    <!-- ============ 首页：选题 + 历史 ============ -->
    <div v-if="view === 'home'">
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        📚 剑桥真题（剑18–剑21，共 16 题）· 建议 40 分钟、250+ 词
      </p>
      <h3 class="mb-3 text-lg font-bold dark:text-white">选择一道题开始写作</h3>
      <div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="p in TASK2_QUESTIONS"
          :key="p.id"
          class="flex flex-col rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span class="mb-2 w-fit rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">{{ p.promptCn }}</div>
          <button
            class="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-800 dark:bg-purple-600"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <h3 class="mb-3 text-lg font-bold dark:text-white">我的作文 <span class="text-sm font-normal text-gray-400">（按账号保存）</span></h3>
      <div v-if="history.length === 0" class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-600">
        还没有写过大作文，选一道题开始吧
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="e in history"
          :key="e.id"
          class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="flex-1 text-sm">
            <div class="font-medium dark:text-white">{{ e.promptTitleCn }}</div>
            <div class="text-xs text-gray-400">{{ e.wordCount }} 词 · 用时 {{ formatDuration(e.secondsUsed) }} · {{ formatDate(e.createdAt) }}</div>
          </div>
          <button class="text-sm text-blue-600 hover:underline dark:text-blue-400" @click="reviewEssay(e)">查看</button>
          <button class="text-sm text-gray-400 hover:text-red-500" @click="removeEssay(e.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- ============ 写作 ============ -->
    <div v-else-if="view === 'write' && prompt">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="backHome">← 返回选题</button>

      <div class="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-1 flex items-center gap-2">
          <span class="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{{ prompt.book }} {{ prompt.testLabel }}</span>
          <span class="text-xs text-gray-400">{{ TASK2_INSTRUCTION }}</span>
        </div>
        <p class="font-medium leading-7 dark:text-white">{{ prompt.promptEn }}</p>
      </div>

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
        <div class="ml-auto text-sm" :class="wordCount >= 250 ? 'text-green-600 font-bold' : 'text-gray-500 dark:text-gray-400'">
          {{ wordCount }} / 250 词
        </div>
      </div>
      <div class="mb-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div class="h-full rounded-full transition-all" :class="wordCount >= 250 ? 'bg-green-500' : 'bg-purple-500'" :style="{ width: `${Math.min(100, (wordCount / 250) * 100)}%` }" />
      </div>

      <textarea
        v-model="essayText"
        rows="16"
        placeholder="在这里写你的大作文（英文，至少 250 词）…&#10;&#10;建议结构：&#10;第1段：改写题目 + 表明立场&#10;第2-3段：分论点 + 论据/例子&#10;最后一段：重申立场"
        class="mb-4 block w-full rounded-xl border border-gray-300 bg-white p-4 text-sm leading-7 text-gray-900 focus:border-purple-500 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />

      <div class="flex gap-3">
        <button
          class="flex-1 rounded-xl bg-purple-700 px-5 py-3 font-bold text-white hover:bg-purple-800 dark:bg-purple-600"
          @click="submitEssay"
        >
          提交自查
        </button>
      </div>
    </div>

    <!-- ============ 自查结果 ============ -->
    <div v-else-if="view === 'result' && stats">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="backHome">← 返回</button>

      <div class="mb-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div class="text-sm text-gray-400 mb-4">{{ resultPrompt ? promptTitleCn(resultPrompt) : '' }} · {{ stats.words }} 词 · 用时 {{ formatDuration(secondsUsed) }}</div>
        <h4 class="mb-3 font-bold dark:text-white">✅ 写作自查清单</h4>
        <ul class="space-y-2">
          <li v-for="(c, i) in checklist(stats)" :key="i" class="flex items-start gap-2 text-sm">
            <span>{{ c.ok ? '✅' : '⚠️' }}</span>
            <span :class="c.ok ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'">{{ c.text }}</span>
          </li>
        </ul>
        <p class="mt-4 text-xs text-gray-400">这是可量化的写作习惯检查，不是雅思官方评分。大作文的论证逻辑和观点展开，还得对照范文自己复盘。</p>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h4 class="mb-2 text-sm font-bold text-gray-500 dark:text-gray-400">我的作文</h4>
        <p class="whitespace-pre-wrap text-sm leading-7 text-gray-800 dark:text-gray-200">{{ essayText }}</p>
      </div>
    </div>
  </div>
</template>

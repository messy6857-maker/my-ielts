<script setup lang="ts">
import { usePersistentBool } from '../../../composables/usePersistentBool'
import { analyzeEssay } from '../task1/grader'
import type { EssayStats } from '../task1/grader'
import { CAMBRIDGE_WRITING } from '../cambridge'
import type { CambridgeWritingTask } from '../cambridge'
import { EXTRA_TASK2 } from '../cambridge-extra'
import { nsKey } from '../../../composables/useStudyData'
import { readJson, useAuth, writeJson } from '../../../composables/useAuth'
import AIGradePanel from '../AIGradePanel.vue'
import ModelEssayView from '../ModelEssayView.vue'

const TASK2_QUESTIONS = CAMBRIDGE_WRITING.filter(q => q.task === 2)
const TASK2_INSTRUCTION = 'You should spend about 40 minutes on this task. Write at least 250 words.'

// 大作文四项评分标准（实用要点版）
const TASK2_GUIDE = [
  {
    title: '任务回应 Task Response',
    points: [
      '不少于 250 词（40 分钟），字数不够直接扣分',
      '完整回应题目所有部分：题干问什么就答什么',
      '立场清晰明确，全文保持一致',
      '每个主要观点都要展开 + 举例/论证支撑，不要只摆观点',
    ],
  },
  {
    title: '连贯与衔接 Coherence & Cohesion',
    points: [
      '经典结构：引言改写 → 2-3 个主体段 → 结尾总结',
      '每段一个中心思想，段首句点明本段主旨',
      '衔接词多样自然：however / moreover / consequently / in contrast',
      '代词指代明确，逻辑层层推进',
    ],
  },
  {
    title: '词汇资源 Lexical Resource',
    points: [
      '话题词汇准确丰富，少用重复的简单词',
      '同义替换：important → crucial / vital / essential',
      '固定搭配要自然：pose a threat / raise awareness / take measures',
      '注意拼写；不确定的"高级词"宁可不用',
    ],
  },
  {
    title: '语法多样性与准确性 Grammatical Range & Accuracy',
    points: [
      '长短句结合：复合句、定语从句、状语从句、条件句',
      '适当使用被动语态、非谓语动词',
      '时态语态准确，标点规范',
      '宁可写对的简单句，不写错的复杂句',
    ],
  },
]
const showGuide = usePersistentBool('myielts_task2_guide_open')

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
// 同页退出/换号时立即切到当前账号的历史与草稿，不再把旧账号内容带进游客写入
const { currentUser } = useAuth()
watch(currentUser, () => {
  loadHistory()
  restoreDraft()
})
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
// 倒计时锚点：开始时记下截止时间戳，每 tick 用墙钟重算，避免后台节流导致限时变慢
let timerEndAt = 0

const wordCount = computed(() => essayText.value.trim().split(/\s+/).filter(Boolean).length)
const timeText = computed(() => {
  const s = Math.max(0, secondsLeft.value)
  return `${`${Math.floor(s / 60)}`.padStart(2, '0')}:${`${s % 60}`.padStart(2, '0')}`
})

// ---------- 草稿 ----------
// 防抖写入普通 localStorage（刻意不用 writeJson，避免写作中频繁触发同步推送）；
// 每任务独立 key，提交成功后清除；切页签/切模块导致组件卸载时立即 flush，不丢稿
// 属主制：草稿归属哪个身份就写哪个身份的 key（登录账号 myielts_u_<用户名>_task2_draft_v1，
// 游客沿用原全局 key）；draftOwner 在挂载恢复与切换账号时确定，save/clear/flush 一律用它，
// 不再按调用时刻的 currentUser 现算——否则退出后卸载 flush 会把旧账号的全文写进游客全局 key。
// 仍走普通 localStorage（刻意不用 writeJson，草稿不同步）；旧全局草稿不迁移给登录账号
function draftKeyFor(owner: string | null): string {
  return owner ? `myielts_u_${owner}_task2_draft_v1` : 'myielts_task2_draft_v1'
}
let draftOwner: string | null = currentUser.value
let draftTimer: ReturnType<typeof setTimeout> | null = null
function saveDraftNow() {
  try {
    if (view.value === 'write' && prompt.value && essayText.value.trim()) {
      localStorage.setItem(draftKeyFor(draftOwner), JSON.stringify({
        promptId: prompt.value.id,
        text: essayText.value,
        secondsLeft: secondsLeft.value,
      }))
    }
    else if (view.value === 'write') {
      localStorage.removeItem(draftKeyFor(draftOwner))
    }
  }
  catch { /* ignore */ }
}
function clearDraft() {
  try {
    localStorage.removeItem(draftKeyFor(draftOwner))
  }
  catch { /* ignore */ }
}
watch(essayText, () => {
  if (view.value !== 'write')
    return
  if (draftTimer)
    clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraftNow, 2000)
})
onUnmounted(() => {
  if (timerId)
    clearInterval(timerId)
  if (draftTimer)
    clearTimeout(draftTimer)
  saveDraftNow()
})
// 恢复草稿：挂载时调用一次；切换账号时也调用，先取消 pending 防抖、再按新身份重载。
// 新身份有合法草稿则恢复；无草稿则回到选题页（清屏，不再留旧身份的全文）
function restoreDraft() {
  if (draftTimer)
    clearTimeout(draftTimer)
  draftTimer = null
  if (timerId)
    clearInterval(timerId)
  timerId = null
  timerOn.value = false
  draftOwner = currentUser.value
  try {
    const raw = localStorage.getItem(draftKeyFor(draftOwner))
    if (raw) {
      const d = JSON.parse(raw) as { promptId: string, text: string, secondsLeft: number }
      const p = TASK2_QUESTIONS.find(x => x.id === d.promptId)
        ?? EXTRA_TASK2.find(x => x.id === d.promptId) ?? null
      if (d.text && p) {
        prompt.value = p
        essayText.value = d.text
        // 0 是合法的“已超时”，不能用 || 当缺失处理；非法值才回落满时
        const savedSeconds = (typeof d.secondsLeft === 'number' && Number.isFinite(d.secondsLeft)) ? d.secondsLeft : TIME_LIMIT
        secondsLeft.value = Math.min(Math.max(0, savedSeconds), TIME_LIMIT)
        timeUp.value = secondsLeft.value <= 0
        view.value = 'write'
        return
      }
    }
  }
  catch { /* ignore */ }
  prompt.value = null
  essayText.value = ''
  secondsLeft.value = TIME_LIMIT
  timeUp.value = false
  view.value = 'home'
}
restoreDraft()

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
    // 暂停前先按锚点重算一次，避免最后不足 1 秒的漂移
    if (timerEndAt)
      secondsLeft.value = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000))
    timerEndAt = 0
    if (timerId)
      clearInterval(timerId)
  }
  else {
    timerOn.value = true
    timerEndAt = Date.now() + secondsLeft.value * 1000
    timerId = setInterval(() => {
      secondsLeft.value = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000))
      if (secondsLeft.value <= 0) {
        secondsLeft.value = 0
        timeUp.value = true
        timerOn.value = false
        timerEndAt = 0
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
const resultQuestion = ref('')
const secondsUsed = ref(0)

function checklist(s: EssayStats): { ok: boolean, text: string }[] {
  return [
    { ok: s.words >= 250, text: `词数 ${s.words} / 250${s.words >= 250 ? '' : '（不足会被扣分）'}` },
    // 段落只认 4–5 段：少于 4 段结构不完整，多于 5 段则过碎
    { ok: s.paragraphs >= 4 && s.paragraphs <= 5, text: `段落 ${s.paragraphs} 个（建议 4–5 段：引言+2–3 个主体段+结尾）` },
    // 衔接看去重数：只会 however 反复用满 6 次也不算多样
    { ok: s.linkingUnique >= 4, text: `不同衔接词 ${s.linkingUnique} 种（however / moreover / in contrast 等，建议 4 种以上）` },
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
  resultQuestion.value = prompt.value ? prompt.value.promptEn : ''
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
  clearDraft()
}

function reviewEssay(e: SavedTask2) {
  const p = TASK2_QUESTIONS.find(x => x.id === e.promptId)
    ?? EXTRA_TASK2.find(x => x.id === e.promptId) ?? null
  resultPrompt.value = p
  resultQuestion.value = p ? p.promptEn : e.promptTitleCn
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
      <!-- 评分标准 -->
      <div class="mb-6 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button class="flex w-full items-center justify-between px-5 py-4" @click="showGuide = !showGuide">
          <span class="font-bold dark:text-white">📏 雅思大作文四项评分标准 <span class="text-xs font-normal text-gray-400">（了解规则才能拿分）</span></span>
          <span class="text-gray-400">{{ showGuide ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showGuide" class="grid gap-4 px-5 pb-5 md:grid-cols-2">
          <div v-for="g in TASK2_GUIDE" :key="g.title" class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div class="mb-2 font-bold text-sm dark:text-white">{{ g.title }}</div>
            <ul class="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <li v-for="(pt, i) in g.points" :key="i" class="flex gap-1.5">
                <span class="text-blue-500">•</span><span>{{ pt }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

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

      <h3 class="mb-3 text-lg font-bold dark:text-white">📝 更多真题 <span class="text-sm font-normal text-gray-400">（剑14/15/17，共 12 题）</span></h3>
      <div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="p in EXTRA_TASK2"
          :key="p.id"
          class="flex flex-col rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span class="mb-2 w-fit rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">{{ p.promptCn }}</div>
          <button
            class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
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

    <!-- ============ 写作（左右分栏：左题目右写作） ============ -->
    <div v-else-if="view === 'write' && prompt">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="backHome">← 返回选题</button>

      <div class="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <!-- 左：题目（桌面端吸顶，写的时候一直看得见） -->
        <div class="mb-4 rounded-xl border border-gray-200 bg-white p-5 lg:mb-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-1 flex items-center gap-2">
            <span class="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{{ prompt.book }} {{ prompt.testLabel }}</span>
            <span class="text-xs text-gray-400">{{ TASK2_INSTRUCTION }}</span>
          </div>
          <p class="font-medium leading-7 dark:text-white">{{ prompt.promptEn }}</p>
        </div>

        <!-- 右：写作区 -->
        <div>
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
            rows="18"
            :disabled="timeUp"
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

      <div class="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h4 class="mb-2 text-sm font-bold text-gray-500 dark:text-gray-400">我的作文</h4>
        <p class="whitespace-pre-wrap text-sm leading-7 text-gray-800 dark:text-gray-200">{{ essayText }}</p>
      </div>

      <AIGradePanel
        v-if="resultQuestion"
        task="task2"
        :question="resultQuestion"
        :essay="essayText"
      />

      <ModelEssayView
        v-if="resultPrompt"
        :prompt-id="resultPrompt.id"
      />

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

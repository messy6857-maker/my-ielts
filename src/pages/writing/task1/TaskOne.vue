<script setup lang="ts">
import {
  deleteDraft,
  emergencyWritingDrafts,
  listDrafts,
  readDraft,
  readOwnDraft,
  saveDraft,
} from '../../../utils/drafts'
import type { WritingDraft } from '../../../utils/drafts'
import { usePersistentBool } from '../../../composables/usePersistentBool'
import { CAMBRIDGE_WRITING } from '../cambridge'
import type { CambridgeWritingTask } from '../cambridge'
import AIGradePanel from '../AIGradePanel.vue'
import ModelEssayView from '../ModelEssayView.vue'
import { resolveMediaUrl } from '../../../composables/useAudio'
import { onBeforeLogout, useAuth } from '../../../composables/useAuth'

import { readRecords, saveRecord } from '../../../utils/storage'
import { onSyncApplied } from '../../../composables/syncClient'
import TaskChart from './TaskChart.vue'
import type { Task1Prompt } from './prompts'
import { TASK1_INSTRUCTION, TASK1_PROMPTS } from './prompts'
import type { GradeResult } from './grader'
import { CRITERION_GUIDE, gradeTask1 } from './grader'

type AnyPrompt = Task1Prompt | CambridgeWritingTask
const CAM_TASK1 = CAMBRIDGE_WRITING.filter(q => q.task === 1)

function isCam(p: AnyPrompt): p is CambridgeWritingTask {
  return (p as CambridgeWritingTask).task !== undefined
}
function badgeOf(p: AnyPrompt): string {
  return isCam(p) ? '剑桥真题' : p.typeCn
}
function titleOf(p: AnyPrompt): string {
  return isCam(p) ? p.promptEn : p.title
}
function titleCnOf(p: AnyPrompt): string {
  return isCam(p) ? `${p.book} ${p.testLabel} · ${p.promptCn}` : p.titleCn
}
function findPrompt(id: string): AnyPrompt | null {
  return (
    TASK1_PROMPTS.find(x => x.id === id)
    ?? CAM_TASK1.find(x => x.id === id)
    ?? null
  )
}

interface SavedEssay {
  id: number | string
  promptId: string
  promptTitleCn: string
  text: string
  overall: number
  criteria: { key: string; score: number }[]
  wordCount: number
  secondsUsed: number
  timed?: boolean
  overtime?: boolean
  createdAt: number
}

const ESSAY_KEY = 'task1_essays_v1'
const TIME_LIMIT = 20 * 60

// ---------- 视图状态 ----------
const view = ref<'home' | 'write' | 'result'>('home')
const showGuide = usePersistentBool('myielts_task1_guide_open')

// ---------- 历史 ----------
const history = ref<SavedEssay[]>([])
function loadHistory() {
  history.value = Object.values(
    readRecords<SavedEssay>(ESSAY_KEY, useAuth().currentUser.value),
  ).sort((a, b) => b.createdAt - a.createdAt)
}
loadHistory()
// 同页退出/换号时立即切到当前账号的历史与草稿，不再把旧账号内容带进游客写入
const { currentUser } = useAuth()
watch(currentUser, () => {
  loadHistory()
  restoreDraft()
})
function saveEssay(e: SavedEssay) {
  if (!saveRecord(ESSAY_KEY, String(e.id), e, currentUser.value))
    return false
  loadHistory()
  for (const old of history.value.slice(50))
    saveRecord(ESSAY_KEY, String(old.id), undefined, currentUser.value)
  loadHistory()
  return true
}
function removeEssay(id: number | string) {
  saveRecord(ESSAY_KEY, String(id), undefined, currentUser.value)
  loadHistory()
}

// ---------- 写作 ----------
const prompt = ref<AnyPrompt | null>(null)
const essayText = ref('')
const secondsLeft = ref(TIME_LIMIT)
const timerOn = ref(false)
const timerStarted = ref(false)
const timeUp = ref(false)
const overtime = ref(false)
let timerId: ReturnType<typeof setInterval> | null = null
// 倒计时锚点：开始时记下截止时间戳，每 tick 用墙钟重算，避免后台节流导致限时变慢
let timerEndAt = 0

const wordCount = computed(
  () => essayText.value.trim().split(/\s+/).filter(Boolean).length,
)
const timeText = computed(() => {
  const s = Math.max(0, secondsLeft.value)
  return `${`${Math.floor(s / 60)}`.padStart(2, '0')}:${`${s % 60}`.padStart(2, '0')}`
})

// ---------- 草稿 ----------
// 防抖写入普通 localStorage（刻意不用 writeJson，避免写作中频繁触发同步推送）；
// 每任务独立 key，提交成功后清除；切页签/切模块导致组件卸载时立即 flush，不丢稿
// 属主制：草稿归属哪个身份就写哪个身份的 key（登录账号 myielts_u_<用户名>_task1_draft_v1，
// 游客沿用原全局 key）；draftOwner 在挂载恢复与切换账号时确定，save/clear/flush 一律用它，
// 不再按调用时刻的 currentUser 现算——否则退出后卸载 flush 会把旧账号的全文写进游客全局 key。
// 仍走普通 localStorage（刻意不用 writeJson，草稿不同步）；旧全局草稿不迁移给登录账号
const emergencyDrafts = {
  get: (owner: string | null) => emergencyWritingDrafts.get(JSON.stringify(['task1', owner])),
  set: (owner: string | null, value: WritingDraft) => emergencyWritingDrafts.set(JSON.stringify(['task1', owner]), value),
  delete: (owner: string | null) => emergencyWritingDrafts.delete(JSON.stringify(['task1', owner])),
}
let draftOwner: string | null = currentUser.value
let draftTimer: ReturnType<typeof setTimeout> | null = null
const drafts = ref(listDrafts('task1', draftOwner))
function saveDraftNow(): boolean {
  if (view.value !== 'write' || !prompt.value)
    return true
  const ok = essayText.value.trim()
    ? saveDraft('task1', draftOwner, {
      promptId: prompt.value.id,
      text: essayText.value,
      secondsLeft: secondsLeft.value,
      overtime: overtime.value,
    })
    : (deleteDraft('task1', draftOwner, prompt.value.id), true)
  if (ok)
    emergencyDrafts.delete(draftOwner)
  drafts.value = listDrafts('task1', draftOwner)
  return ok
}
const offLogout = onBeforeLogout(saveDraftNow)
const offSync = onSyncApplied(loadHistory)
function onVisibility() {
  if (document.visibilityState === 'hidden')
    saveDraftNow()
}
window.addEventListener('pagehide', saveDraftNow)
document.addEventListener('visibilitychange', onVisibility)
onBeforeRouteLeave(() => saveDraftNow())
watch(essayText, () => {
  if (view.value !== 'write')
    return
  if (draftTimer)
    clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraftNow, 2000)
})
onUnmounted(() => {
  offLogout()
  offSync()
  window.removeEventListener('pagehide', saveDraftNow)
  document.removeEventListener('visibilitychange', onVisibility)
  if (timerId)
    clearInterval(timerId)
  if (draftTimer)
    clearTimeout(draftTimer)
  if (!saveDraftNow() && prompt.value)
    emergencyDrafts.set(draftOwner, { promptId: prompt.value.id, text: essayText.value, secondsLeft: secondsLeft.value, overtime: overtime.value })
})
// 恢复草稿：挂载时调用一次；切换账号时也调用，先取消 pending 防抖、再按新身份重载。
// 新身份有合法草稿则恢复；无草稿则回到选题页（清屏，不再留旧身份的全文）
function restoreDraft() {
  if (!saveDraftNow() && prompt.value)
    emergencyDrafts.set(draftOwner, { promptId: prompt.value.id, text: essayText.value, secondsLeft: secondsLeft.value, overtime: overtime.value })
  if (draftTimer)
    clearTimeout(draftTimer)
  draftTimer = null
  if (timerId)
    clearInterval(timerId)
  timerId = null
  timerOn.value = false
  draftOwner = currentUser.value
  try {
    drafts.value = listDrafts('task1', draftOwner)
    const d = emergencyDrafts.get(draftOwner) ?? readDraft('task1', draftOwner)
    if (d) {
      const p = findPrompt(d.promptId)
      if (d.text && p) {
        prompt.value = p
        essayText.value = d.text
        // 0 是合法的“已超时”，不能用 || 当缺失处理；非法值才回落满时
        const savedSeconds
          = typeof d.secondsLeft === 'number' && Number.isFinite(d.secondsLeft)
            ? d.secondsLeft
            : TIME_LIMIT
        secondsLeft.value = Math.min(Math.max(0, savedSeconds), TIME_LIMIT)
        timeUp.value = secondsLeft.value <= 0
        overtime.value = !!d.overtime
        timerStarted.value = secondsLeft.value < TIME_LIMIT || !!d.overtime
        view.value = 'write'
        return
      }
    }
  }
  catch {
    /* ignore */
  }
  prompt.value = null
  essayText.value = ''
  secondsLeft.value = TIME_LIMIT
  overtime.value = false
  timeUp.value = false
  view.value = 'home'
}
restoreDraft()

function startWrite(p: AnyPrompt, versionId?: string) {
  if (!saveDraftNow())
    return
  const saved = readDraft('task1', draftOwner, p.id, versionId)
  prompt.value = p
  essayText.value = saved?.text ?? ''
  secondsLeft.value = saved?.secondsLeft ?? TIME_LIMIT
  timeUp.value = secondsLeft.value <= 0
  overtime.value = !!saved?.overtime
  timerStarted.value = secondsLeft.value < TIME_LIMIT || !!saved?.overtime
  timerOn.value = false
  if (timerId)
    clearInterval(timerId)
  view.value = 'write'
}

function continueOvertime() {
  overtime.value = true
  timerOn.value = false
  if (timerId)
    clearInterval(timerId)
  saveDraftNow()
}
function toggleTimer() {
  if (timeUp.value || overtime.value)
    return
  if (timerOn.value) {
    timerOn.value = false
    // 暂停前先按锚点重算一次，避免最后不足 1 秒的漂移
    if (timerEndAt) {
      secondsLeft.value = Math.max(
        0,
        Math.ceil((timerEndAt - Date.now()) / 1000),
      )
    }
    timerEndAt = 0
    if (timerId)
      clearInterval(timerId)
  }
  else {
    timerOn.value = true
    timerStarted.value = true
    timerEndAt = Date.now() + secondsLeft.value * 1000
    timerId = setInterval(() => {
      secondsLeft.value = Math.max(
        0,
        Math.ceil((timerEndAt - Date.now()) / 1000),
      )
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
  timerStarted.value = false
  overtime.value = false
  timeUp.value = false
  secondsLeft.value = TIME_LIMIT
}

function backHome() {
  if (!saveDraftNow())
    return
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  view.value = 'home'
  loadHistory()
}

// ---------- 批改 ----------
const result = ref<GradeResult | null>(null)
const resultPrompt = ref<AnyPrompt | null>(null)
const resultQuestion = ref('')
const secondsUsed = ref(0)
const secondsTimed = ref(true)

const archiveError = ref('')
let pendingEssay: { owner: string | null; record: SavedEssay; draft: WritingDraft | null } | null = null
function persistEssay(record: SavedEssay) {
  pendingEssay ??= { owner: draftOwner, record, draft: readOwnDraft('task1', draftOwner, record.promptId) }
  if (saveEssay(record)) {
    if (pendingEssay.draft)
      deleteDraft('task1', pendingEssay.owner, record.promptId, pendingEssay.draft)
    pendingEssay = null
    archiveError.value = ''
    drafts.value = listDrafts('task1', draftOwner)
  }
  else {
    archiveError.value
      = '作文存档失败，原文仍保留在草稿中。请重试保存或复制原文后再离开。'
  }
}
function retryArchive() {
  if (pendingEssay?.owner === currentUser.value)
    persistEssay(pendingEssay.record)
}
function submitEssay() {
  if (wordCount.value < 50) {
    alert('词数太少（<50），先多写一点再批改吧')
    return
  }
  if (
    wordCount.value < 150
    && !confirm(`只有 ${wordCount.value} 词，不足 150 会被扣分，确定提交批改吗？`)
  )
    return
  if (timerId)
    clearInterval(timerId)
  timerOn.value = false
  secondsUsed.value = TIME_LIMIT - secondsLeft.value
  secondsTimed.value = timerStarted.value
  result.value = gradeTask1(essayText.value)
  resultPrompt.value = prompt.value
  resultQuestion.value = prompt.value ? titleOf(prompt.value) : ''
  if (!saveDraftNow())
    return
  view.value = 'result'
  // 自动存档
  if (prompt.value && result.value) {
    pendingEssay = null
    persistEssay({
      id: `${Date.now()}-${crypto.randomUUID()}`,
      promptId: prompt.value.id,
      promptTitleCn: titleCnOf(prompt.value),
      text: essayText.value,
      overall: result.value.overall,
      criteria: result.value.criteria.map(c => ({
        key: c.key,
        score: c.score,
      })),
      wordCount: result.value.stats.words,
      secondsUsed: secondsUsed.value,
      timed: timerStarted.value,
      overtime: overtime.value,
      createdAt: Date.now(),
    })
  }
}

function reviewEssay(e: SavedEssay) {
  const p = findPrompt(e.promptId)
  resultPrompt.value = p
  resultQuestion.value = p ? titleOf(p) : e.promptTitleCn
  essayText.value = e.text
  result.value = gradeTask1(e.text)
  secondsUsed.value = e.secondsUsed
  secondsTimed.value = e.timed !== false
  overtime.value = !!e.overtime
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
function resumeDraft(promptId: string, versionId?: string) {
  const selected = findPrompt(promptId)
  if (selected)
    startWrite(selected, versionId)
}
</script>

<template>
  <div
    v-if="archiveError"
    role="alert"
    class="m-4 border border-red-300 rounded bg-red-50 p-3 text-red-800"
  >
    {{ archiveError }}
    <button class="ml-2 underline" @click="retryArchive">
      重试保存
    </button>
  </div>
  <div>
    <!-- ============ 首页：选题 + 评分标准 + 历史 ============ -->
    <div v-if="view === 'home'">
      <section
        v-if="drafts.length"
        class="mb-6 border border-blue-200 rounded-xl p-4 dark:border-blue-900"
      >
        <h3 class="mb-2 font-bold">
          未完成草稿
        </h3>
        <button
          v-for="draft in drafts"
          :key="draft.versionId || draft.promptId"
          class="mb-2 mr-2 border rounded px-3 py-2 text-sm"
          @click="resumeDraft(draft.promptId, draft.versionId)"
        >
          继续 {{ draft.promptId }} ·
          {{ draft.text.trim().split(/\s+/).length }} 词
        </button>
      </section>
      <!-- 评分标准 -->
      <div
        class="mb-6 border border-gray-200 rounded-xl bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          class="w-full flex items-center justify-between px-5 py-4"
          @click="showGuide = !showGuide"
        >
          <span class="font-bold dark:text-white">📏 雅思小作文四项评分标准
            <span class="text-xs font-normal text-gray-400">（了解规则才能拿分）</span></span>
          <span class="text-gray-400">{{ showGuide ? "▲" : "▼" }}</span>
        </button>
        <div v-if="showGuide" class="grid gap-4 px-5 pb-5 md:grid-cols-2">
          <div
            v-for="g in CRITERION_GUIDE"
            :key="g.key"
            class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50"
          >
            <div class="mb-2 text-sm font-bold dark:text-white">
              {{ g.title }}
            </div>
            <ul class="text-xs text-gray-600 space-y-1 dark:text-gray-300">
              <li v-for="(pt, i) in g.points" :key="i" class="flex gap-1.5">
                <span class="text-blue-500">•</span><span>{{ pt }}</span>
              </li>
            </ul>
          </div>
          <p class="text-xs text-gray-400 md:col-span-2">
            本站批改是基于以上标准的规则估分（词数/段落/衔接词/词汇多样性/句式等可量化信号），用于练习参考，不是官方评分。
          </p>
        </div>
      </div>

      <!-- 选题 -->
      <h3 class="mb-3 text-lg font-bold dark:text-white">
        📚 剑桥真题
        <span class="text-sm font-normal text-gray-400">（剑18–剑21，共 16 题）</span>
      </h3>
      <div class="grid mb-8 gap-4 lg:grid-cols-3 md:grid-cols-2">
        <div
          v-for="p in CAM_TASK1"
          :key="p.id"
          class="flex flex-col border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span
            class="mb-2 w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          >{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.promptCn }}
          </div>
          <button
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <h3 class="mb-3 text-lg font-bold dark:text-white">
        ✏️ 模拟练习
      </h3>
      <div class="grid mb-8 gap-4 lg:grid-cols-3 md:grid-cols-2">
        <div
          v-for="p in TASK1_PROMPTS"
          :key="p.id"
          class="flex flex-col border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span
            class="mb-2 w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          >{{ p.typeCn }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.titleCn }}
          </div>
          <button
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <!-- 历史 -->
      <h3 class="mb-3 text-lg font-bold dark:text-white">
        我的作文
        <span class="text-sm font-normal text-gray-400">（按账号保存）</span>
      </h3>
      <div
        v-if="history.length === 0"
        class="border border-gray-300 rounded-xl border-dashed p-8 text-center text-sm text-gray-400 dark:border-gray-600"
      >
        还没有写过小作文，选一道题开始吧
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="e in history"
          :key="e.id"
          class="flex items-center gap-3 border border-gray-200 rounded-xl bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <span class="text-2xl font-bold" :class="scoreColor(e.overall)">{{
            e.overall.toFixed(1)
          }}</span>
          <div class="flex-1 text-sm">
            <div class="font-medium dark:text-white">
              {{ e.promptTitleCn }}
            </div>
            <div class="text-xs text-gray-400">
              {{ e.wordCount }} 词 · 用时
              {{ e.timed === false ? "未计时" : formatDuration(e.secondsUsed)
              }}{{ e.overtime ? "（含不限时续写）" : "" }} ·
              {{ formatDate(e.createdAt) }}
            </div>
          </div>
          <button
            class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            @click="reviewEssay(e)"
          >
            查看批改
          </button>
          <button
            class="text-sm text-gray-400 hover:text-red-500"
            @click="removeEssay(e.id)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- ============ 写作（左右分栏：左题目右写作） ============ -->
    <div v-else-if="view === 'write' && prompt">
      <button
        class="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800"
        @click="backHome"
      >
        ← 返回选题
      </button>

      <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <!-- 左：题目（桌面端吸顶，写的时候一直看得见） -->
        <div
          class="mb-4 border border-gray-200 rounded-xl bg-white p-5 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 flex items-center gap-2">
            <span
              class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >{{ badgeOf(prompt) }}</span>
            <span class="text-xs text-gray-400">{{ TASK1_INSTRUCTION }}</span>
          </div>
          <p class="mb-4 font-medium dark:text-white">
            {{ titleOf(prompt) }}
          </p>
          <TaskChart v-if="!isCam(prompt)" :prompt="prompt" />
          <img
            v-else-if="prompt.image"
            :src="resolveMediaUrl(prompt.image)"
            :alt="titleCnOf(prompt)"
            class="mx-auto max-w-full border border-gray-100 rounded-lg dark:border-gray-700"
          >
          <details v-if="!isCam(prompt)" class="mt-3 text-sm">
            <summary class="cursor-pointer text-blue-600 dark:text-blue-400">
              💡 写作提示
            </summary>
            <ul class="mt-2 text-gray-600 space-y-1 dark:text-gray-300">
              <li v-for="(t, i) in prompt.tips" :key="i">
                • {{ t }}
              </li>
            </ul>
          </details>
        </div>

        <!-- 右：写作区 -->
        <div>
          <!-- 计时 + 词数 -->
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <div
              class="flex items-center gap-2 border rounded-xl px-4 py-2 text-lg font-bold font-mono dark:border-gray-700 dark:bg-gray-800"
              :class="
                timeUp
                  ? 'border-red-300 text-red-600 dark:text-red-400'
                  : 'border-gray-200 text-gray-800 dark:text-white'
              "
            >
              ⏱ {{ timeText }}
              <span v-if="timeUp" class="text-xs font-normal font-sans">时间到</span>
            </div>
            <button
              class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:text-white"
              :disabled="timeUp || overtime"
              @click="toggleTimer"
            >
              {{ timerOn ? "⏸ 暂停" : "▶ 开始" }}
            </button>
            <button
              class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:text-white"
              @click="resetTimer"
            >
              ↺ 重置
            </button>
            <div
              class="ml-auto text-sm"
              :class="
                wordCount >= 150
                  ? 'text-green-600 font-bold'
                  : 'text-gray-500 dark:text-gray-400'
              "
            >
              {{ wordCount }} / 150 词
            </div>
          </div>
          <div
            class="mb-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              class="h-full rounded-full transition-all"
              :class="wordCount >= 150 ? 'bg-green-500' : 'bg-blue-500'"
              :style="{ width: `${Math.min(100, (wordCount / 150) * 100)}%` }"
            />
          </div>

          <p
            v-if="timeUp"
            role="status"
            class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
          >
            {{
              overtime
                ? "当前为不限时续写：保留原稿和已结束的限时计时，提交记录标为不限时续写。"
                : "限时时间已到。可以提交，或在原稿上不限时续写；续写不会重置倒计时。"
            }}
            <button
              v-if="!overtime"
              class="ml-2 underline"
              @click="continueOvertime"
            >
              不限时续写
            </button>
          </p>
          <textarea
            v-model="essayText"
            rows="18"
            :disabled="timeUp && !overtime"
            placeholder="在这里写你的小作文（英文，至少 150 词）…&#10;&#10;建议结构：&#10;第1段：改写题目引言&#10;第2段：Overview 概述主要趋势&#10;第3-4段：细节 + 数据支撑"
            class="mb-4 block w-full border border-gray-300 rounded-xl bg-white p-4 text-sm leading-7 text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500"
          />

          <div class="flex gap-3">
            <button
              class="flex-1 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white dark:bg-blue-600 hover:bg-blue-800"
              @click="submitEssay"
            >
              提交批改
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 批改结果 ============ -->
    <div v-else-if="view === 'result' && result">
      <button
        class="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800"
        @click="backHome"
      >
        ← 返回
      </button>

      <div
        class="mb-6 border border-gray-200 rounded-xl bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="mb-1 text-sm text-gray-400">
          {{ resultPrompt ? titleCnOf(resultPrompt) : "" }} ·
          {{ result.stats.words }} 词 · 用时
          {{ secondsTimed ? formatDuration(secondsUsed) : "未计时"
          }}{{ overtime ? "（另含不限时续写）" : "" }}
        </div>
        <div class="text-6xl font-bold" :class="scoreColor(result.overall)">
          {{ result.overall.toFixed(1) }}
        </div>
        <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          预估总分（四项平均）
        </div>
        <p class="mt-3 text-xs text-gray-400">
          规则估分，仅供练习参考，不是官方评分
        </p>
      </div>

      <div class="grid mb-6 gap-4 md:grid-cols-2">
        <div
          v-for="c in result.criteria"
          :key="c.key"
          class="border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-bold dark:text-white">{{
              c.labelCn
            }}</span>
            <span class="text-2xl font-bold" :class="scoreColor(c.score)">{{
              c.score.toFixed(1)
            }}</span>
          </div>
          <div class="mb-3 text-xs text-gray-400">
            {{ c.label }}
          </div>
          <div v-if="c.strengths.length" class="mb-2 space-y-1">
            <div
              v-for="(s, i) in c.strengths"
              :key="`s${i}`"
              class="flex gap-1.5 text-xs text-green-700 dark:text-green-400"
            >
              <span>✓</span><span>{{ s }}</span>
            </div>
          </div>
          <div v-if="c.improvements.length" class="space-y-1">
            <div
              v-for="(s, i) in c.improvements"
              :key="`i${i}`"
              class="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400"
            >
              <span>→</span><span>{{ s }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据统计 -->
      <div
        class="mb-6 border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="mb-3 text-sm font-bold dark:text-white">
          📊 写作数据
        </div>
        <div class="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ result.stats.words }}
            </div>
            <div class="text-xs text-gray-400">
              词数
            </div>
          </div>
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ result.stats.paragraphs }}
            </div>
            <div class="text-xs text-gray-400">
              段落
            </div>
          </div>
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ result.stats.sentences }}
            </div>
            <div class="text-xs text-gray-400">
              句子
            </div>
          </div>
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ result.stats.linkingUnique }}
            </div>
            <div class="text-xs text-gray-400">
              衔接词种类
            </div>
          </div>
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ result.stats.trendWords }}
            </div>
            <div class="text-xs text-gray-400">
              趋势词汇
            </div>
          </div>
          <div>
            <div class="text-xl font-bold dark:text-white">
              {{ Math.round(result.stats.complexRatio * 100) }}%
            </div>
            <div class="text-xs text-gray-400">
              复合句占比
            </div>
          </div>
        </div>
      </div>

      <details
        class="mb-6 border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <summary class="cursor-pointer text-sm font-bold dark:text-white">
          📝 我的原文
        </summary>
        <div
          class="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-300"
        >
          {{ essayText }}
        </div>
      </details>

      <AIGradePanel
        v-if="resultQuestion"
        task="task1"
        :question="resultQuestion"
        :essay="essayText"
      />

      <ModelEssayView v-if="resultPrompt" :prompt-id="resultPrompt.id" />

      <div class="flex gap-3">
        <button
          class="flex-1 border border-gray-300 rounded-xl px-5 py-3 text-sm dark:border-gray-600 dark:text-white"
          @click="backHome"
        >
          返回列表
        </button>
        <button
          v-if="resultPrompt"
          class="flex-1 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white dark:bg-blue-600 hover:bg-blue-800"
          @click="startWrite(resultPrompt)"
        >
          再写一篇
        </button>
      </div>
    </div>
  </div>
</template>

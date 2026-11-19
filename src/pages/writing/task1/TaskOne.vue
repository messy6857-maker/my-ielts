<script setup lang="ts">
import type { CambridgeWritingTask } from '../cambridge'
import type { Task1Prompt } from './prompts'
import { resolveMediaUrl } from '../../../composables/useAudio'
import { usePersistentBool } from '../../../composables/usePersistentBool'
import {
  formatEssayDate as formatDate,
  formatEssayDuration as formatDuration,
  useWritingTask,
} from '../../../composables/useWritingTask'
import AIGradePanel from '../AIGradePanel.vue'
import { CAMBRIDGE_WRITING } from '../cambridge'
import ModelEssayView from '../ModelEssayView.vue'
import { CRITERION_GUIDE, gradeTask1 } from './grader'
import { TASK1_INSTRUCTION, TASK1_PROMPTS } from './prompts'
import TaskChart from './TaskChart.vue'

// 小作文：写作流程（选题、计时、草稿、提交、历史）在 useWritingTask 里和大作文共用；
// 这里只有小作文特有的：图表题、四项估分。
type AnyPrompt = Task1Prompt | CambridgeWritingTask
// 同页退出/换号时立即切到当前账号的历史与草稿，不再把旧账号内容带进游客写入
const props = defineProps<{ resumeSelection?: { prompt: string, draft: string } }>()

const CAM_TASK1 = CAMBRIDGE_WRITING.filter(q => q.task === 1)

function isCam(p: AnyPrompt): p is CambridgeWritingTask {
  return (p as CambridgeWritingTask).task !== undefined
}
function badgeOf(p: AnyPrompt): string {
  return isCam(p)
    ? '剑桥真题'
    : p.typeCn
}
function titleOf(p: AnyPrompt): string {
  return isCam(p)
    ? p.promptEn
    : p.title
}
function titleCnOf(p: AnyPrompt): string {
  return isCam(p)
    ? `${p.book} ${p.testLabel} · ${p.promptCn}`
    : p.titleCn
}
function findPrompt(id: string): AnyPrompt | null {
  return (
    TASK1_PROMPTS.find(x => x.id === id)
    ?? CAM_TASK1.find(x => x.id === id)
    ?? null
  )
}

const showGuide = usePersistentBool('myielts_task1_guide_open')

const {
  view,
  history,
  resumeError,
  removeEssay,
  prompt,
  essayText,
  secondsLeft,
  timerOn,
  timeUp,
  overtime,
  wordCount,
  timeText,
  drafts,
  saveDraftNow,
  startWrite,
  continueOvertime,
  toggleTimer,
  resetTimer,
  backHome,
  result,
  resultPrompt,
  resultQuestion,
  secondsUsed,
  secondsTimed,
  archiveError,
  retryArchive,
  submitEssay,
  reviewEssay,
  resumeDraft,
} = useWritingTask({
  task: 'task1',
  essayKey: 'task1_essays_v1',
  timeLimit: 20 * 60,
  minWords: 150,
  messages: {
    tooFew: '词数太少（<50），先多写一点再批改吧',
    confirm: n => `只有 ${n} 词，不足 150 会被扣分，确定提交批改吗？`,
  },
  findPrompt,
  questionOf: titleOf,
  titleCnOf,
  analyze: gradeTask1,
  recordFields: r => ({
    overall: r.overall,
    criteria: r.criteria.map(c => ({
      key: c.key,
      score: c.score,
    })),
    wordCount: r.stats.words,
  }),
  resumeSelection: () => props.resumeSelection,
})
// 页面里用不到，对外可读（测试检查剩余时间、立即存草稿）
defineExpose({ secondsLeft, saveDraftNow })

// 剑桥 Task 1 图表加载失败时给文案兜底（与听力页 partImageFailed 同款）；
// 换题时复位，否则上一题的失败状态会藏起下一题的图
const imageFailed = ref(false)
watch(
  () => prompt.value?.id,
  () => {
    imageFailed.value = false
  },
)

function scoreColor(s: number): string {
  if (s >= 7)
    return 'text-green-600 dark:text-green-400'
  if (s >= 6)
    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}
</script>

<template>
  <p v-if="resumeError" role="status" class="m-4 text-sm text-amber-700">
    所选草稿在当前身份下已不可用，请从草稿列表重新选择。
  </p>
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
            <span class="text-xs text-gray-400 font-normal">（了解规则才能拿分）</span></span>
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
        <span class="text-sm text-gray-400 font-normal">（剑18–剑21，共 16 题）</span>
      </h3>
      <div class="grid mb-8 gap-4 lg:grid-cols-3 md:grid-cols-2">
        <div
          v-for="p in CAM_TASK1"
          :key="p.id"
          class="flex flex-col border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span
            class="mb-2 w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700 font-bold dark:bg-blue-900/40 dark:text-blue-300"
          >{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.promptCn }}
          </div>
          <button
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white font-medium dark:bg-blue-600 hover:bg-blue-800"
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
            class="mb-2 w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700 font-bold dark:bg-blue-900/40 dark:text-blue-300"
          >{{ p.typeCn }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.titleCn }}
          </div>
          <button
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white font-medium dark:bg-blue-600 hover:bg-blue-800"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <!-- 历史 -->
      <h3 class="mb-3 text-lg font-bold dark:text-white">
        我的作文
        <span class="text-sm text-gray-400 font-normal">（按账号保存）</span>
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
              class="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700 font-bold dark:bg-blue-900/40 dark:text-blue-300"
            >{{ badgeOf(prompt) }}</span>
            <span class="text-xs text-gray-400">{{ TASK1_INSTRUCTION }}</span>
          </div>
          <p class="mb-4 font-medium dark:text-white">
            {{ titleOf(prompt) }}
          </p>
          <TaskChart v-if="!isCam(prompt)" :prompt="prompt" />
          <img
            v-else-if="prompt.image && !imageFailed"
            :src="resolveMediaUrl(prompt.image)"
            :alt="titleCnOf(prompt)"
            class="mx-auto max-w-full border border-gray-100 rounded-lg dark:border-gray-700"
            @error="imageFailed = true"
          >
          <p
            v-else-if="prompt.image && imageFailed"
            class="mx-auto max-w-full p-3 text-center text-sm text-gray-500"
          >
            图表加载失败，请检查网络后刷新页面
          </p>
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
            class="mb-4 block w-full border border-gray-300 rounded-xl bg-white p-4 text-sm text-gray-900 leading-7 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500"
          />

          <div class="flex gap-3">
            <button
              class="flex-1 rounded-xl bg-blue-700 px-5 py-3 text-white font-bold dark:bg-blue-600 hover:bg-blue-800"
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
            <div
              class="text-xs text-gray-400"
              title="完整宾语从句、关系从句及状语从句均计入；规则估算"
            >
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
          class="mt-3 whitespace-pre-wrap text-sm text-gray-700 leading-7 dark:text-gray-300"
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
          class="flex-1 rounded-xl bg-blue-700 px-5 py-3 text-sm text-white font-bold dark:bg-blue-600 hover:bg-blue-800"
          @click="startWrite(resultPrompt)"
        >
          再写一篇
        </button>
      </div>
    </div>
  </div>
</template>

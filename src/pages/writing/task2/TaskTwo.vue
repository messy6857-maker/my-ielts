<script setup lang="ts">
import type { CambridgeWritingTask } from '../cambridge'
import type { EssayStats } from '../task1/grader'
import { usePersistentBool } from '../../../composables/usePersistentBool'
import {
  formatEssayDate as formatDate,
  formatEssayDuration as formatDuration,
  useWritingTask,
} from '../../../composables/useWritingTask'
import { TASK2_GUIDE } from '../../../utils/writingGuide'
import AIGradePanel from '../AIGradePanel.vue'
import { CAMBRIDGE_WRITING } from '../cambridge'
import { EXTRA_TASK2 } from '../cambridge-extra'
import ModelEssayView from '../ModelEssayView.vue'
import { analyzeEssay } from '../task1/grader'

// 大作文：写作流程（选题、计时、草稿、提交、历史）在 useWritingTask 里和小作文共用；
// 这里只有大作文特有的：题目列表、提交后的自查清单。
// 同页退出/换号时立即切到当前账号的历史与草稿，不再把旧账号内容带进游客写入
const props = defineProps<{ resumeSelection?: { prompt: string, draft: string } }>()
const TASK2_QUESTIONS = CAMBRIDGE_WRITING.filter(q => q.task === 2)
const TASK2_INSTRUCTION
  = 'You should spend about 40 minutes on this task. Write at least 250 words.'

const showGuide = usePersistentBool('myielts_task2_guide_open')

function findPrompt(id: string): CambridgeWritingTask | null {
  return TASK2_QUESTIONS.find(x => x.id === id)
    ?? EXTRA_TASK2.find(x => x.id === id)
    ?? null
}
function promptTitleCn(p: CambridgeWritingTask) {
  return `${p.book} ${p.testLabel} · ${p.promptCn}`
}

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
  result: stats,
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
  task: 'task2',
  essayKey: 'task2_essays_v1',
  timeLimit: 40 * 60,
  minWords: 250,
  messages: {
    tooFew: '词数太少（<50），先多写一点吧',
    confirm: n => `只有 ${n} 词，不足 250 会被扣分，确定提交吗？`,
  },
  findPrompt,
  questionOf: p => p.promptEn,
  titleCnOf: promptTitleCn,
  analyze: analyzeEssay,
  recordFields: s => ({ wordCount: s.words }),
  resumeSelection: () => props.resumeSelection,
})
// 页面里用不到，对外可读（测试检查剩余时间、立即存草稿）
defineExpose({ secondsLeft, saveDraftNow })

function checklist(s: EssayStats): { ok: boolean, text: string }[] {
  return [
    {
      ok: s.words >= 250,
      text: `词数 ${s.words} / 250${s.words >= 250
        ? ''
        : '（不足会被扣分）'}`,
    },
    // 段落只认 4–5 段：少于 4 段结构不完整，多于 5 段则过碎
    {
      ok: s.paragraphs >= 4 && s.paragraphs <= 5,
      text: `段落 ${s.paragraphs} 个（建议 4–5 段：引言+2–3 个主体段+结尾）`,
    },
    // 衔接看去重数：只会 however 反复用满 6 次也不算多样
    {
      ok: s.linkingUnique >= 4,
      text: `不同衔接词 ${s.linkingUnique} 种（however / moreover / in contrast 等，建议 4 种以上）`,
    },
    {
      ok: s.typeTokenRatio >= 0.45,
      text: `词汇多样性 ${(s.typeTokenRatio * 100).toFixed(0)}%（避免重复用词）`,
    },
    {
      ok: s.complexRatio >= 0.25,
      text: `长难句占比 ${(s.complexRatio * 100).toFixed(0)}%（含完整宾语从句、关系从句等从句、完整并列分句及被动语态；规则估算，短并列句不计）`,
    },
    {
      ok: s.avgSentenceLen >= 12 && s.avgSentenceLen <= 25,
      text: `平均句长 ${s.avgSentenceLen.toFixed(1)} 词（12–25 较理想）`,
    },
  ]
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
    <!-- ============ 首页：选题 + 历史 ============ -->
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
          <span class="font-bold dark:text-white">📏 雅思大作文四项评分标准
            <span class="text-xs text-gray-400 font-normal">（了解规则才能拿分）</span></span>
          <span class="text-gray-400">{{ showGuide ? "▲" : "▼" }}</span>
        </button>
        <div v-if="showGuide" class="grid gap-4 px-5 pb-5 md:grid-cols-2">
          <div
            v-for="g in TASK2_GUIDE"
            :key="g.title"
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
        </div>
      </div>

      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        📚 剑桥真题（剑18–剑21，共 16 题）· 建议 40 分钟、250+ 词
      </p>
      <h3 class="mb-3 text-lg font-bold dark:text-white">
        选择一道题开始写作
      </h3>
      <div class="grid mb-8 gap-4 lg:grid-cols-3 md:grid-cols-2">
        <div
          v-for="p in TASK2_QUESTIONS"
          :key="p.id"
          class="flex flex-col border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span
            class="mb-2 w-fit rounded-full bg-purple-100 px-2.5 py-0.5 text-xs text-purple-700 font-bold dark:bg-purple-900/40 dark:text-purple-300"
          >{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.promptCn }}
          </div>
          <button
            class="rounded-lg bg-purple-700 px-4 py-2 text-sm text-white font-medium dark:bg-purple-600 hover:bg-purple-800"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <h3 class="mb-3 text-lg font-bold dark:text-white">
        📝 更多真题
        <span class="text-sm text-gray-400 font-normal">（剑14/15/17，共 12 题）</span>
      </h3>
      <div class="grid mb-8 gap-4 lg:grid-cols-3 md:grid-cols-2">
        <div
          v-for="p in EXTRA_TASK2"
          :key="p.id"
          class="flex flex-col border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <span
            class="mb-2 w-fit rounded-full bg-teal-100 px-2.5 py-0.5 text-xs text-teal-700 font-bold dark:bg-teal-900/40 dark:text-teal-300"
          >{{ p.book }} {{ p.testLabel }}</span>
          <div class="mb-3 flex-1 text-sm font-medium dark:text-white">
            {{ p.promptCn }}
          </div>
          <button
            class="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white font-medium dark:bg-teal-600 hover:bg-teal-800"
            @click="startWrite(p)"
          >
            开始写作
          </button>
        </div>
      </div>

      <h3 class="mb-3 text-lg font-bold dark:text-white">
        我的作文
        <span class="text-sm text-gray-400 font-normal">（按账号保存）</span>
      </h3>
      <div
        v-if="history.length === 0"
        class="border border-gray-300 rounded-xl border-dashed p-8 text-center text-sm text-gray-400 dark:border-gray-600"
      >
        还没有写过大作文，选一道题开始吧
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="e in history"
          :key="e.id"
          class="flex items-center gap-3 border border-gray-200 rounded-xl bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
        >
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
            查看
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
              class="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs text-purple-700 font-bold dark:bg-purple-900/40 dark:text-purple-300"
            >{{ prompt.book }} {{ prompt.testLabel }}</span>
            <span class="text-xs text-gray-400">{{ TASK2_INSTRUCTION }}</span>
          </div>
          <p class="font-medium leading-7 dark:text-white">
            {{ prompt.promptEn }}
          </p>
        </div>

        <!-- 右：写作区 -->
        <div>
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
                wordCount >= 250
                  ? 'text-green-600 font-bold'
                  : 'text-gray-500 dark:text-gray-400'
              "
            >
              {{ wordCount }} / 250 词
            </div>
          </div>
          <div
            class="mb-4 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              class="h-full rounded-full transition-all"
              :class="wordCount >= 250 ? 'bg-green-500' : 'bg-purple-500'"
              :style="{ width: `${Math.min(100, (wordCount / 250) * 100)}%` }"
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
            placeholder="在这里写你的大作文（英文，至少 250 词）…&#10;&#10;建议结构：&#10;第1段：改写题目 + 表明立场&#10;第2-3段：分论点 + 论据/例子&#10;最后一段：重申立场"
            class="mb-4 block w-full border border-gray-300 rounded-xl bg-white p-4 text-sm text-gray-900 leading-7 dark:border-gray-600 focus:border-purple-500 dark:bg-gray-700 dark:text-white focus:ring-purple-500"
          />

          <div class="flex gap-3">
            <button
              class="flex-1 rounded-xl bg-purple-700 px-5 py-3 text-white font-bold dark:bg-purple-600 hover:bg-purple-800"
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
      <button
        class="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800"
        @click="backHome"
      >
        ← 返回
      </button>

      <div
        class="mb-6 border border-gray-200 rounded-xl bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="mb-4 text-sm text-gray-400">
          {{ resultPrompt ? promptTitleCn(resultPrompt) : "" }} ·
          {{ stats.words }} 词 · 用时
          {{ secondsTimed ? formatDuration(secondsUsed) : "未计时"
          }}{{ overtime ? "（另含不限时续写）" : "" }}
        </div>
        <h4 class="mb-3 font-bold dark:text-white">
          ✅ 写作自查清单
        </h4>
        <ul class="space-y-2">
          <li
            v-for="(c, i) in checklist(stats)"
            :key="i"
            class="flex items-start gap-2 text-sm"
          >
            <span>{{ c.ok ? "✅" : "⚠️" }}</span>
            <span
              :class="
                c.ok
                  ? 'text-gray-700 dark:text-gray-200'
                  : 'text-gray-500 dark:text-gray-400'
              "
            >{{ c.text }}</span>
          </li>
        </ul>
        <p class="mt-4 text-xs text-gray-400">
          这是可量化的写作习惯检查，不是雅思官方评分。大作文的论证逻辑和观点展开，还得对照范文自己复盘。口径说明：平均句长与词汇多样性按纯字母切词统计，词数按空白切分；数字多的作文平均句长会被轻微低估。
        </p>
      </div>

      <div
        class="mb-6 border border-gray-200 rounded-xl bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <h4 class="mb-2 text-sm text-gray-500 font-bold dark:text-gray-400">
          我的作文
        </h4>
        <p
          class="whitespace-pre-wrap text-sm text-gray-800 leading-7 dark:text-gray-200"
        >
          {{ essayText }}
        </p>
      </div>

      <AIGradePanel
        v-if="resultQuestion"
        task="task2"
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

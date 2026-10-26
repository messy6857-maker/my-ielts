<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { gradeEssayWithAI, hasAISettings } from '~/composables/useAISettings'
import type { AIGradeResult } from '~/composables/useAISettings'
import { useAuth } from '~/composables/useAuth'
import { diffWords } from '~/composables/useWordDiff'
import type { DiffToken } from '~/composables/useWordDiff'
import { parseAIGradeResult } from '~/utils/aiSchema'
import { nsKey } from '~/composables/useStudyData'
import { writeJson } from '~/composables/useAuth'

const props = defineProps<{
  task: 'task1' | 'task2'
  question: string
  essay: string
}>()

const { currentUser } = useAuth()
// AI 批改：所有登录账号可用，每人填自己的 API Key
const canUseAI = computed(() => !!currentUser.value)

const aiLoading = ref(false)
const aiResult = ref<AIGradeResult | null>(null)
const aiError = ref('')
const gradeStep = ref('')

// AI 结果按账号 + 作文内容持久化，切走再回来仍保留
function storageKey(): string {
  const s = `${props.task}|${props.question}|${props.essay}`
  let h = 0
  for (let i = 0; i < s.length; i++)
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return nsKey(`aigrade_v1_${h.toString(36)}`)
}

function loadSaved(): boolean {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) {
      aiResult.value = parseAIGradeResult(JSON.parse(raw), props.task)
      return true
    }
  }
  catch { /* ignore */ }
  return false
}

let controller: AbortController | null = null
let requestId = 0
function resetResult() {
  requestId++
  controller?.abort()
  aiLoading.value = false
  gradeStep.value = ''
  aiError.value = ''
  aiResult.value = null
  loadSaved()
}
watch(storageKey, resetResult, { immediate: true })
onScopeDispose(() => {
  requestId++
  controller?.abort()
})

const criterionLabels: Record<'ta' | 'cc' | 'lr' | 'gra', string> = props.task === 'task1'
  ? { ta: '任务完成', cc: '连贯衔接', lr: '词汇资源', gra: '语法' }
  : { ta: '任务回应', cc: '连贯衔接', lr: '词汇资源', gra: '语法' }

async function runAIGrade() {
  if (!canUseAI.value) {
    aiError.value = '请先登录账号再使用 AI 批改'
    return
  }
  const seq = ++requestId
  const key = storageKey()
  controller = new AbortController()
  aiLoading.value = true
  aiError.value = ''
  aiResult.value = null
  // 批改过程分阶段提示
  const steps = ['正在连接 AI…', '正在分析作文…', '正在按四项标准评分…', '正在生成修改建议…']
  let stepIdx = 0
  gradeStep.value = steps[0]
  const stepTimer = setInterval(() => {
    stepIdx = Math.min(stepIdx + 1, steps.length - 1)
    if (seq === requestId)
      gradeStep.value = steps[stepIdx]
  }, 4000)
  try {
    const result = await gradeEssayWithAI(props.task, props.question, props.essay, controller.signal)
    if (seq === requestId) {
      aiResult.value = result
      writeJson(key, result)
    }
  }
  catch (e) {
    if (seq === requestId)
      aiError.value = e instanceof Error ? e.message : '批改失败，请重试'
  }
  finally {
    clearInterval(stepTimer)
    if (seq === requestId) {
      gradeStep.value = ''
      aiLoading.value = false
    }
  }
}

function scoreColor(s: number) {
  if (s >= 7) return 'text-green-600 dark:text-green-400'
  if (s >= 6) return 'text-blue-600 dark:text-blue-400'
  if (s >= 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

// 改写全文与原文的单词级 diff，用于颜色标注改动处
const showDiff = ref(false)
const rewrittenTokens = computed(() => {
  if (!aiResult.value?.rewritten)
    return []
  return diffWords(props.essay, aiResult.value.rewritten)
})

// 按换行切分成段落，每段独立 <p> 显示，段落感分明
const rewrittenParagraphs = computed(() => {
  const paras: DiffToken[][] = [[]]
  for (const t of rewrittenTokens.value) {
    if (/^\s+$/.test(t.text) && t.text.includes('\n')) {
      if (paras[paras.length - 1].length > 0)
        paras.push([])
    }
    else {
      paras[paras.length - 1].push(t)
    }
  }
  return paras.filter(p => p.length > 0)
})

// 非对照模式下过滤掉被删的词（只看改写后）
const visibleParagraphs = computed(() =>
  rewrittenParagraphs.value
    .map(para => showDiff.value ? para : para.filter(t => t.type !== 'del'))
    .filter(p => p.length > 0),
)

function tokenClass(t: DiffToken): string {
  if (t.type === 'del')
    return 'rounded bg-red-200 px-0.5 text-red-700 line-through dark:bg-red-900/50 dark:text-red-300'
  if (t.type === 'ins')
    return showDiff.value
      ? 'rounded bg-green-200 px-0.5 text-green-800 dark:bg-green-900/60 dark:text-green-200'
      : 'rounded bg-green-200 px-0.5 dark:bg-green-900/60 dark:text-green-200'
  return ''
}
</script>

<template>
  <div class="mb-6 rounded-xl border border-purple-200 bg-white p-5 dark:border-purple-900/50 dark:bg-gray-800">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h4 class="font-bold text-sm dark:text-white">🤖 AI 批改 <span class="font-normal text-xs text-gray-400">（四项官方标准）</span></h4>
      <div class="flex items-center gap-3">
        <span v-if="!canUseAI" class="text-gray-400" title="locked">🔒</span>
        <template v-else>
          <router-link v-if="!hasAISettings()" to="/settings" class="text-xs text-blue-600 hover:underline dark:text-blue-400">
            先去设置 API →
          </router-link>
          <button
            class="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-50 dark:bg-purple-600"
            :disabled="aiLoading"
            @click="runAIGrade"
          >
            {{ aiLoading ? '批改中…' : (aiResult ? '重新批改' : '开始 AI 批改') }}
          </button>
        </template>
      </div>
    </div>

    <p v-if="aiError" class="text-sm text-red-500">{{ aiError }}</p>

    <div v-if="aiLoading" class="flex items-center gap-3 rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
      <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-purple-300 border-t-purple-700" />
      <span class="text-sm text-purple-700 dark:text-purple-300">{{ gradeStep || '正在批改…' }}</span>
    </div>

    <div v-if="aiResult">
      <div class="mb-4 text-center">
        <div class="text-5xl font-bold" :class="scoreColor(aiResult.scores.overall)">{{ aiResult.scores.overall.toFixed(1) }}</div>
        <div class="mt-1 text-xs text-gray-400">AI 预估总分</div>
      </div>
      <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="(label, key) in criterionLabels"
          :key="key"
          class="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-700/50"
        >
          <div class="text-2xl font-bold" :class="scoreColor(aiResult.scores[key])">
            {{ aiResult.scores[key].toFixed(1) }}
          </div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ label }}</div>
        </div>
      </div>

      <div class="mb-5 space-y-3">
        <div v-for="(label, key) in criterionLabels" :key="key">
          <div class="mb-1 text-sm font-bold dark:text-white">{{ label }}</div>
          <p class="text-sm leading-6 text-gray-600 dark:text-gray-300">{{ aiResult.comments[key] }}</p>
        </div>
      </div>

      <div v-if="aiResult.advice" class="mb-5">
        <div class="mb-2 text-sm font-bold dark:text-white">📋 四项标准详细修改建议</div>
        <div class="space-y-2">
          <div
            v-for="(label, key) in criterionLabels"
            :key="key"
            class="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-900/10"
          >
            <div class="mb-1 text-xs font-bold text-blue-700 dark:text-blue-300">{{ label }} · {{ aiResult.scores[key].toFixed(1) }}分</div>
            <p class="text-sm leading-6 text-gray-700 dark:text-gray-200">{{ aiResult.advice[key] }}</p>
          </div>
        </div>
      </div>

      <div v-if="aiResult.corrections.length" class="mb-5">
        <div class="mb-2 text-sm font-bold dark:text-white">✏️ 逐句修改</div>
        <div class="space-y-2">
          <div
            v-for="(c, i) in aiResult.corrections"
            :key="i"
            class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-700/50"
          >
            <p class="text-gray-500 line-through dark:text-gray-400">{{ c.original }}</p>
            <p class="mt-1 font-medium text-green-700 dark:text-green-400">{{ c.fixed }}</p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">💡 {{ c.reason }}</p>
          </div>
        </div>
      </div>

      <div v-if="aiResult.rewritten" class="mb-5">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-bold dark:text-white">📄 改写后全文</span>
          <button
            class="text-xs text-blue-600 hover:underline dark:text-blue-400"
            @click="showDiff = !showDiff"
          >
            {{ showDiff ? '只看改写后' : '对照查看改动' }}
          </button>
        </div>
        <div class="rounded-lg bg-gray-50 p-4 text-sm leading-7 break-words dark:bg-gray-700/50 dark:text-gray-200">
          <p
            v-for="(para, pi) in visibleParagraphs"
            :key="pi"
            class="mb-3 last:mb-0"
          >
            <span
              v-for="(t, i) in para"
              :key="i"
              :class="tokenClass(t)"
            >{{ t.text }}</span>
          </p>
        </div>
        <p class="mt-1 text-xs text-gray-400">
          <span class="rounded bg-green-200 px-1 dark:bg-green-900/60">绿色</span> 为改写新增/修改的词<span v-if="showDiff">，<span class="rounded bg-red-200 px-1 line-through dark:bg-red-900/50">红色删除线</span> 为原文删掉的词</span>
        </p>
      </div>

      <div class="rounded-lg bg-purple-50 p-4 text-sm leading-6 dark:bg-purple-900/20 dark:text-gray-200">
        <span class="font-bold">📈 提分建议：</span>{{ aiResult.suggestion }}
      </div>
      <p class="mt-3 text-xs text-gray-400">AI 批改仅供练习参考，不是官方评分</p>
    </div>

    <p v-else-if="!aiLoading && !aiError" class="text-xs leading-5 text-gray-400">
      <template v-if="canUseAI">
        AI 会按雅思四项官方标准打分，指出每项的问题，并逐句给出修改建议。需要先在右上角 ⚙️ 设置页填写 API 地址、Key 和模型。
      </template>
      <template v-else>
        AI 批改需要登录账号（每人填自己的 API Key），游客请先注册/登录。
      </template>
    </p>
  </div>
</template>

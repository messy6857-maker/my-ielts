<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  gradeSpeakingWithAI,
  hasAISettings,
  isBandScore,
} from '~/composables/useAISettings'
import type { AISpeakingResult } from '~/composables/useAISettings'
import { readJson, useAuth } from '~/composables/useAuth'
import { saveAiArchive } from '~/utils/archives'
import { onSyncApplied } from '~/composables/syncClient'

// part 由调用方传入（PartTwoPractice 传 part2；Part 1/3 的 QuestionRecorder 未传，
// 其调用页不在本次改动范围，缺省为空，但 key 仍凭题目+转写哈希唯一）
const props = withDefaults(
  defineProps<{
    question: string
    transcript: string
    part?: string
  }>(),
  { part: '' },
)

const { currentUser, logout } = useAuth()
const router = useRouter()

async function goRelogin() {
  const result = await logout()
  if (result.cancelled)
    return
  router.push('/login')
}
// 与写作 AI 批改一致：所有登录账号可用
const canUseAI = computed(() => !!currentUser.value)

const loading = ref(false)
const result = ref<AISpeakingResult | null>(null)
const error = ref('')

// 评分结果存档：与写作 AIGradePanel 同款写法（key 含 part + 题目 + 转写哈希，
// 经 writeJson 进同步清单）；挂载时恢复同一题同一段转写的结果
function storageKey(): string {
  const user = currentUser.value ? `u_${currentUser.value}` : 'guest'
  const s = `${props.question}|${props.transcript}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `myielts_${user}_aigrade_speaking_v1_${props.part || 'na'}_${h.toString(36)}`
}

function loadSaved(): boolean {
  try {
    const raw = readJson<unknown>(storageKey(), null)
    if (raw) {
      const parsed = raw as Partial<AISpeakingResult>
      // 旧存档走与评分入口同一口径校验：任一项不合格即视为无存档（面板置空、可重新评分），
      // 不删存储里的旧档（新评分会按同一 key 覆盖，自然消失），不弹错、不崩溃。
      // 注意 JSON 存不了 NaN/Infinity（存时已变 null），同样会被 isBandScore 拦下。
      if (
        parsed?.scores
        && isBandScore(parsed.scores.overall)
        && isBandScore(parsed.scores.fluency)
        && isBandScore(parsed.scores.lexical)
        && isBandScore(parsed.scores.grammar)
        && parsed.comments
        && typeof parsed.comments.fluency === 'string'
        && typeof parsed.comments.lexical === 'string'
        && typeof parsed.comments.grammar === 'string'
      ) {
        result.value = parsed as AISpeakingResult
        return true
      }
    }
  }
  catch {
    /* ignore */
  }
  return false
}

onMounted(() => {
  loadSaved()
})

// 账号变化时清空上一账号的结果，不让游客/新账号看到旧评分
watch(currentUser, () => {
  result.value = null
  error.value = ''
})

const labels: Record<'fluency' | 'lexical' | 'grammar', string> = {
  fluency: '流利连贯',
  lexical: '词汇资源',
  grammar: '语法',
}

let requestId = 0
let controller: AbortController | null = null
const wordCount = computed(
  () => props.transcript.trim().split(/\s+/).filter(Boolean).length,
)
function invalidate() {
  requestId++
  controller?.abort()
  controller = null
  loading.value = false
}
async function runGrade() {
  if (!canUseAI.value || wordCount.value < 10) {
    error.value = wordCount.value < 10 ? '至少说10个词后再评分' : '请先登录'
    return
  }
  invalidate()
  const sequence = requestId
  const owner = currentUser.value
  const key = storageKey()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const value = await gradeSpeakingWithAI(
      props.question,
      props.transcript,
      controller.signal,
    )
    if (
      sequence !== requestId
      || owner !== currentUser.value
      || key !== storageKey()
    )
      return
    result.value = value
    if (!saveAiArchive(key, value, owner))
      error.value = '评分已显示，但存档未能保存，请导出备份并清理空间'
  }
  catch (e) {
    if (sequence === requestId)
      error.value = e instanceof Error ? e.message : '评分失败，请重试'
  }
  finally {
    if (sequence === requestId)
      loading.value = false
  }
}
watch(
  [currentUser, () => props.question, () => props.transcript, () => props.part],
  () => {
    invalidate()
    result.value = null
    error.value = ''
    loadSaved()
  },
)
const offSync = onSyncApplied(() => {
  if (!loading.value)
    loadSaved()
})
onUnmounted(() => {
  invalidate()
  offSync()
})

function scoreColor(s: number) {
  if (s >= 7)
    return 'text-green-600 dark:text-green-400'
  if (s >= 6)
    return 'text-blue-600 dark:text-blue-400'
  if (s >= 5)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}
</script>

<template>
  <div
    class="mt-3 border border-purple-200 rounded-xl bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-900/10"
  >
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-bold dark:text-white">
        🤖 AI 评分
        <span class="text-xs font-normal text-gray-400">（口语三项标准）</span>
      </h4>
      <div class="flex items-center gap-2">
        <span v-if="!canUseAI" class="text-gray-400" title="locked">🔒</span>
        <template v-else>
          <router-link
            v-if="!hasAISettings()"
            to="/settings"
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            先去设置 API →
          </router-link>
          <button
            v-else
            class="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50"
            :disabled="loading || wordCount < 10"
            @click="runGrade"
          >
            {{ loading ? '评分中…' : result ? '重新评分' : 'AI 评分' }}
          </button>
        </template>
      </div>
    </div>

    <p v-if="wordCount < 10" class="text-xs text-gray-500">
      至少说10个词后可评分（当前 {{ wordCount }} 词）。
    </p>
    <p v-if="error" class="text-xs text-red-500">
      {{ error }}
      <button
        v-if="error.includes('登录已过期')"
        class="ml-2 rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
        @click="goRelogin"
      >
        去登录
      </button>
      <button
        v-else-if="error.includes('API Key')"
        class="ml-2 rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
        @click="$router.push('/settings')"
      >
        去设置
      </button>
    </p>

    <div v-if="result">
      <div class="mb-3 text-center">
        <div
          class="text-4xl font-bold"
          :class="scoreColor(result.scores.overall)"
        >
          {{ result.scores.overall?.toFixed(1) ?? '—' }}
        </div>
        <div class="mt-1 text-xs text-gray-400">
          AI 预估总分
        </div>
      </div>
      <div class="grid grid-cols-3 mb-3 gap-2">
        <div
          v-for="(label, key) in labels"
          :key="key"
          class="rounded-lg bg-white p-2 text-center dark:bg-gray-700/50"
        >
          <div
            class="text-xl font-bold"
            :class="scoreColor(result.scores[key])"
          >
            {{ result.scores[key]?.toFixed(1) ?? '—' }}
          </div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ label }}
          </div>
        </div>
      </div>
      <div class="mb-3 space-y-2">
        <div v-for="(label, key) in labels" :key="key">
          <div class="text-xs font-bold dark:text-white">
            {{ label }}
          </div>
          <p class="text-xs leading-5 text-gray-600 dark:text-gray-300">
            {{ result.comments?.[key] ?? '' }}
          </p>
        </div>
      </div>
      <div
        class="rounded-lg bg-white p-3 text-xs leading-5 dark:bg-gray-700/50 dark:text-gray-200"
      >
        <span class="font-bold">📈 提分建议：</span>{{ result.suggestion }}
      </div>
      <p class="mt-2 text-xs text-gray-400">
        发音项无法从文字转写评估，请回放录音自行检查语调、重音和连读。AI
        评分仅供练习参考。
      </p>
    </div>

    <p v-else-if="!loading && !error" class="text-xs leading-5 text-gray-400">
      <template v-if="canUseAI">
        AI 会按流利连贯、词汇、语法三项打分（基于语音转写文字）。需先在 ⚙️
        设置页填写 API。
      </template>
      <template v-else>
        AI 评分为登录用户功能，游客请先注册/登录。
      </template>
    </p>
  </div>
</template>

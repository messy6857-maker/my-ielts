<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { gradeSpeakingWithAI, hasAISettings } from '~/composables/useAISettings'
import type { AISpeakingResult } from '~/composables/useAISettings'
import { useAuth } from '~/composables/useAuth'

const props = defineProps<{
  question: string
  transcript: string
}>()

const { currentUser } = useAuth()
// 与写作 AI 批改一致：所有登录账号可用
const canUseAI = computed(() => !!currentUser.value)

const loading = ref(false)
const result = ref<AISpeakingResult | null>(null)
const error = ref('')

const labels: Record<'fluency' | 'lexical' | 'grammar', string> = {
  fluency: '流利连贯',
  lexical: '词汇资源',
  grammar: '语法',
}

let controller: AbortController | null = null
let requestId = 0
watch([() => props.question, () => props.transcript, currentUser], () => {
  requestId++
  controller?.abort()
  result.value = null
  loading.value = false
  error.value = ''
})
onScopeDispose(() => {
  requestId++
  controller?.abort()
})

async function runGrade() {
  if (!canUseAI.value) {
    error.value = '请先登录账号再使用 AI 评分'
    return
  }
  const seq = ++requestId
  controller = new AbortController()
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const graded = await gradeSpeakingWithAI(props.question, props.transcript, controller.signal)
    if (seq === requestId)
      result.value = graded
  }
  catch (e) {
    if (seq === requestId)
      error.value = e instanceof Error ? e.message : '评分失败，请重试'
  }
  finally {
    if (seq === requestId)
      loading.value = false
  }
}

function scoreColor(s: number) {
  if (s >= 7) return 'text-green-600 dark:text-green-400'
  if (s >= 6) return 'text-blue-600 dark:text-blue-400'
  if (s >= 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}
</script>

<template>
  <div class="mt-3 rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-900/10">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-bold dark:text-white">🤖 AI 评分 <span class="font-normal text-xs text-gray-400">（口语三项标准）</span></h4>
      <div class="flex items-center gap-2">
        <span v-if="!canUseAI" class="text-gray-400" title="locked">🔒</span>
        <template v-else>
          <router-link v-if="!hasAISettings()" to="/settings" class="text-xs text-blue-600 hover:underline dark:text-blue-400">
            先去设置 API →
          </router-link>
          <button
            v-else
            class="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50"
            :disabled="loading"
            @click="runGrade"
          >
            {{ loading ? '评分中…' : (result ? '重新评分' : 'AI 评分') }}
          </button>
        </template>
      </div>
    </div>

    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

    <div v-if="result">
      <div class="mb-3 text-center">
        <div class="text-4xl font-bold" :class="scoreColor(result.scores.overall)">{{ result.scores.overall.toFixed(1) }}</div>
        <div class="mt-1 text-xs text-gray-400">AI 预估总分</div>
      </div>
      <div class="mb-3 grid grid-cols-3 gap-2">
        <div
          v-for="(label, key) in labels"
          :key="key"
          class="rounded-lg bg-white p-2 text-center dark:bg-gray-700/50"
        >
          <div class="text-xl font-bold" :class="scoreColor(result.scores[key])">
            {{ result.scores[key].toFixed(1) }}
          </div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ label }}</div>
        </div>
      </div>
      <div class="mb-3 space-y-2">
        <div v-for="(label, key) in labels" :key="key">
          <div class="text-xs font-bold dark:text-white">{{ label }}</div>
          <p class="text-xs leading-5 text-gray-600 dark:text-gray-300">{{ result.comments[key] }}</p>
        </div>
      </div>
      <div class="rounded-lg bg-white p-3 text-xs leading-5 dark:bg-gray-700/50 dark:text-gray-200">
        <span class="font-bold">📈 提分建议：</span>{{ result.suggestion }}
      </div>
      <p class="mt-2 text-xs text-gray-400">发音项无法从文字转写评估，请回放录音自行检查语调、重音和连读。AI 评分仅供练习参考。</p>
    </div>

    <p v-else-if="!loading && !error" class="text-xs leading-5 text-gray-400">
      <template v-if="canUseAI">
        AI 会按流利连贯、词汇、语法三项打分（基于语音转写文字）。需先在 ⚙️ 设置页填写 API。
      </template>
      <template v-else>
        AI 评分为登录用户功能，游客请先注册/登录。
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { gradeEssayWithAI, hasAISettings } from '~/composables/useAISettings'
import type { AIGradeResult } from '~/composables/useAISettings'
import { useAuth } from '~/composables/useAuth'

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

const criterionLabels: Record<'ta' | 'cc' | 'lr' | 'gra', string> = props.task === 'task1'
  ? { ta: '任务完成', cc: '连贯衔接', lr: '词汇资源', gra: '语法' }
  : { ta: '任务回应', cc: '连贯衔接', lr: '词汇资源', gra: '语法' }

async function runAIGrade() {
  if (!canUseAI.value) {
    aiError.value = '请先登录账号再使用 AI 批改'
    return
  }
  aiLoading.value = true
  aiError.value = ''
  aiResult.value = null
  try {
    aiResult.value = await gradeEssayWithAI(props.task, props.question, props.essay)
  }
  catch (e) {
    aiError.value = e instanceof Error ? e.message : '批改失败，请重试'
  }
  finally {
    aiLoading.value = false
  }
}

// 换一篇作文时清空旧结果
watch(() => props.essay, () => {
  aiResult.value = null
  aiError.value = ''
})

function scoreColor(s: number) {
  if (s >= 7) return 'text-green-600 dark:text-green-400'
  if (s >= 6) return 'text-blue-600 dark:text-blue-400'
  if (s >= 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
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

<script setup lang="ts">
import type { useExamRecovery } from '~/composables/useExamRecovery'
import { mockTestList } from '~/pages/mock/registry'
import { formatCountdown } from '~/pages/mock/types'

// 听力、阅读模考共用的考试顶栏：标题、换套题、倒计时、交卷。默认插槽放在标题前（阅读页的返回键）。
defineProps<{
  recovery: ReturnType<typeof useExamRecovery>
  testId: string
  icon: string
  title: string
  timeLeft: number
  submitted: boolean
}>()
defineEmits<{
  changeTest: [event: Event]
  submit: []
}>()
</script>

<template>
  <div class="mb-6 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <slot />
      <h2 class="text-2xl text-gray-900 font-bold dark:text-white">
        {{ icon }} {{ title }}
      </h2>
      <select
        :value="testId"
        :disabled="recovery.blocked.value"
        class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
        @change="$emit('changeTest', $event)"
      >
        <option v-for="t in mockTestList" :key="t.id" :value="t.id">
          {{ t.label }}
        </option>
      </select>
    </div>
    <div class="flex items-center gap-4">
      <span
        class="rounded-lg px-4 py-2 text-xl font-bold font-mono"
        :class="
          timeLeft < 300
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        "
      >
        ⏱ {{ formatCountdown(timeLeft) }}
      </span>
      <button
        v-if="!submitted"
        :disabled="recovery.retired.value"
        :title="recovery.retired.value ? '退役态下交卷不可用，请用上方横幅按钮处理' : undefined"
        class="rounded-lg bg-blue-600 px-6 py-2 text-white font-bold disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50"
        @click="$emit('submit')"
      >
        交卷
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { useExamRecovery } from '~/composables/useExamRecovery'
import { mockTestList } from '~/pages/mock/registry'
import { formatCountdown } from '~/pages/mock/types'

// 听力、阅读模考共用的开始屏：选套题、开始 / 继续草稿、放弃草稿、选择要恢复的草稿。
// 题量那一行（summary）由页面自己写。
defineProps<{
  recovery: ReturnType<typeof useExamRecovery>
  testId: string
  icon: string
  title: string
}>()
defineEmits<{
  changeTest: [event: Event]
  start: []
  discard: []
}>()
</script>

<template>
  <div class="mx-auto max-w-2xl py-16 text-center">
    <div class="mb-6 text-left">
      <SectionTabs group="mock" />
    </div>
    <p class="mb-4 text-5xl">
      {{ icon }}
    </p>
    <h2 class="mb-2 text-2xl text-gray-900 font-bold dark:text-white">
      {{ title }}
    </h2>
    <p class="mb-2 text-gray-500 dark:text-gray-400">
      <slot name="summary" />
    </p>
    <p class="mb-8 text-sm text-gray-400 dark:text-gray-500">
      点击开始后计时启动，时间到自动交卷
    </p>
    <div class="mb-6 flex items-center justify-center gap-3">
      <span class="text-sm text-gray-500 dark:text-gray-400">选择套题：</span>
      <select
        :value="testId"
        class="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        @change="$emit('changeTest', $event)"
      >
        <option v-for="t in mockTestList" :key="t.id" :value="t.id">
          {{ t.label }}
        </option>
      </select>
    </div>
    <button
      class="rounded-xl bg-blue-600 px-10 py-3 text-lg text-white font-bold hover:bg-blue-700"
      @click="$emit('start')"
    >
      {{
        recovery.draft.value && !recovery.draft.value.submitted
          ? "继续所选作答（从剩余时间计时）"
          : recovery.availableDrafts.value.length && !recovery.draft.value
            ? "▶ 全新开始（已有草稿未选）"
            : "▶ 开始测试"
      }}
    </button>
    <button
      v-if="recovery.draft.value && !recovery.draft.value.submitted"
      type="button"
      class="ml-3 border border-gray-300 rounded-xl px-6 py-3 text-lg text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
      @click="$emit('discard')"
    >
      放弃草稿，重新开始
    </button>
    <p
      v-if="recovery.retainedNotice.value"
      role="status"
      class="mt-4 text-sm text-amber-700 dark:text-amber-300"
    >
      {{ recovery.retainedNotice.value }}
      <button
        type="button"
        class="ml-2 underline"
        @click="recovery.dismissRetainedNotice()"
      >
        知道了
      </button>
    </p>
    <p
      v-if="recovery.submittedDrafts.value.length"
      class="mt-4 text-sm text-gray-500 dark:text-gray-400"
    >
      该套题已有交卷记录，重新开始将是一次新的测试
    </p>
    <div
      v-if="
        recovery.availableDrafts.value.length > 1
          || (recovery.availableDrafts.value.length && !recovery.draft.value)
      "
      class="my-3 text-sm"
    >
      <p>
        不同页签是独立作答。请选择要恢复的草稿，提交或放弃仅影响所选的同次作答。
      </p>
      <select
        aria-label="选择独立作答草稿"
        :value="recovery.draft.value?.versionId || ''"
        @change="
          recovery.selectDraft(($event.target as HTMLSelectElement).value)
        "
      >
        <option value="" disabled>
          选择要恢复的作答
        </option>
        <option
          v-for="snapshot in recovery.availableDrafts.value"
          :key="snapshot.versionId"
          :value="snapshot.versionId"
        >
          {{
            snapshot.editedAt || snapshot.updatedAt
              ? new Date(
                snapshot.editedAt || snapshot.updatedAt,
              ).toLocaleString()
              : "时间未知"
          }}
          · {{ Object.values(snapshot.answers).filter(Boolean).length }} 题
          {{
            snapshot.timeLeft == null
              ? ""
              : `· 剩余 ${formatCountdown(snapshot.timeLeft)}`
          }}
          {{ snapshot.timeLeft === 0 ? "（剩余 0 秒）" : "" }}
          {{
            snapshot.activeElsewhere
              ? "（另一页签可能在使用）"
              : "（本机保留）"
          }}
        </option>
      </select>
    </div>
    <p
      v-if="recovery.draft.value && !recovery.draft.value.submitted"
      class="mt-4 text-sm text-gray-500 dark:text-gray-400"
    >
      草稿最后保存：{{
        recovery.draft.value.updatedAt
          ? new Date(recovery.draft.value.updatedAt).toLocaleString()
          : "时间未知（答案已保留）"
      }}
    </p>
  </div>
</template>

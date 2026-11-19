<script setup lang="ts">
// 听力、阅读模考交卷后的成绩单：预估 Band、答对几分。默认插槽放额外按钮（听力页的去精听）。
defineProps<{
  answeredCount: number
  band: number
  correctCount: number
  scoredTotal: number
}>()
</script>

<template>
  <div
    class="mb-8 border border-gray-200 rounded-2xl bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
  >
    <template v-if="answeredCount === 0">
      <p class="mb-2 text-4xl text-gray-500 font-black dark:text-gray-400">
        未作答
      </p>
    </template>
    <template v-else>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        预估 Band（按公开换算表估算，仅供参考）
      </p>
      <p class="mb-2 text-5xl text-blue-600 font-black dark:text-blue-400">
        {{ band.toFixed(1) }}
      </p>
    </template>
    <p class="text-gray-600 dark:text-gray-400">
      答对 {{ correctCount }} / {{ scoredTotal }} 分
    </p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getModelEssay } from './essays'

const props = defineProps<{
  promptId: string
}>()

const essay = computed(() => getModelEssay(props.promptId))
</script>

<template>
  <details
    v-if="essay"
    class="mb-6 rounded-xl border border-amber-200 bg-white p-5 dark:border-amber-900/40 dark:bg-gray-800"
  >
    <summary class="cursor-pointer text-sm font-bold dark:text-white">
      📖 查看范文
      <span class="ml-1 font-normal text-xs text-gray-400">{{ essay.wordCount }} 词</span>
    </summary>
    <div class="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-800 dark:text-gray-200">
{{ essay.essay }}
</div>
    <p class="mt-4 text-xs text-gray-400">
      来源：
      <a
        v-if="essay.sourceUrl"
        :href="essay.sourceUrl"
        target="_blank"
        rel="noopener"
        class="text-blue-600 hover:underline dark:text-blue-400"
      >{{ essay.sourceName || '原文链接' }}</a>
      <span v-else>{{ essay.sourceName }}</span>
      <span class="ml-2">（第三方范文，仅供学习参考）</span>
    </p>
  </details>
</template>

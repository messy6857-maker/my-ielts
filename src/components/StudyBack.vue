<script setup lang="ts">
// 返回上一级：背单词里每个页面左上角都有，去哪一级写死，不依赖浏览器历史。
defineProps<{ to: string, label: string }>()
</script>

<template>
  <RouterLink
    :to="to"
    data-back
    class="inline-block shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
  >
    ← 返回{{ label }}
  </RouterLink>
</template>

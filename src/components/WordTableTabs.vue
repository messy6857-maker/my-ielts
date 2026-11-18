<script setup lang="ts">
// 背单词 → 查单词表：网站里所有单词表在这里切换（只看不练；练在学新词、复习、练拼写里）
const TABS = [
  { label: '词汇表', to: '/vocabulary' },
  { label: '阅读考点词', to: '/reading' },
  { label: '听力 179 考点词', to: '/listening/keyword' },
  { label: '听力语料库', to: '/listening/corpus' },
]
const route = useRoute()
const current = computed(() => route?.path ?? '')
</script>

<template>
  <div class="mb-4" data-word-tables>
    <div class="mb-3">
      <StudyBack to="/study" label="背单词" />
    </div>
    <div class="flex flex-wrap gap-2">
      <RouterLink
        v-for="t in TABS"
        :key="t.to"
        :to="t.to"
        class="border rounded-lg px-4 py-2 text-sm font-medium"
        :class="current === t.to ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
      >
        {{ t.label }}
      </RouterLink>
    </div>
  </div>
</template>

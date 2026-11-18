<script setup lang="ts">
// 听力下面两种页面：精听练习（雅思考试里）和听力单词表（背单词 → 查单词表里）
const route = useRoute()
const isWordTable = computed(() => ['/listening/keyword', '/listening/corpus'].includes(route.path))
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <WordTableTabs v-if="isWordTable" />
      <div v-else class="mb-4">
        <StudyBack to="/ielts" label="雅思考试" />
      </div>
      <router-view />
    </div>
  </div>
</template>

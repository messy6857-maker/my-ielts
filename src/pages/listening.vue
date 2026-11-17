<script setup lang="ts">
import ListeningTabs from '../components/ListeningTabs.vue'
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <div class="mb-4">
        <StudyBack to="/ielts" label="雅思考试" />
      </div>
      <ListeningTabs />
      <router-view />
    </div>
  </div>
</template>

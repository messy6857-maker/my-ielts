<script setup>
import { initSingleAudio } from './composables/useSingleAudio'

// 全站单音频：同一时间只播放一个音频，点新的自动暂停旧的
initSingleAudio()
</script>

<template>
  <TheHeader />
  <!-- <div class="flex flex-1 overflow-hidden bg-gray-50 pt-16 dark:bg-gray-900">
    <div
      class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white"
    />
  </div> -->
  <div class="flex flex-1 overflow-hidden bg-gray-50 py-16 leading-8 dark:bg-gray-900">
    <div class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white">
      <RouterView />
    </div>
  </div>

  <TheFooter />
</template>

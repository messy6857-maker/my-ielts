<script setup>
import { initSingleAudio } from './composables/useSingleAudio'

const { currentUser, logoutNotice } = useAuth()
const accountKey = computed(() => currentUser.value ? `user:${currentUser.value}` : 'guest')

// 全站单音频：同一时间只播放一个音频，点新的自动暂停旧的
initSingleAudio()
</script>

<template>
  <TheHeader />
  <p v-if="logoutNotice" role="status" class="fixed top-16 z-50 bg-amber-50 px-4 py-2 text-sm text-amber-900">
{{ logoutNotice }}
</p>
  <!-- <div class="flex flex-1 overflow-hidden bg-gray-50 pt-16 dark:bg-gray-900">
    <div
      class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white"
    />
  </div> -->
  <div class="flex flex-1 overflow-hidden bg-gray-50 py-16 leading-8 dark:bg-gray-900">
    <div class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white">
      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="`${accountKey}:${route.path}`" />
      </RouterView>
    </div>
  </div>

  <TheFooter />
</template>

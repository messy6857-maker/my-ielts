<script setup>
import { accountNotice, storageFailures, useAuth } from './composables/useAuth'
import { initSingleAudio, stopAllAudio } from './composables/useSingleAudio'

// 全站单音频：同一时间只播放一个音频，点新的自动暂停旧的
initSingleAudio()
const { currentUser, loggingOut } = useAuth()
const router = useRouter()
router.afterEach((_to, _from, failure) => {
  if (!failure)
    stopAllAudio()
})
watch(currentUser, (user, previous) => {
  if (previous && user !== previous)
    router.replace('/')
})
</script>

<template>
  <TheHeader />
  <div
    v-if="accountNotice"
    role="alert"
    class="mx-4 mt-16 border border-amber-300 rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
  >
    {{ accountNotice }}
    <button class="ml-2 underline" @click="accountNotice = ''">
      知道了
    </button>
  </div>
  <div
    v-if="storageFailures.length"
    role="alert"
    class="fixed left-0 right-0 top-16 z-50 border border-red-300 bg-red-50 p-3 text-sm text-red-800"
  >
    有学习记录未能写入本机。请先
    <RouterLink to="/settings" class="underline">
      导出备份并清理空间
    </RouterLink>，不要关闭页面。
  </div>
  <div
    v-if="loggingOut"
    role="status"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 text-white"
  >
    正在保存记录并退出…
  </div>
  <!-- <div class="flex flex-1 overflow-hidden bg-gray-50 pt-16 dark:bg-gray-900">
    <div
      class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white"
    />
  </div> -->
  <div
    class="flex flex-1 overflow-hidden bg-gray-50 py-16 leading-8 dark:bg-gray-900"
  >
    <div
      class="relative mx-auto h-full w-full max-w-screen-2xl overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white"
    >
      <div :inert="loggingOut ? true : undefined">
        <RouterView />
      </div>
    </div>
  </div>

  <TheFooter />
</template>

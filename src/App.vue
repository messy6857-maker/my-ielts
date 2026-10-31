<script setup>
import {
  accountNotices,
  dismissAccountNotice,
  hasPendingGuestMigration,
  storageFailures,
  useAuth,
} from './composables/useAuth'
import { onSyncApplied } from './composables/syncClient'
import { initSingleAudio, stopAllAudio } from './composables/useSingleAudio'

// 全站单音频：同一时间只播放一个音频，点新的自动暂停旧的
initSingleAudio()
const { currentUser, loggingOut } = useAuth()
const router = useRouter()
const guestPending = ref(false)
const guestNoticeClosed = ref(false)
function refreshGuestPending() {
  guestPending.value
    = !!currentUser.value && hasPendingGuestMigration(currentUser.value)
}
watch(
  currentUser,
  () => {
    guestNoticeClosed.value = false
    refreshGuestPending()
  },
  { immediate: true },
)
const offGuestPending = onSyncApplied(refreshGuestPending)
onUnmounted(offGuestPending)
async function continueGuest() {
  const result = await useAuth().logout()
  if (!result.cancelled)
    router.replace('/')
}
router.afterEach((_to, _from, failure) => {
  if (!failure)
    stopAllAudio()
})
watch(currentUser, (user, previous) => {
  if (
    previous
    && user !== previous
    && !router.currentRoute.value.path.startsWith('/mock/')
  )
    router.replace('/')
})
// 存储失败横幅：会话内可关闭；失败列表变化（新 key 失败或旧失败清除后重现）时自动重现。
const storageBannerClosed = ref(false)
watch(storageFailures, () => {
  storageBannerClosed.value = false
})
</script>

<template>
  <TheHeader />
  <div aria-hidden="true" class="h-16" />
  <aside
    class="fixed right-2 top-16 z-40 max-h-[45vh] max-w-lg overflow-y-auto"
    aria-label="账号与保存通知"
  >
    <p
      v-if="guestPending && !guestNoticeClosed"
      role="status"
      class="mx-4 mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900"
    >
      首次云端拉取尚未完成，游客进度仍在本机保留。联网后会补合并；也可<button
        class="underline"
        @click="continueGuest"
      >
        继续以游客身份学习
      </button>。<button class="ml-2 underline" @click="guestNoticeClosed = true">
        暂时关闭
      </button>
    </p>
    <div
      v-for="notice in accountNotices"
      :key="notice.id"
      role="alert"
      class="mx-4 mt-2 border border-amber-300 rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
    >
      {{ notice.message }}
      <button class="ml-2 underline" @click="dismissAccountNotice(notice.id)">
        知道了
      </button>
    </div>
    <div
      v-if="storageFailures.length && !storageBannerClosed"
      role="alert"
      class="mx-4 mt-2 border border-red-300 bg-red-50 p-3 text-sm text-red-800"
    >
      有学习记录未能写入本机。请先
      <RouterLink to="/settings" class="underline">
        导出备份并清理空间
      </RouterLink>，不要关闭页面。
      <button class="ml-2 underline" @click="storageBannerClosed = true">
        知道了
      </button>
    </div>
  </aside>
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
    class="flex flex-1 overflow-hidden bg-gray-50 pb-16 leading-8 dark:bg-gray-900"
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

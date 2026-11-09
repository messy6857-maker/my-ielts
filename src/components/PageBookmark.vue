<script setup lang="ts">
import {
  addPageBookmark,
  getPageBookmarks,
  jumpToPageBookmark,
  removePageBookmark,
} from '../composables/usePageBookmark'

// inline：嵌进每日阅读页的阅读索引里（直接当它的 flex 孩子，贴着阅读 1/2/3，
// 有几个 pill 就自适应顶上去）；不 inline 时是全站右下角的固定按钮。
const props = withDefaults(defineProps<{ inline?: boolean }>(), { inline: false })
const route = useRoute()
const path = computed(() => route.path)
// 模考页不显示：考试页右下角已有“原文”按钮，且考试时不需要书签
const hidden = computed(() => path.value.startsWith('/mock'))
// 固定版在每日阅读页不显示（那页由 daily.vue 内嵌一份，免得出现两个）
const visible = computed(() => {
  if (hidden.value)
    return false
  if (props.inline)
    return true
  return path.value !== '/reading/daily'
})
// 按位置从上到下排，书签 1 在最上面
const bookmarks = computed(() => getPageBookmarks(path.value))

/** 该书签在页面里的进度（方便区分几个书签都在哪） */
function bookmarkPercent(y: number): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0)
    return 0
  return Math.min(100, Math.max(0, Math.round((y / max) * 100)))
}
function onAdd() {
  addPageBookmark(path.value, window.scrollY)
}
function onJump(id: string) {
  jumpToPageBookmark(path.value, id)
}
function onRemove(id: string) {
  removePageBookmark(path.value, id)
}
</script>

<template>
  <div
    v-if="visible"
    :class="props.inline
      ? 'flex flex-col items-end gap-2'
      : 'fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2'"
  >
    <div
      v-for="(bm, i) in bookmarks"
      :key="bm.id"
      class="relative"
    >
      <button
        type="button"
        class="border border-gray-200 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-medium text-gray-600 shadow-md backdrop-blur transition-colors dark:border-gray-600 hover:border-blue-400 dark:bg-gray-800/90 hover:bg-blue-50 dark:text-gray-300 hover:text-blue-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
        :title="`回到书签 ${i + 1}（页面 ${bookmarkPercent(bm.y)}% 处）`"
        :aria-label="`回到书签 ${i + 1}`"
        @click="onJump(bm.id)"
      >
        🔖 书签 {{ i + 1 }} · {{ bookmarkPercent(bm.y) }}%
      </button>
      <button
        type="button"
        class="absolute h-5 w-5 flex items-center justify-center rounded-full bg-gray-500 text-xs leading-none text-white shadow -right-2 -top-2 hover:bg-red-500"
        title="删除这个书签"
        :aria-label="`删除书签 ${i + 1}`"
        @click="onRemove(bm.id)"
      >
        ×
      </button>
    </div>
    <button
      type="button"
      class="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-blue-700"
      title="在当前位置增加一个书签"
      aria-label="增加书签"
      @click="onAdd"
    >
      ＋ 书签
    </button>
  </div>
</template>

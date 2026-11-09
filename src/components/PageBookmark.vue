<script setup lang="ts">
import {
  getPageBookmark,
  jumpToPageBookmark,
  removePageBookmark,
  savePageBookmark,
} from '../composables/usePageBookmark'

const route = useRoute()
const path = computed(() => route.path)
// 模考页不显示：考试页右下角已有“原文”按钮，且考试时不需要书签
const hidden = computed(() => path.value.startsWith('/mock'))
// 每日阅读页右下角有阅读索引，书签按钮往上挪，免得盖住它
const positionClass = computed(() =>
  path.value === '/reading/daily' ? 'bottom-40 right-6' : 'bottom-6 right-6',
)
const savedY = computed(() => getPageBookmark(path.value))
const hasBookmark = computed(() => savedY.value !== null)

function onFabClick() {
  if (hasBookmark.value)
    jumpToPageBookmark(path.value)
  else
    savePageBookmark(path.value, window.scrollY)
}
function onRemove(event: Event) {
  event.stopPropagation()
  removePageBookmark(path.value)
}
</script>

<template>
  <div
    v-if="!hidden"
    class="fixed z-40"
    :class="positionClass"
  >
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-colors"
        :class="hasBookmark
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-gray-200 bg-white/90 text-gray-700 backdrop-blur hover:border-blue-400 hover:text-blue-700 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:text-blue-300'"
        :title="hasBookmark ? '点一下，回到记录的位置' : '点一下，记录当前位置为书签'"
        :aria-label="hasBookmark ? '回到书签位置' : '记录当前位置为书签'"
        @click="onFabClick"
      >
        <span aria-hidden="true">🔖</span>
        {{ hasBookmark ? '回到书签' : '书签' }}
      </button>
      <button
        v-if="hasBookmark"
        type="button"
        class="absolute h-5 w-5 flex items-center justify-center rounded-full bg-gray-500 text-xs leading-none text-white shadow -right-2 -top-2 hover:bg-red-500"
        title="删除这个书签"
        aria-label="删除书签"
        @click="onRemove"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import ImageViewer from '../../components/ImageViewer.vue'
import { isDark } from '../../composables/dark'
import { downloadMediaFile, resolveMediaUrl } from '../../composables/useAudio'

const assetBase = import.meta.env.BASE_URL
const mapUrl = computed(() => `${assetBase}grammar/map-${isDark.value ? 'dark' : 'light'}.svg`)
// 放大查看用深色版：查看器是黑底，浅色版的深色文字在黑底上看不见
const viewerUrl = `${assetBase}grammar/map-dark.svg`
const viewerOpen = ref(false)
const handoutPath = 'grammar/雅思基础语法配套课程讲义.pdf'
const handoutName = '雅思基础语法配套课程讲义.pdf'
const handoutUrl = resolveMediaUrl(handoutPath)

async function onHandoutClick(event: MouseEvent) {
  // Keep Ctrl/Cmd/middle-click as normal navigation.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    return
  event.preventDefault()
  await downloadMediaFile(handoutPath, handoutName)
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <h3 class="mb-4 text-xl font-semibold dark:text-white">
        概述
      </h3>
      <div class="mb-4">
        我尝试过很多语法教程最终都没有学下去，只有这个版本取出了最需要的部分；学完这个就会分析长难句了！
      </div>
      <h3 class="mb-4 text-xl font-semibold dark:text-white">
        讲义
      </h3>
      <div class="mb-4">
        视频配套讲义：
        <a
          class="truncate text-sm font-normal text-primary-700 dark:text-primary-500 hover:underline"
          :href="handoutUrl"
          :download="handoutName"
          @click="onHandoutClick"
        >{{ handoutName }}</a>
      </div>

      <h3 class="mb-4 text-xl font-semibold dark:text-white">
        思维导图
      </h3>
      <div class="mb-4">
        <p>
          听完课跟着老师画的，使用的百度脑图。图比较大，点击图片可以放大查看，或
          <a
            class="text-primary-700 dark:text-primary-500 hover:underline"
            :href="mapUrl"
            target="_blank"
            rel="noopener"
          >在新标签页打开</a>。
        </p>
        <button
          type="button"
          class="block w-full cursor-zoom-in"
          aria-label="放大查看雅思基础语法思维导图"
          @click="viewerOpen = true"
        >
          <img
            :src="mapUrl"
            alt="雅思基础语法思维导图"
            class="w-full"
            loading="lazy"
          >
        </button>
        <ImageViewer
          v-if="viewerOpen"
          :src="viewerUrl"
          alt="雅思基础语法思维导图（放大）"
          @close="viewerOpen = false"
        />
      </div>
    </div>
  </div>
</template>

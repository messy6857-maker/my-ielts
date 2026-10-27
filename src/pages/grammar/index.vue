<script setup>
import { isDark } from '../../composables/dark'
import { resolveMediaUrl } from '../../composables/useAudio'

const assetBase = import.meta.env.BASE_URL
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
          :href="resolveMediaUrl('grammar/雅思基础语法配套课程讲义.pdf')"
          download="雅思基础语法配套课程讲义.pdf"
        >雅思基础语法配套课程讲义.pdf</a>
      </div>

      <h3 class="mb-4 text-xl font-semibold dark:text-white">
        思维导图
      </h3>
      <div class="mb-4">
        <p>听完课跟着老师画的，使用的百度脑图</p>
        <img
          :src="`${assetBase}grammar/map-${isDark ? 'dark' : 'light'}.svg`"
          alt="雅思基础语法思维导图"
          class="w-full"
          loading="lazy"
        >
      </div>
    </div>
  </div>
</template>

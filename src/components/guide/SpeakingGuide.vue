<script setup lang="ts">
import { CRITERIA } from '../../utils/speakingCriteria'

// 雅思口语：三个部分各考什么、怎么答，四项评分标准
const PARTS = [
  {
    title: 'Part 1 日常问答（4–5 分钟）',
    points: ['考官问家乡、工作学习、爱好等熟悉话题', '每题答 2–3 句：直接回答 + 原因或例子，不要只说 yes / no', '不用背模板，自然最重要'],
  },
  {
    title: 'Part 2 个人陈述（1 分钟准备 + 最多 2 分钟）',
    points: ['拿到题卡后用 1 分钟写关键词，按卡片上的提示点组织', '尽量讲满 2 分钟，用一个具体的经历或故事串起来', '讲完考官可能追问一两句'],
  },
  {
    title: 'Part 3 深入讨论（4–5 分钟）',
    points: ['围绕 Part 2 话题问更抽象的问题', '先给观点，再讲原因、举例，可以对比不同人群或过去和现在', '听不清可以请考官重复，这不扣分'],
  },
]
</script>

<template>
  <div class="text-gray-600 dark:text-gray-300" data-guide="speaking">
    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      口语概述
    </h3>
    <p class="mb-4">
      一对一面试，共 11–14 分钟，分三个部分，全程录音。
    </p>
    <div class="mb-6 space-y-4">
      <div v-for="p in PARTS" :key="p.title">
        <div class="mb-1 text-gray-900 font-bold dark:text-white">
          {{ p.title }}
        </div>
        <ul class="ml-6 list-disc space-y-1">
          <li v-for="pt in p.points" :key="pt">
            {{ pt }}
          </li>
        </ul>
      </div>
    </div>

    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      四项评分标准
    </h3>
    <div class="grid gap-4 md:grid-cols-2">
      <div v-for="c in CRITERIA" :key="c.key" class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
        <div class="mb-1 text-sm text-gray-900 font-bold dark:text-white">
          {{ c.label }}
        </div>
        <p class="mb-2 text-sm">
          {{ c.tips }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          7 分：{{ c.anchors[7] }}
        </p>
      </div>
    </div>
  </div>
</template>

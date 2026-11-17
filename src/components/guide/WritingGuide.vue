<script setup lang="ts">
import { TASK2_GUIDE } from '../../utils/writingGuide'

// 雅思写作（学术类）：考试结构、小作文和大作文的写法，大作文四项评分标准
const TASK1 = [
  '第 1 段改写题目：说明图表展示了什么，不要照抄题干',
  '概述段（Overview）必须有：用一两句话点出最主要的趋势或对比，没有概述很难过 6 分',
  '主体 2 段：分组描述数据，挑最高、最低、变化最大的写，不要每个数字平均用力',
  '只描述数据，不写原因和个人观点',
  '描述趋势的词要多样：rise / surge / decline / remain stable / fluctuate',
]
</script>

<template>
  <div class="text-gray-600 dark:text-gray-300" data-guide="writing">
    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      写作概述
    </h3>
    <ul class="mb-6 ml-6 list-disc space-y-1">
      <li>时限 60 分钟，两篇作文</li>
      <li>小作文 Task 1：描述图表、流程或地图，至少 150 词，建议 20 分钟</li>
      <li>大作文 Task 2：针对一个观点或问题写议论文，至少 250 词，建议 40 分钟</li>
      <li>大作文在总分里占的比重是小作文的两倍，先写大作文也可以</li>
      <li>字数不够会扣分；两篇都按四项标准评分</li>
    </ul>

    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      小作文怎么写
    </h3>
    <ul class="mb-6 ml-6 list-disc space-y-1">
      <li v-for="t in TASK1" :key="t">
        {{ t }}
      </li>
    </ul>

    <h3 class="mb-3 text-xl text-gray-900 font-semibold dark:text-white">
      大作文四项评分标准
    </h3>
    <div class="grid gap-4 md:grid-cols-2">
      <div v-for="g in TASK2_GUIDE" :key="g.title" class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
        <div class="mb-2 text-sm text-gray-900 font-bold dark:text-white">
          {{ g.title }}
        </div>
        <ul class="text-sm space-y-1">
          <li v-for="(pt, i) in g.points" :key="i" class="flex gap-1.5">
            <span class="text-blue-500">•</span><span>{{ pt }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

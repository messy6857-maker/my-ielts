<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useMistakes, useProgress } from '../composables/useStudyData'
import { useWordSchedule } from '../composables/useSpacedRepetition'
import {
  formatDuration,
  useStudyTimer,
} from '../composables/useStudyTimer'
import { buildTodayTasks } from '../utils/todayTasks'
import { MISTAKE_MODULE_LABEL } from '../composables/useStudyData'

defineOptions({
  name: 'IndexPage',
})

const { modules, hasAnyProgress } = useProgress()
const { mistakes, totalCount: mistakeCount } = useMistakes()
const { currentUser } = useAuth()
const { schedules } = useWordSchedule()
const timer = useStudyTimer()

const tasksTick = ref(0)
function refreshTasks() {
  tasksTick.value++
  timer.refresh()
}

const today = computed(() => {
  void tasksTick.value
  return buildTodayTasks({
    schedules: schedules.value,
    mistakes: mistakes.value,
    owner: currentUser.value,
    studySeconds: timer.dailySeconds.value,
  })
})

watch(currentUser, refreshTasks)
onMounted(refreshTasks)

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

const menus = reactive([
  {
    label: '词汇',
    icon: 'i-carbon-chart-histogram',
    link: '/vocabulary',
    desc: '包含雅思词汇真经内容，按场景分组',
  },
  {
    label: '语法',
    icon: 'i-carbon-load-balancer-vpc',
    link: '/grammar',
    desc: '新东方雅思语法课程，针对雅思考试设计，思维导图',
  },
  {
    label: '听力',
    icon: 'i-carbon-headphones',
    link: '/listening',
    desc: '听力基本概念，179 考点词同义替换和雅思王语料库',
  },
  {
    label: '口语',
    icon: 'i-carbon-microphone',
    link: '/speaking',
    desc: 'Part 1/2/3 真题题库，计时 + 录音自测',
  },
  {
    label: '阅读',
    icon: 'i-carbon-white-paper',
    link: '/reading',
    desc: '376 考点词同义替换',
  },
  {
    label: '写作',
    icon: 'i-carbon-edit',
    link: '/writing',
    desc: '100 句翻译练习、大小作文',
  },
  {
    label: '单词练习',
    icon: 'i-carbon-keyboard',
    link: '/vocabulary/typing',
    desc: '背景单词跟打练习，提升打字速度与单词读写熟悉度',
  },
  {
    label: '学习统计',
    icon: 'i-carbon-dashboard',
    link: '/stats',
    desc: '各模块进度、自测正确率、词汇掌握、模考成绩与打卡',
  },
])
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <section
      class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <div class="mx-auto max-w-screen-xl px-4 py-8 lg:px-6 sm:py-16">
        <h1
          class="mb-16 text-center text-4xl text-gray-900 sm:text-6xl dark:text-white"
        >
          坚持练习，稳步提升 <span class="font-bold text-#f00">IELTS</span>
        </h1>
        <div class="mb-8 max-w-screen-md lg:mb-16">
          <h2
            class="mb-4 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white"
          >
            我的 IELTS 备考中心
          </h2>
          <p class="text-gray-500 sm:text-xl dark:text-gray-400">
            这里包含备考需要的一切，从词汇、语法开始...
          </p>
        </div>

        <!-- 今日任务 -->
        <div
          class="mb-12 border border-blue-200 rounded-xl bg-blue-50/60 p-5 dark:border-blue-900/40 dark:bg-blue-950/20 sm:p-6"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">
              今日任务
              <span class="ml-2 align-middle text-sm font-normal text-gray-400">
                {{ currentUser ? `账号：${currentUser}` : '游客模式' }}
              </span>
            </h3>
            <button
              class="text-xs text-blue-600 hover:underline dark:text-blue-400"
              @click="refreshTasks"
            >
              刷新
            </button>
          </div>

          <div
            class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <RouterLink
              to="/vocabulary/flashcard"
              class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40"
            >
              <p class="text-xs text-gray-500 dark:text-gray-400">
                今日到期复习
              </p>
              <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{ today.dueWordCount }}
              </p>
              <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                进入自测 →
              </p>
            </RouterLink>
            <div class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                今日学习时长
              </p>
              <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatDuration(today.studySeconds) }}
              </p>
              <p class="mt-1 text-xs text-gray-500">
                含自测 / 精听 / 听写 / 模考
              </p>
            </div>
            <RouterLink
              to="/mistakes"
              class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40"
            >
              <p class="text-xs text-gray-500 dark:text-gray-400">
                错题本
              </p>
              <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{ mistakeCount }}
              </p>
              <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                去复习 →
              </p>
            </RouterLink>
            <div class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                待继续
              </p>
              <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{ today.unfinishedMocks.length + today.writingDrafts.length }}
              </p>
              <p class="mt-1 text-xs text-gray-500">
                模考草稿 + 写作草稿
              </p>
            </div>
          </div>

          <div
            v-if="today.isEmpty"
            class="rounded-lg border border-dashed border-gray-300 bg-white/50 p-4 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-400"
          >
            今天还没有复习任务或进行中的练习。可以从下方入口开始：词汇自测、听力/阅读模考，或精听听写。
          </div>
          <div v-else class="space-y-3 text-sm">
            <div v-if="today.recentMistakes.length">
              <p class="mb-1 font-medium text-gray-800 dark:text-gray-200">
                最近错题
              </p>
              <ul class="space-y-1">
                <li
                  v-for="m in today.recentMistakes"
                  :key="m.key"
                  class="flex flex-wrap items-baseline gap-2 text-gray-600 dark:text-gray-300"
                >
                  <span class="rounded bg-gray-100 px-1.5 text-xs dark:bg-gray-700">{{
                    MISTAKE_MODULE_LABEL[m.module] || m.module
                  }}</span>
                  <span class="truncate">{{ m.title }}</span>
                </li>
              </ul>
            </div>
            <div v-if="today.unfinishedMocks.length">
              <p class="mb-1 font-medium text-gray-800 dark:text-gray-200">
                未完成模考
              </p>
              <div class="flex flex-wrap gap-2">
                <RouterLink
                  v-for="m in today.unfinishedMocks"
                  :key="`${m.kind}:${m.testId}`"
                  :to="m.path"
                  class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  继续 {{ m.label }}（{{ m.kind === 'listening' ? '听力' : '阅读' }}）
                </RouterLink>
              </div>
            </div>
            <div v-if="today.writingDrafts.length">
              <p class="mb-1 font-medium text-gray-800 dark:text-gray-200">
                写作草稿
              </p>
              <div class="flex flex-wrap gap-2">
                <RouterLink
                  v-for="d in today.writingDrafts"
                  :key="`${d.task}:${d.promptId}:${d.versionId || ''}`"
                  :to="d.path"
                  class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800"
                >
                  继续 {{ d.task === 'task1' ? '小作文' : '大作文' }} · {{ d.promptId }}
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <!-- 学习进度 -->
        <div
          v-if="hasAnyProgress || mistakeCount > 0"
          class="mb-12 border border-gray-200 rounded-xl bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">
              学习进度
              <span class="ml-2 align-middle text-sm font-normal text-gray-400">
                {{ currentUser ? `当前账号：${currentUser}` : "游客模式" }}
              </span>
            </h3>
            <RouterLink
              v-if="mistakeCount > 0"
              to="/mistakes"
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              错词本（{{ mistakeCount }}）→
            </RouterLink>
          </div>
          <div class="grid gap-4 lg:grid-cols-3 md:grid-cols-2">
            <div v-for="m in modules" :key="m.module">
              <div class="mb-1 flex items-center justify-between text-sm">
                <span class="font-medium text-gray-700 dark:text-gray-300">{{
                  m.label
                }}</span>
                <span class="text-gray-500 dark:text-gray-400">{{ m.done }} / {{ m.total }}</span>
              </div>
              <div
                class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700"
              >
                <div
                  class="h-2.5 rounded-full bg-blue-600 transition-all"
                  :style="{ width: `${percent(m.done, m.total)}%` }"
                />
              </div>
            </div>
          </div>
        </div>
        <div
          class="md:grid lg:grid-cols-3 md:grid-cols-2 md:gap-12 space-y-8 md:space-y-0"
        >
          <RouterLink
            v-for="m in menus"
            :key="m.label"
            :to="m.link"
            class="block"
          >
            <div
              class="mb-4 h-10 w-10 flex items-center justify-center rounded-full bg-primary-100 lg:h-12 lg:w-12 dark:bg-primary-900"
            >
              <i
                class="block h-5 w-5 text-primary-600 lg:h-6 lg:w-6 dark:text-primary-300"
                :class="m.icon"
              />
            </div>
            <h3 class="mb-2 text-xl font-bold dark:text-white">
              {{ m.label }}
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
              {{ m.desc }}
            </p>
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

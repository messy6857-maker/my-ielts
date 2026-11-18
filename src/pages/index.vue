<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useDeckStore } from '../composables/useDeckStore'
import { useWordSchedule } from '../composables/useSpacedRepetition'
import {
  formatDate,
  MISTAKE_MODULE_LABEL,
  useMistakes,
} from '../composables/useStudyData'
import {
  formatDuration,
  useStudyTimer,
} from '../composables/useStudyTimer'
import { buildTodayTasks } from '../utils/todayTasks'

defineOptions({
  name: 'IndexPage',
})

const { mistakes, totalCount: mistakeCount } = useMistakes()
const { currentUser } = useAuth()
const { schedules } = useWordSchedule()
// 到期复习按全部词库算（词汇表、阅读考点词、听力 179、语料库，各自的键互不重叠）
const deckSchedules = [
  'reading538',
  'listening179',
  'corpus',
  'custom',
].map(ns => useDeckStore(ns).schedules)
const allSchedules = computed(() => Object.assign({}, schedules.value, ...deckSchedules.map(d => d.value)))
const timer = useStudyTimer()

const tasksTick = ref(0)
function refreshTasks() {
  tasksTick.value++
  timer.refresh()
}

const today = computed(() => {
  const revision = tasksTick.value
  return buildTodayTasks({
    schedules: allSchedules.value,
    mistakes: mistakes.value,
    owner: currentUser.value,
    studySeconds: timer.dailySeconds.value,
    now: Date.now() + revision * 0,
  })
})

watch(currentUser, refreshTasks)

// A-15: a home page left open across midnight must roll to the new day.
// Poll once a minute for a date change; on rollover re-run the same refresh
// used at mount / account switch (tasks + timer daily seconds).
const dayStamp = ref(new Date().toDateString())
let midnightTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshTasks()
  midnightTimer = setInterval(() => {
    const stamp = new Date().toDateString()
    if (stamp !== dayStamp.value) {
      dayStamp.value = stamp
      refreshTasks()
    }
  }, 60_000)
})
onUnmounted(() => {
  if (midnightTimer !== undefined)
    clearInterval(midnightTimer)
})

// 首页入口：背单词、每日阅读、雅思考试、学习统计（错词本在今日任务里）
const menus = [
  {
    label: '背单词',
    icon: 'i-carbon-book',
    link: '/study',
    desc: '学新词、复习到期的词、练拼写、单词地牢，单词表也在这里',
  },
  {
    label: '每日阅读',
    icon: 'i-carbon-calendar',
    link: '/reading/daily',
    desc: '每天更新：用你昨天学过的单词写的文章，加上热点新闻阅读',
  },
  {
    label: '雅思考试',
    icon: 'i-carbon-education',
    link: '/ielts',
    desc: '听说读写和语法练习、做题方法、限时模考和记录',
  },
  {
    label: '学习统计',
    icon: 'i-carbon-dashboard',
    link: '/stats',
    desc: '各模块进度、自测正确率、词汇掌握、模考成绩与打卡',
  },
]
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <section class="mx-auto max-w-screen-xl">
      <!-- 入口：和顶部导航一样的三件事，加上学习统计。错词本在下面的今日任务里 -->
      <div class="grid mb-6 gap-3 lg:grid-cols-4 sm:grid-cols-2">
        <RouterLink
          v-for="m in menus"
          :key="m.link"
          :data-home-entry="m.link"
          :to="m.link"
          class="block border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div class="flex items-center gap-2 text-lg text-gray-900 font-bold dark:text-white">
            <i class="block h-5 w-5 text-primary-600 dark:text-primary-300" :class="m.icon" />
            {{ m.label }} →
          </div>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ m.desc }}
          </p>
        </RouterLink>
      </div>

      <!-- 今日任务 -->
      <div
        class="border border-blue-200 rounded-xl bg-blue-50/60 p-5 dark:border-blue-900/40 dark:bg-blue-950/20 sm:p-6"
      >
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            今日任务
            <span class="ml-2 align-middle text-sm text-gray-400 font-normal">
              {{ currentUser ? `账号：${currentUser}` : '游客模式' }}
            </span>
          </h3>
          <button
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            @click="refreshTasks"
          >
            刷新
          </button>
        </div>

        <div
          class="grid mb-4 gap-3 lg:grid-cols-4 sm:grid-cols-2"
        >
          <RouterLink
            to="/study"
            class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40"
          >
            <p class="text-xs text-gray-500 dark:text-gray-400">
              今日到期复习
            </p>
            <p class="mt-1 text-2xl text-gray-900 font-bold dark:text-white">
              {{ today.dueWordCount }}
            </p>
            <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
              去复习 →
            </p>
          </RouterLink>
          <div class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              今日学习时长
            </p>
            <p class="mt-1 text-2xl text-gray-900 font-bold dark:text-white">
              {{ formatDuration(today.studySeconds) }}
            </p>
            <p class="mt-1 text-xs text-gray-500">
              含自测 / 精听 / 听写 / 模考
            </p>
          </div>
          <RouterLink
            to="/mistakes"
            data-today-mistakes
            class="rounded-lg bg-white/80 p-3 dark:bg-gray-900/40"
          >
            <p class="text-xs text-gray-500 dark:text-gray-400">
              错词本
            </p>
            <p class="mt-1 text-2xl text-gray-900 font-bold dark:text-white">
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
            <p class="mt-1 text-2xl text-gray-900 font-bold dark:text-white">
              {{ today.unfinishedMocks.length + today.writingDrafts.length }}
            </p>
            <p class="mt-1 text-xs text-gray-500">
              模考草稿 + 写作草稿
            </p>
          </div>
        </div>

        <div
          v-if="today.isEmpty"
          class="border border-gray-300 rounded-lg border-dashed bg-white/50 p-4 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-400"
        >
          今天还没有复习任务或进行中的练习。可以从上面的入口开始。
        </div>
        <div v-else class="text-sm space-y-3">
          <div v-if="today.recentMistakes.length">
            <p class="mb-1 text-gray-800 font-medium dark:text-gray-200">
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
            <p class="mb-1 text-gray-800 font-medium dark:text-gray-200">
              未完成模考
            </p>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="m in today.unfinishedMocks"
                :key="`${m.kind}:${m.testId}`"
                :to="m.path"
                class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white font-medium hover:bg-blue-700"
              >
                继续 {{ m.label }}（{{ m.kind === 'listening' ? '听力' : '阅读' }}）
                <span v-if="m.updatedAt"> · {{ formatDate(m.updatedAt) }}</span>
              </RouterLink>
            </div>
          </div>
          <div v-if="today.writingDrafts.length">
            <p class="mb-1 text-gray-800 font-medium dark:text-gray-200">
              写作草稿
            </p>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="d in today.writingDrafts"
                :key="`${d.task}:${d.promptId}:${d.versionId || ''}`"
                :to="d.path"
                class="border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800"
              >
                继续 {{ d.task === 'task1' ? '小作文' : '大作文' }} · {{ d.promptId }}
                <span v-if="d.editedAt ?? d.updatedAt ?? d.stateAt">
                  · {{ formatDate(d.editedAt ?? d.updatedAt ?? d.stateAt ?? 0) }}
                </span>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useDeckStore } from '../../composables/useDeckStore'
import { useDailyGoal, useWordSchedule } from '../../composables/useSpacedRepetition'
import { countDueSchedules } from '../../utils/todayTasks'

// 背单词：一件事一个入口。词库、章节、每日目标这些都进去以后再选。
defineOptions({ name: 'StudyPage' })

const vocabularySchedules = useWordSchedule()
const vocabularyDaily = useDailyGoal()
const others = ([
  'reading538',
  'listening179',
  'corpus',
  'custom',
] as const).map(ns => useDeckStore(ns))

// 到期按“现在”算：停留在页面上时每分钟刷新一次
const now = ref(Date.now())
const ticker = setInterval(() => {
  now.value = Date.now()
}, 60000)
onBeforeUnmount(() => clearInterval(ticker))

const vocabularyDue = computed(() => countDueSchedules(vocabularySchedules.schedules.value, now.value))
const totalDue = computed(() => others.reduce(
  (n, store) => n + countDueSchedules(store.schedules.value, now.value),
  vocabularyDue.value,
))
const newToday = computed(() => others.reduce(
  (n, store) => n + store.dailyCount.value,
  vocabularyDaily.dailyCount.value,
))

const entries = computed(() => [
  {
    id: 'learn',
    icon: '📖',
    title: '学新词',
    desc: '卡片自测：先凭感觉自评，再看词条。词库、章节、每天学几个，进去再选。',
    badge: newToday.value > 0
      ? `今天已学 ${newToday.value} 个新词`
      : '',
    to: '/study/learn',
  },
  {
    id: 'review',
    icon: '🔁',
    title: '复习到期的词',
    desc: '所有词库到期的词放在一起复习。复习哪些词库、一轮多少个，进去再选。',
    badge: totalDue.value > 0
      ? `${totalDue.value} 个到期`
      : '',
    to: '/study/review',
  },
  {
    id: 'spell',
    icon: '✏️',
    title: '练拼写',
    desc: '听写、看释义拼写、跟打。练哪个词库、用哪种练法，进去再选。',
    badge: '',
    to: '/study/spell',
  },
  {
    id: 'game',
    icon: '🐉',
    title: '单词地牢',
    desc: '把单词变成怪物一层层打下去，答对算复习，答错进错词本。',
    badge: '',
    to: '/game',
  },
])
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-2xl">
      <div class="mb-4">
        <h3 class="text-xl text-gray-900 font-bold dark:text-white">
          背单词
        </h3>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-300" data-summary>
          <template v-if="totalDue > 0">
            今天各词库一共有 <span class="text-orange-600 font-bold dark:text-orange-400">{{ totalDue }}</span> 个词到期，建议先复习。
          </template>
          <template v-else>
            今天没有到期要复习的词，可以学点新词。
          </template>
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <RouterLink
          v-for="entry in entries"
          :key="entry.id"
          :to="entry.to"
          :data-entry="entry.id"
          class="block border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-lg text-gray-900 font-bold dark:text-white">{{ entry.icon }} {{ entry.title }} →</span>
            <span v-if="entry.badge" class="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700 font-bold dark:bg-orange-900/40 dark:text-orange-300" data-badge>{{ entry.badge }}</span>
          </div>
          <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ entry.desc }}
          </div>
        </RouterLink>
      </div>

      <!-- 不是一件要做的事、但会用到的：查单词表（词汇表、考点词、语料库）、管理自己的词表 -->
      <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-more>
        <RouterLink to="/vocabulary" class="text-blue-700 underline dark:text-blue-300">
          📚 查单词表
        </RouterLink>
        <RouterLink to="/study/lists" class="text-blue-700 underline dark:text-blue-300">
          🗂️ 我的词表
        </RouterLink>
      </div>
    </div>
  </div>
</template>

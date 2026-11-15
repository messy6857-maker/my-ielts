<script setup lang="ts">
import type { WordSchedule } from '../composables/useSpacedRepetition'
import { useDeckStore } from '../composables/useDeckStore'
import { useDailyGoal, useWordSchedule } from '../composables/useSpacedRepetition'
import { countDueSchedules } from '../utils/todayTasks'

// 背单词：各词库的自测卡片、拼写练习和单词地牢的统一入口。
// 各词库的记录、每日新词目标仍各自独立，这里只汇总显示、跳到对应页面。
defineOptions({ name: 'StudyPage' })

interface Mode { label: string, desc: string, to: string }
interface Deck {
  id: string
  name: string
  desc: string
  /** 这个词库要掌握到什么程度 */
  goal: string
  schedules: () => Record<string, WordSchedule | undefined>
  dailyCount: () => number
  goal: () => number
  modes: Mode[]
}

const vocabularySchedules = useWordSchedule()
const vocabularyDaily = useDailyGoal()
const decks = ['reading538', 'listening179', 'corpus'] as const
const stores = Object.fromEntries(decks.map(ns => [
  ns,
  useDeckStore(ns),
])) as Record<(typeof decks)[number], ReturnType<typeof useDeckStore>>

const CARD_DESC = '先凭感觉自评认识 / 模糊 / 不认识，按记忆曲线安排复习'
const DECKS: Deck[] = [
  {
    id: 'vocabulary',
    name: '词汇表',
    desc: '按话题分章的雅思核心词汇',
    goal: '会认、会读、会拼写，知道用法和同义词',
    schedules: () => vocabularySchedules.schedules.value,
    dailyCount: () => vocabularyDaily.dailyCount.value,
    goal: () => vocabularyDaily.goal.value,
    modes: [
      { label: '卡片自测', desc: `按章节学新词。${CARD_DESC}`, to: '/vocabulary/flashcard' },
      { label: '到期复习', desc: '全部章节里已到期的词一起复习', to: '/vocabulary/flashcard?review=due' },
      { label: '拼写练习', desc: '在词表里听发音逐个拼写', to: '/vocabulary?practice=1' },
      { label: '跟打练习', desc: '看着单词和释义打一遍，熟悉拼写', to: '/vocabulary/typing' },
    ],
  },
  {
    id: 'reading538',
    name: '阅读考点词',
    desc: '376 个阅读考点词和同义替换',
    goal: '看到能认出意思、想到同义替换，不要求拼写',
    schedules: () => stores.reading538.schedules.value,
    dailyCount: () => stores.reading538.dailyCount.value,
    goal: () => stores.reading538.goal.value,
    modes: [
      { label: '卡片自测', desc: `${CARD_DESC}，重点记同义替换`, to: '/reading/flashcard' },
    ],
  },
  {
    id: 'listening179',
    name: '听力 179 考点词',
    desc: '听力高频考点词和同义替换',
    goal: '听到能听懂、能拼对（听力要填空），知道同义替换',
    schedules: () => stores.listening179.schedules.value,
    dailyCount: () => stores.listening179.dailyCount.value,
    goal: () => stores.listening179.goal.value,
    modes: [
      { label: '卡片自测', desc: `${CARD_DESC}，重点记同义替换`, to: '/listening/flashcard' },
      { label: '拼写和同义替换练习', desc: '逐行写出单词和它的同义替换', to: '/listening/179practice' },
    ],
  },
  {
    id: 'corpus',
    name: '听力语料库',
    desc: '拼写规范、特别名词、形容词副词等',
    goal: '记住拼写规范和特殊写法，看到能认出',
    schedules: () => stores.corpus.schedules.value,
    dailyCount: () => stores.corpus.dailyCount.value,
    goal: () => stores.corpus.goal.value,
    modes: [
      { label: '卡片自测', desc: CARD_DESC, to: '/listening/corpus-flashcard' },
    ],
  },
]

// 到期按“现在”算：停留在页面上时每分钟刷新一次
const now = ref(Date.now())
const ticker = setInterval(() => {
  now.value = Date.now()
}, 60000)
onBeforeUnmount(() => clearInterval(ticker))

const stats = computed(() => DECKS.map((deck) => {
  const schedules = deck.schedules()
  return {
    deck,
    due: countDueSchedules(schedules, now.value),
    learned: Object.values(schedules).filter(Boolean).length,
    dailyCount: deck.dailyCount(),
    goal: deck.goal(),
  }
}))
const totalDue = computed(() => stats.value.reduce((n, s) => n + s.due, 0))
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-4xl">
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
          每个词库要掌握的程度不同，练法也不同；进度和每日目标分开记录。
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <section
          v-for="s in stats"
          :key="s.deck.id"
          :data-deck="s.deck.id"
          class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <h4 class="text-lg text-gray-900 font-bold dark:text-white">
            {{ s.deck.name }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ s.deck.desc }}
          </p>
          <p class="mt-1 text-sm text-blue-700 dark:text-blue-300" data-goal>
            目标：{{ s.deck.goal }}
          </p>
          <div class="my-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-200" data-stats>
            <span>到期 <b :class="s.due > 0 ? 'text-orange-600 dark:text-orange-400' : ''">{{ s.due }}</b></span>
            <span>今日新词 <b>{{ s.dailyCount }}</b> / {{ s.goal }}</span>
            <span>已学 <b>{{ s.learned }}</b></span>
          </div>
          <div class="flex flex-col gap-2">
            <RouterLink
              v-for="mode in s.deck.modes"
              :key="mode.to"
              :to="mode.to"
              class="block border border-gray-200 rounded-lg px-3 py-2 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div class="text-gray-900 font-medium dark:text-white">
                {{ mode.label }} →
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ mode.desc }}
              </div>
            </RouterLink>
          </div>
        </section>
      </div>

      <RouterLink
        to="/game"
        data-game
        class="mt-4 block border border-orange-300 rounded-lg bg-orange-50 p-4 dark:border-orange-700 dark:bg-gray-700 hover:bg-orange-100 dark:hover:bg-gray-600"
      >
        <div class="text-lg text-gray-900 font-bold dark:text-white">
          🐉 单词地牢 →
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-300">
          把今天学的词、错词、到期的词或任意词库变成怪物一层层打下去，有每日关卡。出题按各词库的目标来：阅读考点词不考拼写。答对算复习，答错进错词本。
        </div>
      </RouterLink>
    </div>
  </div>
</template>

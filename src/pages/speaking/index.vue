<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import PartTwoPractice from './PartTwoPractice.vue'
import QuestionRecorder from './QuestionRecorder.vue'
import { PART1_TOPICS } from './part1'
import { PART2_CARDS } from './part2'
import type { Part2Card } from './part2'
import { PART3_TOPICS } from './part3'

type Tab = 'part1' | 'part2' | 'part3'
const tab = usePersistentString('myielts_speaking_tab', 'part1') as Ref<Tab>

// Part 1
const p1Keyword = ref('')
const p1Expanded = ref<string | null>(null)
const p1Filtered = computed(() => {
  const kw = p1Keyword.value.trim().toLowerCase()
  if (!kw)
    return PART1_TOPICS
  return PART1_TOPICS.filter(
    t => t.topic.toLowerCase().includes(kw) || t.topicCn.includes(kw)
      || t.questions.some(q => q.toLowerCase().includes(kw)),
  )
})
function toggleP1(id: string) {
  p1Expanded.value = p1Expanded.value === id ? null : id
}

// Part 2
const p2Category = ref('全部')
const p2Categories = computed(() => [
  '全部',
  ...new Set(PART2_CARDS.map(c => c.category)),
])
const p2Filtered = computed(() =>
  p2Category.value === '全部'
    ? PART2_CARDS
    : PART2_CARDS.filter(c => c.category === p2Category.value),
)
const activeCard = ref<Part2Card | null>(null)

// Part 3
const p3Expanded = ref<string | null>(null)
function toggleP3(id: string) {
  p3Expanded.value = p3Expanded.value === id ? null : id
}

function tabBtn(t: Tab) {
  return `rounded-lg px-4 py-2 text-sm font-bold transition ${
    tab.value === t
      ? 'bg-blue-600 text-white'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
  }`
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 2xl:px-0">
    <h2 class="mb-1 text-xl font-bold dark:text-white">
      🎙 口语
    </h2>
    <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
      Part 1 日常问答 · Part 2 个人陈述（1 分钟准备 + 2 分钟陈述）· Part 3
      深入讨论
    </p>

    <div class="mb-5 flex gap-2">
      <button :class="tabBtn('part1')" @click="tab = 'part1'">
        Part 1
      </button>
      <button :class="tabBtn('part2')" @click="tab = 'part2'">
        Part 2
      </button>
      <button :class="tabBtn('part3')" @click="tab = 'part3'">
        Part 3
      </button>
    </div>

    <!-- Part 1 -->
    <div v-if="tab === 'part1'">
      <input
        v-model="p1Keyword"
        placeholder="搜索话题…（如 工作、家乡）"
        class="mb-4 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
      <p class="mb-3 text-xs text-gray-400">
        {{ p1Filtered.length }} 个话题 · 每题回答 20–30
        秒，点话题展开后可录音自测
      </p>
      <div class="space-y-2">
        <div
          v-for="t in p1Filtered"
          :key="t.id"
          class="border border-gray-200 rounded-xl bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            class="w-full flex items-center justify-between px-4 py-3 text-left"
            @click="toggleP1(t.id)"
          >
            <span class="text-sm font-bold dark:text-white">{{ t.topic }}
              <span class="font-normal text-gray-400">{{
                t.topicCn
              }}</span></span>
            <span class="text-gray-400">{{
              p1Expanded === t.id ? '▲' : '▼'
            }}</span>
          </button>
          <div
            v-if="p1Expanded === t.id"
            class="border-t border-gray-100 px-4 py-3 dark:border-gray-700"
          >
            <div
              v-for="(q, i) in t.questions"
              :key="i"
              class="border-b border-gray-50 py-3 last:border-0 dark:border-gray-700/50"
            >
              <p class="text-sm leading-6 dark:text-gray-200">
                {{ q }}
              </p>
              <QuestionRecorder :question="q" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Part 2 -->
    <div v-if="tab === 'part2'">
      <div v-if="!activeCard">
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="c in p2Categories"
            :key="c"
            class="rounded-full px-3 py-1 text-xs font-bold transition"
            :class="
              p2Category === c
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            "
            @click="p2Category = c"
          >
            {{ c }}
          </button>
        </div>
        <p class="mb-3 text-xs text-gray-400">
          {{ p2Filtered.length }} 张卡片 · 点一张开始计时练习
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            v-for="card in p2Filtered"
            :key="card.id"
            class="border border-gray-200 rounded-xl bg-white p-4 text-left dark:border-gray-700 hover:border-amber-400 dark:bg-gray-800 hover:shadow-sm"
            @click="activeCard = card"
          >
            <div class="mb-1 text-xs text-amber-600 dark:text-amber-400">
              {{ card.category }}
            </div>
            <div class="text-sm font-bold leading-6 dark:text-white">
              {{ card.title }}
            </div>
            <div class="mt-1 text-xs text-gray-400">
              {{ card.titleCn }}
            </div>
          </button>
        </div>
      </div>
      <PartTwoPractice v-else :card="activeCard" @back="activeCard = null" />
    </div>

    <!-- Part 3 -->
    <div v-if="tab === 'part3'">
      <p class="mb-3 text-xs text-gray-400">
        {{ PART3_TOPICS.length }} 个讨论话题 · 回答要有观点 + 解释 +
        例子，可录音自测
      </p>
      <div class="space-y-2">
        <div
          v-for="t in PART3_TOPICS"
          :key="t.id"
          class="border border-gray-200 rounded-xl bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            class="w-full flex items-center justify-between px-4 py-3 text-left"
            @click="toggleP3(t.id)"
          >
            <span class="text-sm font-bold dark:text-white">{{ t.topic }}
              <span class="font-normal text-gray-400">{{
                t.topicCn
              }}</span></span>
            <span class="text-gray-400">{{
              p3Expanded === t.id ? '▲' : '▼'
            }}</span>
          </button>
          <div
            v-if="p3Expanded === t.id"
            class="border-t border-gray-100 px-4 py-3 dark:border-gray-700"
          >
            <div
              v-for="(q, i) in t.questions"
              :key="i"
              class="border-b border-gray-50 py-3 last:border-0 dark:border-gray-700/50"
            >
              <p class="text-sm leading-6 dark:text-gray-200">
                {{ q }}
              </p>
              <QuestionRecorder :question="q" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

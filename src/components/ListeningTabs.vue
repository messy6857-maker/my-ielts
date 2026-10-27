<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

// 听力页签栏，从 listening.vue 抽出（与 ReadingTabs.vue 同结构）：
// 样式与写作/阅读页签一致，只有当前页高亮，其余为白底。
// 判定逻辑与 listening.vue 原有逻辑完全一致。
const TABS = [
  { key: 'basic', label: 'IELTS 听力基本概念', to: '/listening' },
  { key: 'keyword', label: '听力 179 考点词', to: '/listening/keyword' },
  { key: 'corpus', label: '雅思听力王语料库', to: '/listening/corpus' },
  { key: 'intensive', label: '🎧 精听练习', to: '/listening/intensive' },
  { key: 'mock', label: '⏱ 限时模考', to: '/mock/listening-test' },
]

const route = useRoute()
const router = useRouter()

// 自测卡片/179 练习归属考点词，语料库自测归属语料库
const activeKey = computed(() => {
  const p = route.path
  if (
    p === '/listening/keyword'
    || p === '/listening/flashcard'
    || p === '/listening/179practice'
  )
    return 'keyword'
  if (p === '/listening/corpus' || p === '/listening/corpus-flashcard')
    return 'corpus'
  if (p === '/listening/intensive')
    return 'intensive'
  if (p.startsWith('/mock/listening-test'))
    return 'mock'
  return 'basic'
})

function go(tab: (typeof TABS)[number]) {
  if (activeKey.value !== tab.key)
    router.push(tab.to)
}
</script>

<template>
  <ul
    class="mb-4 rounded-lg text-center text-sm font-medium text-gray-500 shadow sm:flex dark:text-gray-400 dark:divide-gray-700"
  >
    <li v-for="(tab, i) in TABS" :key="tab.key" class="w-full">
      <button
        type="button"
        class="inline-block w-full border-r border-gray-200 p-4 dark:border-gray-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        :class="[
          i === 0 ? 'rounded-s-lg' : '',
          i === TABS.length - 1 ? 'rounded-e-lg' : '',
          activeKey === tab.key
            ? 'text-gray-900 bg-gray-100 dark:bg-gray-700 dark:text-white'
            : 'bg-white hover:text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:hover:text-white dark:hover:bg-gray-700',
        ]"
        @click="go(tab)"
      >
        {{ tab.label }}
      </button>
    </li>
  </ul>
</template>

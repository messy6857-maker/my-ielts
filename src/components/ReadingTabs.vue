<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

// 阅读四个入口的页签栏，样式照搬写作页顶部页签；
// 点页签即路由切换，当前页高亮（写作页是页内状态切换，
// 阅读四个入口本就是独立路由，这里用路由切换达到同样的切换体验）。
const TABS = [
  { key: 'keywords', label: '阅读考点词', to: '/reading' },
  { key: 'flashcard', label: '自测卡片', to: '/reading/flashcard' },
  { key: 'daily', label: '每日阅读', to: '/reading/daily' },
  { key: 'mock', label: '限时模考', to: '/mock/reading-test' },
]

const route = useRoute()
const router = useRouter()

const activeKey = computed(() => {
  if (route.path === '/reading/flashcard')
    return 'flashcard'
  if (route.path === '/reading/daily')
    return 'daily'
  if (route.path.startsWith('/mock/reading-test'))
    return 'mock'
  return 'keywords'
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

<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineOptions({
  name: 'IndexPage',
})

const { modules, hasAnyProgress } = useProgress()
const { totalCount: mistakeCount } = useMistakes()
const { currentUser } = useAuth()

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
    icon: 'i-carbon-load-balancer-vpc ',
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
          style="font-family: Charmonman"
          class="mb-16 text-center text-6xl text-gray-900 dark:text-white"
        >
          Salvation lies within <span class="font-bold text-#f00">IELTS</span>
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
        <!-- 学习进度 -->
        <div
          v-if="hasAnyProgress || mistakeCount > 0"
          class="mb-12 border border-gray-200 rounded-xl bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">
              学习进度
              <span class="ml-2 align-middle text-sm font-normal text-gray-400">
                {{ currentUser ? `当前账号：${currentUser}` : '游客模式' }}
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

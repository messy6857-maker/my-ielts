<script setup lang="ts">
// 雅思考试：分项练习、做题方法、限时模考、我的记录都从这里进
defineOptions({ name: 'IeltsPage' })

const GROUPS = [
  {
    title: '分项练习',
    entries: [
      { id: 'listening', icon: '🎧', title: '听力', desc: '179 考点词、语料库、精听练习', to: '/listening/keyword' },
      { id: 'reading', icon: '📖', title: '阅读', desc: '阅读考点词同义替换、每日阅读', to: '/reading' },
      { id: 'writing', icon: '✍️', title: '写作', desc: '100 句翻译、大小作文和 AI 批改', to: '/writing' },
      { id: 'speaking', icon: '🎙', title: '口语', desc: 'Part 1/2/3 真题，计时录音自测', to: '/speaking' },
      { id: 'grammar', icon: '🧩', title: '语法', desc: '基础语法讲义和思维导图', to: '/grammar' },
    ],
  },
  {
    title: '考试',
    entries: [
      { id: 'guide', icon: '🧭', title: '做题方法', desc: '听说读写各自的题型和做题技巧', to: '/ielts/guide' },
      { id: 'mock', icon: '⏱', title: '限时模考', desc: '剑桥 18–21 听力、阅读真题，限时作答', to: '/mock/listening-test' },
      { id: 'records', icon: '📊', title: '我的记录', desc: '模考成绩和作文、口语批改记录', to: '/mock/history' },
    ],
  },
]
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-2xl">
      <h3 class="mb-4 text-xl text-gray-900 font-bold dark:text-white">
        雅思考试
      </h3>
      <section v-for="g in GROUPS" :key="g.title" class="mb-6">
        <h4 class="mb-2 text-sm text-gray-500 font-bold dark:text-gray-400">
          {{ g.title }}
        </h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <RouterLink
            v-for="e in g.entries"
            :key="e.id"
            :to="e.to"
            :data-entry="e.id"
            class="block border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <div class="text-gray-900 font-bold dark:text-white">
              {{ e.icon }} {{ e.title }} →
            </div>
            <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ e.desc }}
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// 练拼写：进来再选练哪个词库、用哪种练法。
defineOptions({ name: 'StudySpellPage' })

const MODES = [
  {
    id: 'vocabulary',
    deck: '词汇表',
    label: '听发音拼写',
    desc: '在词表里听发音，逐个把词拼出来',
    to: '/vocabulary?practice=1',
  },
  {
    id: 'typing',
    deck: '词汇表',
    label: '跟打',
    desc: '看着单词和释义打一遍，熟悉拼写',
    to: '/vocabulary/typing',
  },
  {
    id: 'listening179',
    deck: '听力 179 考点词',
    label: '拼写和同义替换',
    desc: '逐行写出单词和它的同义替换',
    to: '/listening/179practice',
  },
  {
    id: 'corpus',
    deck: '听力语料库',
    label: '听发音、看释义拼写',
    desc: '英式美式都算对，拼错会标出错的字母',
    to: '/listening/corpus-spelling',
  },
]
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-2xl">
      <div class="mb-4 flex items-center gap-3">
        <RouterLink
          to="/study"
          class="shrink-0 border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          ← 返回背单词
        </RouterLink>
        <div>
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            练拼写
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            选一种练法。阅读考点词不要求拼写，所以不在这里。
          </p>
        </div>
      </div>
      <div class="flex flex-col gap-3">
        <RouterLink
          v-for="mode in MODES"
          :key="mode.id"
          :to="mode.to"
          :data-spell="mode.id"
          class="block border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div class="text-gray-900 font-bold dark:text-white">
            {{ mode.deck }} · {{ mode.label }} →
          </div>
          <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ mode.desc }}
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

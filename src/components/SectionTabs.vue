<script setup lang="ts">
// 一组页面顶上的“返回上一级 + 页签”：
// mock 限时模考（听力 / 阅读）、records 我的记录（模考 / 批改）—— 返回雅思考试；
// words 查单词表（词汇表 / 阅读考点词 / 听力 179 / 听力语料库）—— 返回背单词
type Group = 'mock' | 'records' | 'words'
const props = defineProps<{ group: Group }>()
const GROUPS: Record<Group, { back: [string, string], tabs: Array<{ label: string, to: string }> }> = {
  mock: {
    back: ['/ielts', '雅思考试'],
    tabs: [
      { label: '听力模考', to: '/mock/listening-test' },
      { label: '阅读模考', to: '/mock/reading-test' },
    ],
  },
  records: {
    back: ['/ielts', '雅思考试'],
    tabs: [
      { label: '模考记录', to: '/mock/history' },
      { label: '批改记录', to: '/grading/history' },
    ],
  },
  words: {
    back: ['/study', '背单词'],
    tabs: [
      { label: '词汇表', to: '/vocabulary' },
      { label: '阅读考点词', to: '/reading' },
      { label: '听力 179 考点词', to: '/listening/keyword' },
      { label: '听力语料库', to: '/listening/corpus' },
    ],
  },
}
const route = useRoute()
const config = computed(() => GROUPS[props.group])
const path = computed(() => route?.path ?? '')
function active(to: string) {
  return props.group === 'words'
    ? path.value === to
    : path.value.startsWith(to)
}
</script>

<template>
  <div
    class="mb-4"
    :data-exam-tabs="group === 'words' ? undefined : ''"
    :data-word-tables="group === 'words' ? '' : undefined"
  >
    <div class="flex flex-wrap items-center gap-3">
      <StudyBack :to="config.back[0]" :label="config.back[1]" />
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="t in config.tabs"
          :key="t.to"
          :to="t.to"
          class="border rounded-lg px-4 py-2 text-sm font-medium"
          :class="active(t.to) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
        >
          {{ t.label }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

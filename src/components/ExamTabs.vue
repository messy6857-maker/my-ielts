<script setup lang="ts">
// 雅思考试下面一组页面顶上的返回键和页签：限时模考（听力 / 阅读）、我的记录（模考 / 批改）
const props = defineProps<{ group: 'mock' | 'records' }>()
const GROUPS = {
  mock: [
    { label: '听力模考', to: '/mock/listening-test' },
    { label: '阅读模考', to: '/mock/reading-test' },
  ],
  records: [
    { label: '模考记录', to: '/mock/history' },
    { label: '批改记录', to: '/grading/history' },
  ],
}
const route = useRoute()
const tabs = computed(() => GROUPS[props.group])
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-3" data-exam-tabs>
    <StudyBack to="/ielts" label="雅思考试" />
    <div class="flex flex-wrap gap-2">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        class="border rounded-lg px-4 py-2 text-sm font-medium"
        :class="(route?.path ?? '').startsWith(t.to) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
      >
        {{ t.label }}
      </RouterLink>
    </div>
  </div>
</template>

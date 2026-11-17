<script setup lang="ts">
import ListeningGuide from '../../components/guide/ListeningGuide.vue'
import ReadingGuide from '../../components/guide/ReadingGuide.vue'
import SpeakingGuide from '../../components/guide/SpeakingGuide.vue'
import WritingGuide from '../../components/guide/WritingGuide.vue'

// 做题方法：听力、阅读、写作、口语各自的考试结构和做题技巧，放在一起看
defineOptions({ name: 'IeltsGuidePage' })

const TABS = [
  { id: 'listening', label: '听力' },
  { id: 'reading', label: '阅读' },
  { id: 'writing', label: '写作' },
  { id: 'speaking', label: '口语' },
] as const
type TabId = (typeof TABS)[number]['id']
const route = useRoute()
const router = useRouter()
const tab = computed<TabId>(() => TABS.some(t => t.id === route.query.part)
  ? route.query.part as TabId
  : 'listening')
function choose(id: TabId) {
  router.replace({ query: { ...route.query, part: id } })
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-3xl">
      <div class="mb-4 flex items-center gap-3">
        <StudyBack to="/ielts" label="雅思考试" />
        <h3 class="text-xl text-gray-900 font-bold dark:text-white">
          做题方法
        </h3>
      </div>
      <div class="mb-4 flex flex-wrap gap-2" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.id"
          role="tab"
          :data-part="t.id"
          :aria-selected="tab === t.id"
          class="border rounded-lg px-4 py-2 text-sm font-medium"
          :class="tab === t.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
          @click="choose(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <ListeningGuide v-if="tab === 'listening'" />
        <ReadingGuide v-else-if="tab === 'reading'" />
        <WritingGuide v-else-if="tab === 'writing'" />
        <SpeakingGuide v-else />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getMockHistory, clearMockHistory } from '~/composables/useMockHistory'
import type { MockRecord } from '~/composables/useMockHistory'

const records = ref<MockRecord[]>([])

onMounted(() => {
  records.value = getMockHistory()
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function handleClear() {
  if (confirm('确定清空所有模考记录吗？')) {
    clearMockHistory()
    records.value = []
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        📊 模考记录
      </h2>
      <button
        v-if="records.length"
        class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="handleClear"
      >
        清空记录
      </button>
    </div>

    <div v-if="!records.length" class="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
      还没有模考记录，去做一套吧！
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(r, i) in records"
        :key="i"
        class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div>
          <div class="font-medium text-gray-900 dark:text-white">
            {{ r.label }} · {{ r.kind === 'listening' ? '🎧 听力' : '📖 阅读' }}
          </div>
          <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ formatDate(r.date) }}
          </div>
        </div>
        <div class="text-right">
          <div class="text-lg font-bold text-gray-900 dark:text-white">
            {{ r.score }}<span class="text-sm font-normal text-gray-500">/{{ r.total }}</span>
          </div>
          <div class="text-sm text-purple-600 dark:text-purple-400">
            {{ r.band.toFixed(1) }} 分
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

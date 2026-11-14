<script setup lang="ts">
import type { MockRecord } from '~/composables/useMockHistory'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { onSyncApplied } from '~/composables/syncClient'
import { useAuth } from '~/composables/useAuth'
import { confirmDialog } from '~/composables/useDialog'
import { clearMockHistory, getMockHistory } from '~/composables/useMockHistory'

const records = ref<MockRecord[]>([])
const { currentUser } = useAuth()

onMounted(() => {
  records.value = getMockHistory()
})

// 拉取重载只写 localStorage、不通知本页时列表会滞后：订阅同步应用通知后重读
// （与各 store 的做法一致，不另设反注册机制）
const offSync = onSyncApplied(() => {
  records.value = getMockHistory()
})

// 退出/切换账号不导航、不触发拉取时列表会滞留旧账号数据：跟随身份变化重读
// （getMockHistory 按调用时刻的 currentUser 取 key，退出后读游客 key，不再显示上个账号的记录）
watch(currentUser, () => {
  records.value = getMockHistory()
})

onUnmounted(offSync)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleClear() {
  if (await confirmDialog('确定清空所有模考记录吗？开始屏的“已有交卷记录”提示也会一并清除，进行中草稿不受影响。', { danger: true, confirmText: '清空' })) {
    clearMockHistory()
    records.value = []
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl text-gray-900 font-bold dark:text-white">
        📊 模考记录
      </h2>
      <button
        v-if="records.length"
        class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-500 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="handleClear"
      >
        清空记录
      </button>
    </div>

    <div
      v-if="!records.length"
      class="border border-gray-200 rounded-2xl bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    >
      还没有模考记录，去做一套吧！
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(r, i) in records"
        :key="i"
        class="flex items-center justify-between border border-gray-200 rounded-xl bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div>
          <div class="text-gray-900 font-medium dark:text-white">
            {{ r.label }} · {{ r.kind === 'listening' ? '🎧 听力' : '📖 阅读' }}
          </div>
          <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ formatDate(r.date) }}
          </div>
        </div>
        <div class="text-right">
          <div class="text-lg text-gray-900 font-bold dark:text-white">
            {{ r.score
            }}<span class="text-sm text-gray-500 font-normal">/{{ r.total }}</span>
          </div>
          <div class="text-sm text-purple-600 dark:text-purple-400">
            {{ r.band.toFixed(1) }} 分
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

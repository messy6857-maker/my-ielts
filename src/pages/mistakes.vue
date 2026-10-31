<script setup lang="ts">
import type { MistakeItem } from '../composables/useStudyData'

const { currentUser } = useAuth()
let reviewTimer: ReturnType<typeof setTimeout> | undefined
watch(
  currentUser,
  () => {
    clearTimeout(reviewTimer)
    stopReview()
  },
  { flush: 'sync' },
)
onUnmounted(() => clearTimeout(reviewTimer))

const { grouped, totalCount, removeMistake, clearMistakes } = useMistakes()

const isReviewing = ref(false)
const reviewItem = ref<MistakeItem | null>(null)
const reviewInput = ref('')
const reviewState = ref<'answering' | 'wrong' | 'correct'>('answering')

function allMistakes(): MistakeItem[] {
  return grouped.value.flatMap(g => g.items)
}

function startReview() {
  if (totalCount.value === 0)
    return
  isReviewing.value = true
  nextCard()
}

function stopReview() {
  isReviewing.value = false
  reviewItem.value = null
}

function nextCard() {
  const all = allMistakes().filter(m => m.key !== reviewItem.value?.key)
  const pool = all.length > 0 ? all : allMistakes()
  if (pool.length === 0) {
    stopReview()
    return
  }
  reviewItem.value = pool[Math.floor(Math.random() * pool.length)]
  reviewInput.value = ''
  reviewState.value = 'answering'
}

function submitAnswer() {
  if (!reviewItem.value || reviewState.value !== 'answering')
    return
  const answer = reviewInput.value.trim().toLowerCase()
  const expected = reviewItem.value.title
    .toLowerCase()
    .split(/\s+\/\s+|\s*;\s*/)
    .map(s => s.trim())
  if (answer && expected.includes(answer)) {
    // 答对：从错词本移除
    reviewState.value = 'correct'
    const key = reviewItem.value.key
    removeMistake(key)
    const owner = currentUser.value
    reviewTimer = setTimeout(() => {
      if (currentUser.value === owner)
        nextCard()
    }, 800)
  }
  else {
    reviewState.value = 'wrong'
  }
}

function confirmClearAll() {
  if (window.confirm('确定要清空整个错词本吗？'))
    clearMistakes()
}

function confirmClearModule(module: string, label: string) {
  if (window.confirm(`确定要清空「${label}」的错词吗？`))
    clearMistakes(module as any)
}

// 旧键清理（确认式，不静默删用户数据）：只删 key 为 listening: 开头、且非
// listening179: 的旧键条目（B2 键统一之前由 179 练习页产生）；新键与其它分组不动。
// removeMistake 按 key 写重置纪元，同一 key 的全设备分片一并失效。
const legacyListeningKeys = computed(() =>
  allMistakes()
    .filter(
      m =>
        m.key.startsWith('listening:') && !m.key.startsWith('listening179:'),
    )
    .map(m => m.key),
)
function confirmClearLegacyListening() {
  const count = legacyListeningKeys.value.length
  if (count === 0)
    return
  if (
    window.confirm(
      `确定要清理 ${count} 条旧听力错题吗？仅删除 listening: 开头、且非 listening179: 的旧键条目（键统一之前产生），新键 listening179: 与其他分组不受影响。此操作不可撤销。`,
    )
  )
    legacyListeningKeys.value.forEach(key => removeMistake(key))
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <!-- header -->
      <div class="items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            错词本
          </h3>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">
            练习中记错的词都会自动收录到这里（共 {{ totalCount }} 个）
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="totalCount > 0 && !isReviewing"
            type="button"
            class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="startReview"
          >
            开始复习
          </button>
          <button
            v-if="legacyListeningKeys.length > 0"
            type="button"
            class="rounded-lg bg-amber-100 px-5 py-2.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 hover:bg-amber-200 dark:text-amber-200 dark:hover:bg-amber-900/50"
            @click="confirmClearLegacyListening"
          >
            清理旧听力键（{{ legacyListeningKeys.length }} 条）
          </button>
          <button
            v-if="totalCount > 0"
            type="button"
            class="rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 dark:bg-gray-700 hover:bg-gray-300 dark:text-gray-200 focus:outline-none focus:ring-4 focus:ring-gray-300 dark:hover:bg-gray-600"
            @click="confirmClearAll"
          >
            清空全部
          </button>
        </div>
      </div>

      <!-- 复习模式 -->
      <div v-if="isReviewing && reviewItem" class="mt-6">
        <div
          class="mx-auto max-w-xl border border-gray-200 rounded-xl bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="mb-2 text-xs tracking-wider uppercase text-gray-500">
            剩余 {{ totalCount }} 个
          </div>
          <div class="mb-1 text-lg text-gray-700 dark:text-gray-300">
            {{ reviewItem.detail }}
          </div>
          <div v-if="reviewItem.hint" class="mb-6 text-sm italic text-gray-400">
            {{ reviewItem.hint }}
          </div>
          <div
            v-if="reviewState === 'wrong'"
            class="mb-4 rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            不对，正确答案是：<span class="font-bold">{{
              reviewItem.title
            }}</span>
            <button class="ml-3 underline" @click="nextCard">
              下一个
            </button>
          </div>
          <div
            v-if="reviewState === 'correct'"
            class="mb-4 rounded-lg bg-green-50 p-3 font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            答对了，已从错词本移除 ✓
          </div>
          <div v-if="reviewState === 'answering'" class="flex gap-2">
            <input
              v-model="reviewInput"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="输入这个单词"
              class="flex-1 border border-gray-300 rounded-lg bg-white p-2.5 text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500"
              @keydown.enter="submitAnswer"
            >
            <button
              type="button"
              class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800"
              @click="submitAnswer"
            >
              确认
            </button>
          </div>
          <button
            class="mt-6 text-sm text-gray-400 underline"
            @click="stopReview"
          >
            退出复习
          </button>
        </div>
      </div>

      <!-- 列表模式 -->
      <div v-else class="mt-6">
        <div v-if="totalCount === 0" class="py-16 text-center text-gray-400">
          <i class="i-carbon-notebook mx-auto mb-4 block text-5xl" />
          <p>
            错词本还是空的，去词汇 / 打字 / 听力练习里做错几道题就会自动收录啦
          </p>
        </div>
        <template v-for="group in grouped" :key="group.module">
          <div class="mb-2 mt-6 flex items-center justify-between">
            <h4 class="text-lg font-bold text-gray-900 dark:text-white">
              {{ group.label }}（{{ group.items.length }}）
            </h4>
            <button
              class="text-sm text-gray-400 underline hover:text-gray-600"
              @click="confirmClearModule(group.module, group.label)"
            >
              清空本组
            </button>
          </div>
          <div class="overflow-x-auto rounded-lg">
            <table
              class="w-full text-left text-sm text-gray-500 dark:text-gray-400"
            >
              <thead
                class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400"
              >
                <tr>
                  <th class="px-6 py-3">
                    单词
                  </th>
                  <th class="px-6 py-3">
                    释义
                  </th>
                  <th class="w-0 px-6 py-3">
                    错几次
                  </th>
                  <th class="w-0 px-6 py-3">
                    最近
                  </th>
                  <th class="w-0 px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in group.items"
                  :key="item.key"
                  class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  <td
                    class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white"
                  >
                    {{ item.title }}
                  </td>
                  <td class="px-6 py-4">
                    {{ item.detail }}
                  </td>
                  <td class="px-6 py-4">
                    <span
                      class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    >
                      {{ item.count }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-6 py-4">
                    {{ formatDate(item.lastAt) }}
                  </td>
                  <td class="px-6 py-4">
                    <button
                      title="已掌握，从错词本移除"
                      class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-700"
                      @click="removeMistake(item.key)"
                    >
                      <i class="i-carbon-checkmark block" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

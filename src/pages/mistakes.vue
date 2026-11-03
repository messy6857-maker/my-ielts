<script setup lang="ts">
import type { MistakeItem, MistakeModule } from '../composables/useStudyData'
import { MISTAKE_MODULE_LABEL } from '../composables/useStudyData'
import {
  decodeMockMistakeMeta,
  mockReviewMatches,
} from '../utils/mockMistakes'
import { resolveMediaUrl } from '~/composables/useAudio'

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

const {
  grouped,
  totalCount,
  removeMistake,
  clearMistakes,
  assignLegacyActivity,
} = useMistakes()

const isReviewing = ref(false)
const reviewItem = ref<MistakeItem | null>(null)
const reviewInput = ref('')
const reviewState = ref<'answering' | 'wrong' | 'correct'>('answering')
const reviewAudioEl = ref<HTMLAudioElement | null>(null)

const filterModule = ref<'all' | MistakeModule>('all')
const filterTestId = ref('all')
const filterPart = ref('all')

const MOCK_MODULES: MistakeModule[] = ['mock_listening', 'mock_reading']

function isMockItem(item: MistakeItem) {
  return MOCK_MODULES.includes(item.module) || !!decodeMockMistakeMeta(item.hint)
}

function allMistakes(): MistakeItem[] {
  return grouped.value.flatMap(g => g.items)
}

const filteredItems = computed(() => {
  return allMistakes().filter((item) => {
    if (filterModule.value !== 'all' && item.module !== filterModule.value)
      return false
    const meta = decodeMockMistakeMeta(item.hint)
    if (filterTestId.value !== 'all') {
      if (!meta || meta.testId !== filterTestId.value)
        return false
    }
    if (filterPart.value !== 'all') {
      if (!meta || meta.part !== filterPart.value)
        return false
    }
    return true
  })
})

const filteredGrouped = computed(() => {
  const map = new Map<MistakeModule, MistakeItem[]>()
  for (const item of filteredItems.value) {
    const list = map.get(item.module) ?? []
    list.push(item)
    map.set(item.module, list)
  }
  return [...map.entries()].map(([module, items]) => ({
    module,
    label: MISTAKE_MODULE_LABEL[module] ?? module,
    items,
  }))
})

const mockTestOptions = computed(() => {
  const ids = new Set<string>()
  for (const item of allMistakes()) {
    const meta = decodeMockMistakeMeta(item.hint)
    if (meta)
      ids.add(meta.testId)
  }
  return [...ids].sort()
})

const mockPartOptions = computed(() => {
  const parts = new Set<string>()
  for (const item of allMistakes()) {
    const meta = decodeMockMistakeMeta(item.hint)
    if (!meta)
      continue
    if (filterTestId.value !== 'all' && meta.testId !== filterTestId.value)
      continue
    if (filterModule.value === 'mock_listening' && meta.kind !== 'listening')
      continue
    if (filterModule.value === 'mock_reading' && meta.kind !== 'reading')
      continue
    parts.add(meta.part)
  }
  return [...parts].sort()
})

const moduleFilterOptions = computed(() => {
  const present = new Set(allMistakes().map(m => m.module))
  return (Object.keys(MISTAKE_MODULE_LABEL) as MistakeModule[])
    .filter(m => present.has(m))
    .map(m => ({ value: m, label: MISTAKE_MODULE_LABEL[m] }))
})

watch(filterModule, () => {
  filterTestId.value = 'all'
  filterPart.value = 'all'
})
watch(filterTestId, () => {
  filterPart.value = 'all'
})

function startReview(onlyFiltered = true) {
  const pool = onlyFiltered ? filteredItems.value : allMistakes()
  if (pool.length === 0)
    return
  isReviewing.value = true
  nextCard()
}

function stopReview() {
  isReviewing.value = false
  reviewItem.value = null
  reviewAudioEl.value?.pause()
}

function reviewPool(): MistakeItem[] {
  return filteredItems.value.length > 0 ? filteredItems.value : allMistakes()
}

function nextCard() {
  const all = reviewPool().filter(m => m.key !== reviewItem.value?.key)
  const pool = all.length > 0 ? all : reviewPool()
  if (pool.length === 0) {
    stopReview()
    return
  }
  reviewItem.value = pool[Math.floor(Math.random() * pool.length)]
  reviewInput.value = ''
  reviewState.value = 'answering'
  reviewAudioEl.value?.pause()
}

function answerMatches(item: MistakeItem, input: string): boolean {
  if (isMockItem(item) || item.module === 'writing' || item.module === 'dictation')
    return mockReviewMatches(item.title, input)
  const answer = input.trim().toLowerCase()
  const expected = item.title
    .toLowerCase()
    .split(/\s+\/\s+|\s*;\s*/)
    .map(s => s.trim())
  return !!answer && expected.includes(answer)
}

function submitAnswer() {
  if (!reviewItem.value || reviewState.value !== 'answering')
    return
  if (answerMatches(reviewItem.value, reviewInput.value)) {
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

function mockOpenPath(item: MistakeItem): string | null {
  const meta = decodeMockMistakeMeta(item.hint)
  if (!meta)
    return null
  const path
    = meta.kind === 'listening' ? '/mock/listening-test' : '/mock/reading-test'
  return `${path}?test=${encodeURIComponent(meta.testId)}`
}

function playReviewAudio() {
  const meta = decodeMockMistakeMeta(reviewItem.value?.hint)
  if (!meta?.audio || !reviewAudioEl.value)
    return
  const el = reviewAudioEl.value
  el.src = resolveMediaUrl(meta.audio)
  el.play().catch(() => {})
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function detailLines(detail: string) {
  return detail.split('\n').filter(Boolean)
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <div class="items-center justify-between gap-3 lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            错词本
          </h3>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">
            词汇、模考、听写等记错项会自动收录（共 {{ totalCount }} 个；当前筛选
            {{ filteredItems.length }} 个）
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="filteredItems.length > 0 && !isReviewing"
            type="button"
            class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800"
            @click="startReview(true)"
          >
            只做错题重练（{{ filteredItems.length }}）
          </button>
          <button
            v-if="legacyListeningKeys.length > 0"
            type="button"
            class="rounded-lg bg-amber-100 px-5 py-2.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            @click="confirmClearLegacyListening"
          >
            清理旧听力键（{{ legacyListeningKeys.length }} 条）
          </button>
          <button
            v-if="totalCount > 0"
            type="button"
            class="rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            @click="confirmClearAll"
          >
            清空全部
          </button>
        </div>
      </div>

      <!-- filters -->
      <div
        v-if="totalCount > 0 && !isReviewing"
        class="mt-4 flex flex-wrap gap-3"
      >
        <label class="text-sm text-gray-600 dark:text-gray-300">
          分组
          <select
            v-model="filterModule"
            class="ml-2 border border-gray-300 rounded-lg bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">
              全部
            </option>
            <option
              v-for="opt in moduleFilterOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label
          v-if="mockTestOptions.length > 0"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          套卷
          <select
            v-model="filterTestId"
            class="ml-2 border border-gray-300 rounded-lg bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">
              全部套卷
            </option>
            <option v-for="id in mockTestOptions" :key="id" :value="id">
              {{ id }}
            </option>
          </select>
        </label>
        <label
          v-if="mockPartOptions.length > 0"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          Part
          <select
            v-model="filterPart"
            class="ml-2 border border-gray-300 rounded-lg bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">
              全部 Part
            </option>
            <option v-for="p in mockPartOptions" :key="p" :value="p">
              {{ p }}
            </option>
          </select>
        </label>
      </div>

      <!-- 复习模式 -->
      <div v-if="isReviewing && reviewItem" class="mt-6">
        <div
          class="mx-auto max-w-xl border border-gray-200 rounded-xl bg-gray-50 p-6 text-center sm:p-8 dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="mb-2 text-xs tracking-wider uppercase text-gray-500">
            {{ MISTAKE_MODULE_LABEL[reviewItem.module] || reviewItem.module }} · 剩余
            {{ filteredItems.length || totalCount }}
          </div>
          <div
            class="mb-3 whitespace-pre-line text-left text-sm leading-6 text-gray-700 dark:text-gray-300"
          >
            <p
              v-for="(line, i) in detailLines(reviewItem.detail)"
              :key="i"
              :class="i === 0 ? 'font-medium text-gray-900 dark:text-white' : ''"
            >
              {{ line }}
            </p>
          </div>
          <div
            v-if="decodeMockMistakeMeta(reviewItem.hint)?.audio"
            class="mb-4"
          >
            <audio ref="reviewAudioEl" class="hidden" preload="none" />
            <button
              type="button"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
              @click="playReviewAudio"
            >
              播放听力原音
            </button>
          </div>
          <div
            v-if="reviewState === 'wrong'"
            class="mb-4 rounded-lg bg-red-50 p-3 text-left text-red-700 dark:bg-red-900/30 dark:text-red-300"
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
          <div v-if="reviewState === 'answering'" class="flex flex-col gap-2 sm:flex-row">
            <input
              v-model="reviewInput"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="isMockItem(reviewItem) ? '输入正确答案（选项字母或原文）' : '输入这个单词'"
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
          <div class="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            <RouterLink
              v-if="mockOpenPath(reviewItem)"
              :to="mockOpenPath(reviewItem)!"
              class="text-blue-600 underline dark:text-blue-400"
            >
              打开原套卷
            </RouterLink>
            <button class="text-gray-400 underline" @click="stopReview">
              退出复习
            </button>
          </div>
        </div>
      </div>

      <!-- 列表模式 -->
      <div v-else class="mt-6">
        <div v-if="totalCount === 0" class="py-16 text-center text-gray-400">
          <i class="i-carbon-notebook mx-auto mb-4 block text-5xl" />
          <p>
            错词本还是空的。词汇 / 打字 / 听力 179 / 模考 / 听写 / 写作练习里记错后会自动收录。
          </p>
        </div>
        <div
          v-else-if="filteredItems.length === 0"
          class="py-12 text-center text-gray-400"
        >
          当前筛选没有错题，试试换成「全部」或其它套卷。
        </div>
        <template v-for="group in filteredGrouped" :key="group.module">
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
                  <th class="px-4 py-3 sm:px-6">
                    答案 / 题目
                  </th>
                  <th class="px-4 py-3 sm:px-6">
                    详情
                  </th>
                  <th class="w-0 px-4 py-3 sm:px-6">
                    错几次
                  </th>
                  <th class="w-0 px-4 py-3 sm:px-6">
                    最近
                  </th>
                  <th class="w-0 px-4 py-3 sm:px-6" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in group.items"
                  :key="item.key"
                  class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  <td
                    class="px-4 py-4 font-medium text-gray-900 sm:px-6 dark:text-white"
                  >
                    {{ item.title }}
                  </td>
                  <td class="px-4 py-4 sm:px-6">
                    <div class="whitespace-pre-line">
                      {{ item.detail }}
                    </div>
                    <div v-if="item.legacySource" class="mt-1 text-xs">
                      仅调整旧版计数归属：
                      <button
                        class="mr-2 underline"
                        @click="assignLegacyActivity(item.key, 'flashcard')"
                      >
                        重新归入单词自测
                      </button>
                      <button
                        class="underline"
                        @click="assignLegacyActivity(item.key, 'vocabulary')"
                      >
                        重新归入词汇拼写
                      </button>
                    </div>
                    <RouterLink
                      v-if="mockOpenPath(item)"
                      :to="mockOpenPath(item)!"
                      class="mt-1 inline-block text-xs text-blue-600 underline dark:text-blue-400"
                    >
                      打开原套卷
                    </RouterLink>
                  </td>
                  <td class="px-4 py-4 sm:px-6">
                    <span
                      class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    >
                      {{ item.count }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-4 sm:px-6">
                    {{ formatDate(item.lastAt) }}
                  </td>
                  <td class="px-4 py-4 sm:px-6">
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

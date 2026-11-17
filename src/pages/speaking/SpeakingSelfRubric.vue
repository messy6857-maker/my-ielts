<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '../../composables/useAuth'
import type { CriterionKey } from '../../utils/speakingCriteria'
import { CRITERIA } from '../../utils/speakingCriteria'
import { accountKey, readValue, saveValue } from '../../utils/storage'

const props = defineProps<{ question: string, part?: string }>()

const { currentUser } = useAuth()

interface SelfRubricResult {
  scores: Record<CriterionKey, number>
  notes: string
  savedAt: number
}

const scores = ref<Record<CriterionKey, number>>({
  fluency: 6,
  lexical: 6,
  grammar: 6,
  pronunciation: 6,
})
const notes = ref('')
const savedMsg = ref('')

function storageKey() {
  const user = currentUser.value
    ? `u_${currentUser.value}`
    : 'guest'
  let h = 0
  const s = `${props.part || ''}|${props.question}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `myielts_${user}_speaking_self_rubric_v1_${h.toString(36)}`
}

function load() {
  const raw = readValue<SelfRubricResult | null>(storageKey(), null)
  if (raw?.scores) {
    scores.value = {
      ...scores.value,
      ...raw.scores,
    }
    notes.value = raw.notes || ''
  }
  else {
    scores.value = {
      fluency: 6,
      lexical: 6,
      grammar: 6,
      pronunciation: 6,
    }
    notes.value = ''
  }
  savedMsg.value = ''
}

const overall = computed(() => {
  const vals = Object.values(scores.value)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 2) / 2
})

function save() {
  // C-01: check both writes; on any failure report failure, never claim success.
  const okEntry = saveValue(storageKey(), {
    scores: { ...scores.value },
    notes: notes.value,
    savedAt: Date.now(),
  } satisfies SelfRubricResult)
  // also keep a lightweight index for the account (local-only; deliberately
  // not synced, see storage.ts C-03)
  const indexKey = accountKey('speaking_self_rubric_index_v1', currentUser.value)
  const index = readValue<string[]>(indexKey, [])
  const key = storageKey()
  let okIndex = true
  if (!index.includes(key))
    okIndex = saveValue(indexKey, [...index, key].slice(-50))
  savedMsg.value = okEntry && okIndex
    ? '已保存本机自评'
    : '保存失败，自评未保存，请稍后重试'
}

watch(
  [
    currentUser,
    () => props.question,
    () => props.part,
  ],
  load,
  { immediate: true },
)
</script>

<template>
  <div
    class="mt-3 border border-gray-200 rounded-xl bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
  >
    <h4 class="mb-1 text-sm font-bold dark:text-white">
      本地自评清单（雅思口语 4 项）
    </h4>
    <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
      未配置 AI 时也可对照官方四项标准给自己打分；结果保存在本机（按账号隔离）。
    </p>
    <div class="space-y-3">
      <div v-for="c in CRITERIA" :key="c.key">
        <div class="mb-1 flex items-center justify-between gap-2">
          <label class="text-xs text-gray-800 font-medium dark:text-gray-200">{{
            c.label
          }}</label>
          <span class="text-sm text-blue-600 font-bold dark:text-blue-400">{{
            scores[c.key]
          }}</span>
        </div>
        <input
          v-model.number="scores[c.key]"
          type="range"
          min="4"
          max="9"
          step="0.5"
          class="w-full"
        >
        <p class="text-[11px] text-gray-400">
          {{ c.tips }}
        </p>
        <p
          v-if="c.anchors[Math.floor(scores[c.key])]"
          class="text-[11px] text-gray-500 dark:text-gray-400"
        >
          {{ Math.floor(scores[c.key]) }} 分档：{{ c.anchors[Math.floor(scores[c.key])] }}
        </p>
      </div>
    </div>
    <textarea
      v-model="notes"
      rows="2"
      placeholder="可选：写下改进点…"
      class="mt-3 w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
    />
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium dark:text-white">
        综合约 {{ overall }}
      </p>
      <button
        class="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-white font-medium dark:bg-gray-200 dark:text-gray-900"
        @click="save"
      >
        保存自评
      </button>
    </div>
    <p
      v-if="savedMsg"
      class="mt-1 text-xs"
      :class="savedMsg.startsWith('保存失败') ? 'text-red-600' : 'text-green-600'"
    >
      {{ savedMsg }}
    </p>
  </div>
</template>

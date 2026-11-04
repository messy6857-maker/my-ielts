<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { accountKey, readValue, saveValue } from '../../utils/storage'
import { useAuth } from '../../composables/useAuth'

const props = defineProps<{ question: string; part?: string }>()

const { currentUser } = useAuth()

type CriterionKey = 'fluency' | 'lexical' | 'grammar' | 'pronunciation'

// C-04:每项补 5–9 分档一句话锚点（官方口语四项标准的简明意译，非原文
// 照搬），滑杆下方随当前分值显示对应档描述；4 分档无锚点（滑杆 min 4
// 时该行自动隐藏）。
const CRITERIA: Array<{
  key: CriterionKey
  label: string
  tips: string
  anchors: Record<number, string>
}> = [
  {
    key: 'fluency',
    label: '流利与连贯 (Fluency & Coherence)',
    tips: '语速是否自然、停顿是否合理、观点是否连贯有逻辑',
    anchors: {
      5: '能维持较长发言，但常有重复、自我纠正和停顿',
      6: '能较连贯地谈论，偶有重复与停顿，衔接基本到位',
      7: '表达流利少停顿，偶有语言相关犹豫，衔接多样',
      8: '流利自然，偶有重复或自我纠正，话题展开充分',
      9: '全程流利连贯，停顿自然得体，衔接精准丰富',
    },
  },
  {
    key: 'lexical',
    label: '词汇资源 (Lexical Resource)',
    tips: '用词是否多样准确、有无改述、搭配是否自然',
    anchors: {
      5: '词汇量有限，改述常有困难，偶有错误',
      6: '词汇足够谈论各类话题，偶有不准确，改述基本成功',
      7: '词汇灵活多样，偶有不准确，搭配意识较强',
      8: '词汇丰富精准，偶有小错，改述灵活',
      9: '词汇精准地道，搭配自然，改述信手拈来',
    },
  },
  {
    key: 'grammar',
    label: '语法广度与准确性 (GRA)',
    tips: '句式是否多样、时态/主谓是否正确、错误是否影响理解',
    anchors: {
      5: '句式有限，错误较多但基本可理解',
      6: '简单与复杂句混用，错误不影响理解',
      7: '句式多样，错误较少且多为口误',
      8: '句式灵活，错误极少且不影响理解',
      9: '句式丰富精准，错误极少且仅为口误',
    },
  },
  {
    key: 'pronunciation',
    label: '发音 (Pronunciation)',
    tips: '音素是否清晰、重音/语调是否自然、是否易于听懂',
    anchors: {
      5: '发音基本可懂，重音语调常有问题，偶需听者费力',
      6: '发音大体清晰，个别音素与重音有误，基本易懂',
      7: '发音清晰，重音语调大体自然，偶有小问题',
      8: '发音清晰自然，个别特征有母语影响但易懂',
      9: '发音精准自然，重音语调运用自如',
    },
  },
]

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
  const user = currentUser.value ? `u_${currentUser.value}` : 'guest'
  let h = 0
  const s = `${props.part || ''}|${props.question}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `myielts_${user}_speaking_self_rubric_v1_${h.toString(36)}`
}

function load() {
  const raw = readValue<SelfRubricResult | null>(storageKey(), null)
  if (raw?.scores) {
    scores.value = { ...scores.value, ...raw.scores }
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
  [currentUser, () => props.question, () => props.part],
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
          <label class="text-xs font-medium text-gray-800 dark:text-gray-200">{{
            c.label
          }}</label>
          <span class="text-sm font-bold text-blue-600 dark:text-blue-400">{{
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
        class="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white dark:bg-gray-200 dark:text-gray-900"
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

<script setup lang="ts">
import type { WordInfo } from '../composables/useWordInfo'
import type { StudyCard } from '../utils/studyDeck'
import { parseExtra } from '../pages/vocabulary/extraParser'
import {
  ensureMnemonic,
  ensureSynonymMeanings,
  mnemonicFn,
  synonymMeaning,
  synonymPos,
} from '../pages/vocabulary/vocabExtras'

// 词汇表卡片的提示：自评前的“例句巧记”（phase=pre），自评后的例句扩展、拓展词、巧记（phase=post）。
// 父组件按卡片 key 重建本组件，展开状态每张卡重置。
const props = defineProps<{
  card: StudyCard
  phase: 'pre' | 'post'
  wordInfo: WordInfo | null
  /** 这个词累计答错次数（巧记标题旁提示） */
  lapses?: number
  /** 这一轮重点记关联词：同义词、拓展词排在最前面，意思直接显示 */
  related?: boolean
}>()

ensureMnemonic()
ensureSynonymMeanings()

const mnemonic = computed(() =>
  mnemonicFn.value
    ? mnemonicFn.value(props.card.word, props.card.meaning, props.card.example)
    : null,
)
const extras = computed(() => parseExtra(props.card.extra))
const hasPreHints = computed(() =>
  !!mnemonic.value
  || !!props.card.example
  || !!(props.wordInfo && (props.wordInfo.examples.length > 0 || props.wordInfo.synonyms.length > 0)),
)

// 拓展词、同义词配色：循环使用，方便区分不同的词
const colors = [
  'text-blue-600 dark:text-blue-400',
  'text-purple-600 dark:text-purple-400',
  'text-pink-600 dark:text-pink-400',
  'text-orange-600 dark:text-orange-400',
  'text-teal-600 dark:text-teal-400',
  'text-indigo-600 dark:text-indigo-400',
]
const dots = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
]

const showPre = ref(false)
const showPreAnswer = ref(false)
const showMnemonic = ref(false)
const showAnswer = ref(false)
const expandedSyns = ref<string[]>([])
const expandedExtras = ref<number[]>([])
function toggleSyn(syn: string) {
  const key = syn.trim().toLowerCase()
  expandedSyns.value = expandedSyns.value.includes(key)
    ? expandedSyns.value.filter(v => v !== key)
    : [...expandedSyns.value, key]
}
function toggleExtra(i: number) {
  expandedExtras.value = expandedExtras.value.includes(i)
    ? expandedExtras.value.filter(v => v !== i)
    : [...expandedExtras.value, i]
}
</script>

<template>
  <!-- 自评前：例句巧记，默认收起，点一下才显示 -->
  <div
    v-if="phase === 'pre' && hasPreHints"
    class="my-5 border border-sky-200 rounded-xl bg-sky-50 p-4 text-left dark:border-sky-800 dark:bg-sky-900/20"
    data-vocab-pre
  >
    <button
      class="mb-2 w-full flex items-center gap-1 text-sm text-sky-700 font-bold dark:text-sky-300"
      @click="showPre = !showPre"
    >
      💡 例句巧记
      <span class="font-normal">{{ showPre ? '（收起）' : '（点我查看）' }}</span>
    </button>
    <template v-if="showPre">
      <p v-if="mnemonic && mnemonic.kind === 'parts'" class="mb-2 text-sm text-gray-700 leading-relaxed dark:text-gray-300">
        🧠 拆词：{{ (mnemonic.parts ?? []).map(p => `${p.text}（${p.gloss}）`).join(' + ') }}
        <button
          v-if="!showPreAnswer"
          class="ml-1 text-xs text-sky-600 underline underline-offset-2 dark:text-sky-400"
          @click="showPreAnswer = true"
        >
          点击显示答案
        </button>
        <span v-else class="text-sky-700 font-bold dark:text-sky-300">→ 也就是「{{ card.meaning }}」</span>
      </p>
      <p v-else-if="mnemonic" class="mb-2 text-sm text-gray-700 leading-relaxed dark:text-gray-300">
        🧠 {{ mnemonic.body }}
      </p>
      <div v-if="wordInfo && wordInfo.examples.length > 0">
        <p
          v-for="(ex, i) in wordInfo.examples.slice(0, 2)"
          :key="i"
          class="mb-1 text-sm text-gray-600 leading-relaxed italic dark:text-gray-400"
        >
          🔗 “{{ ex }}”
          <span v-if="wordInfo.word !== card.word.toLowerCase()" class="text-xs text-gray-400 not-italic">（{{ wordInfo.word }} 的例句）</span>
        </p>
      </div>
      <p v-else-if="card.example" class="text-sm text-gray-600 leading-relaxed italic dark:text-gray-400">
        🔗 “{{ card.example }}”
      </p>
      <div v-if="wordInfo && wordInfo.synonyms.length > 0" class="mt-2">
        <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
          同义词（点词看意思）：
        </p>
        <ul class="space-y-1.5">
          <li v-for="(syn, i) in wordInfo.synonyms.slice(0, 8)" :key="i" class="text-sm">
            <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dots[i % dots.length]" />
            <button class="font-bold underline underline-offset-2 decoration-dotted" :class="colors[i % colors.length]" @click="toggleSyn(syn)">
              {{ syn }}
            </button>
            <span v-if="synonymPos(syn)" class="ml-1 text-gray-500 italic dark:text-gray-400" style="font-family: times">{{ synonymPos(syn) }}</span>
            <span v-if="expandedSyns.includes(syn.trim().toLowerCase()) && synonymMeaning(syn)" class="ml-2 text-gray-600 dark:text-gray-400">{{ synonymMeaning(syn) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </div>

  <!-- 自评后：例句、例句扩展、拓展词、巧记 -->
  <template v-else-if="phase === 'post'">
    <div
      v-if="related && ((wordInfo && wordInfo.synonyms.length > 0) || extras.length > 0)"
      class="mb-6 border border-teal-200 rounded-xl bg-teal-50 p-4 text-left dark:border-teal-800 dark:bg-teal-900/20"
      data-related
    >
      <div class="mb-2 text-sm text-teal-700 font-bold dark:text-teal-300">
        🔗 关联词<span class="ml-1 font-normal">（这一轮重点记）</span>
      </div>
      <template v-if="wordInfo && wordInfo.synonyms.length > 0">
        <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
          同义词
        </p>
        <ul class="mb-3 space-y-1.5">
          <li v-for="(syn, i) in wordInfo.synonyms.slice(0, 8)" :key="i" class="text-sm">
            <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dots[i % dots.length]" />
            <span class="font-bold" :class="colors[i % colors.length]">{{ syn }}</span>
            <span v-if="synonymPos(syn)" class="ml-1 text-gray-500 italic dark:text-gray-400" style="font-family: times">{{ synonymPos(syn) }}</span>
            <span v-if="synonymMeaning(syn)" class="ml-2 text-gray-600 dark:text-gray-400">{{ synonymMeaning(syn) }}</span>
          </li>
        </ul>
      </template>
      <template v-if="extras.length > 0">
        <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
          拓展词
        </p>
        <ul class="space-y-1.5">
          <li v-for="(ex, i) in extras" :key="i" class="text-sm leading-relaxed">
            <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dots[i % dots.length]" />
            <span class="font-bold" :class="colors[i % colors.length]">{{ ex.word }}</span>
            <span v-if="ex.pos" class="ml-1 text-gray-500 italic dark:text-gray-400" style="font-family: times">{{ ex.pos }}</span>
            <span class="ml-2 text-gray-600 dark:text-gray-400">{{ ex.meaning }}</span>
          </li>
        </ul>
      </template>
    </div>
    <p v-if="card.example" class="mb-6 text-center text-sm text-gray-500 italic dark:text-gray-400">
      {{ card.example }}
    </p>
    <div
      v-if="wordInfo && (wordInfo.examples.length > 0 || (wordInfo.synonyms.length > 0 && !related))"
      class="mb-6 border border-sky-200 rounded-xl bg-sky-50 p-4 text-left dark:border-sky-800 dark:bg-sky-900/20"
    >
      <div class="mb-2 text-sm text-sky-700 font-bold dark:text-sky-300">
        🔗 例句扩展
      </div>
      <p
        v-for="(ex, i) in wordInfo.examples.slice(0, 2)"
        :key="i"
        class="mb-1 text-sm text-gray-600 leading-relaxed italic dark:text-gray-400"
      >
        “{{ ex }}”
        <span v-if="wordInfo.word !== card.word.toLowerCase()" class="text-xs text-gray-400 not-italic">（{{ wordInfo.word }} 的例句）</span>
      </p>
      <div v-if="wordInfo.synonyms.length > 0 && !related" class="mt-2">
        <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
          同义词：
        </p>
        <ul class="space-y-1.5">
          <li v-for="(syn, i) in wordInfo.synonyms.slice(0, 8)" :key="i" class="text-sm">
            <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dots[i % dots.length]" />
            <button class="font-bold underline underline-offset-2 decoration-dotted" :class="colors[i % colors.length]" @click="toggleSyn(syn)">
              {{ syn }}
            </button>
            <span v-if="synonymPos(syn)" class="ml-1 text-gray-500 italic dark:text-gray-400" style="font-family: times">{{ synonymPos(syn) }}</span>
            <span v-if="expandedSyns.includes(syn.trim().toLowerCase()) && synonymMeaning(syn)" class="ml-2 text-gray-600 dark:text-gray-400">{{ synonymMeaning(syn) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div
      v-if="extras.length > 0 && !related"
      class="mb-6 border border-teal-200 rounded-xl bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20"
    >
      <div class="mb-2 text-sm text-teal-700 font-bold dark:text-teal-300">
        📚 拓展词汇 <span class="text-teal-500 font-normal">（{{ extras.length }} 个可学）</span>
      </div>
      <ul class="space-y-3">
        <li v-for="(ex, i) in extras" :key="i" class="text-sm leading-relaxed">
          <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dots[i % dots.length]" />
          <button class="font-bold underline underline-offset-2 decoration-dotted" :class="colors[i % colors.length]" @click="toggleExtra(i)">
            {{ ex.word }}
          </button>
          <span v-if="ex.pos" class="ml-1 text-sm text-gray-500 italic dark:text-gray-400" style="font-family: times">{{ ex.pos }}</span>
          <span v-if="expandedExtras.includes(i)" class="ml-2 text-gray-600 dark:text-gray-400">{{ ex.meaning }}</span>
        </li>
      </ul>
    </div>

    <div class="mb-6 border border-amber-200 rounded-xl bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <button class="flex items-center gap-2 text-sm text-amber-700 font-bold dark:text-amber-300" @click="showMnemonic = !showMnemonic">
        <i class="i-carbon-idea block" />
        {{ mnemonic ? mnemonic.title : '巧记提示' }}
        <span v-if="(lapses ?? 0) >= 2" class="text-xs text-amber-500 font-normal">（这个词你已记错 {{ lapses }} 次）</span>
      </button>
      <div v-if="showMnemonic" class="mt-2 text-sm text-amber-800 dark:text-amber-200">
        <template v-if="mnemonic">
          <p v-if="mnemonic.kind === 'curated'">
            {{ mnemonic.body }}
          </p>
          <template v-else-if="mnemonic.kind === 'parts'">
            <div class="mb-1 flex flex-wrap gap-2">
              <span v-for="(part, i) in mnemonic.parts" :key="i" class="rounded bg-amber-100 px-2 py-0.5 dark:bg-amber-900/50">{{ part.text }}<span class="text-amber-500">（{{ part.gloss }}）</span></span>
            </div>
            <p>{{ mnemonic.body }}</p>
          </template>
          <template v-else-if="mnemonic.kind === 'sentence'">
            <p class="mb-2 italic">
              “{{ mnemonic.body }}”
            </p>
            <button v-if="!showAnswer" class="text-xs underline underline-offset-2" @click="showAnswer = true">
              想不起来？点我看答案
            </button>
            <p v-else class="font-bold">
              答案：{{ mnemonic.answer }}
            </p>
          </template>
        </template>
        <p v-else>
          试试拆音节跟读几遍，再结合上面的例句联想画面，效果会更好。
        </p>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import type { MockQuestion } from '~/pages/mock/types'
import { multiSelectScore, showOptionsBox } from '~/pages/mock/types'

// 听力、阅读模考共用的一道题：题干、选择 / 判断、多选、填空、配对题的选项框、
// 交卷后的对错和正确答案。地图标注题的输入框两科不一样，由页面用 map-label 插槽放进来。
defineProps<{
  q: MockQuestion
  /** 同一部分的全部题（判断选项框只在题组第一题显示） */
  questions: MockQuestion[]
  index: number
  answer: string | undefined
  status: 'correct' | 'wrong' | 'partial' | 'unanswered'
  submitted: boolean
}>()
defineEmits<{
  answer: [value: string]
  toggle: [index: number]
}>()
</script>

<template>
  <div
    class="border rounded-xl p-4 dark:border-gray-700"
    :class="
      status === 'correct'
        ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
        : status === 'wrong'
          ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
          : status === 'partial'
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
            : 'border-gray-200 bg-white dark:bg-gray-800'
    "
  >
    <p
      class="mb-3 text-sm text-gray-800 font-medium dark:text-gray-200"
    >
      <span
        class="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-bold dark:bg-gray-700"
      >{{ q.id }}</span>
      {{ q.question }}
    </p>

    <div
      v-if="q.type === 'multiple-choice' || q.type === 'tfng'"
      class="space-y-2"
    >
      <button
        v-for="(opt, oi) in q.options"
        :key="oi"
        :disabled="submitted"
        class="block w-full border rounded-lg px-4 py-2 text-left text-sm"
        :class="
          submitted
            ? oi === q.answer
              ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
              : answer === String(oi)
                ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                : 'border-gray-200 opacity-60 dark:border-gray-700'
            : answer === String(oi)
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
              : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'
        "
        @click="$emit('answer', String(oi))"
      >
        {{ opt }}
      </button>
    </div>

    <!-- 多选题（Choose TWO） -->
    <div v-if="q.type === 'multi-select'" class="space-y-2">
      <button
        v-for="(opt, oi) in q.options"
        :key="oi"
        :disabled="submitted"
        class="block w-full border rounded-lg px-4 py-2 text-left text-sm"
        :class="
          submitted
            ? (q.answer as number[]).includes(oi)
              ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
              : (answer ?? '')
                .split(',')
                .includes(String(oi))
                ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                : 'border-gray-200 opacity-60 dark:border-gray-700'
            : (answer ?? '')
              .split(',')
              .includes(String(oi))
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
              : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'
        "
        @click="$emit('toggle', oi)"
      >
        <span
          class="mr-2 inline-block h-4 w-4 border rounded text-center text-xs leading-3"
          :class="
            (answer ?? '').split(',').includes(String(oi))
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-400'
          "
        >
          {{
            (answer ?? "").split(",").includes(String(oi))
              ? "✓"
              : ""
          }}
        </span>
        {{ opt }}
      </button>
    </div>

    <input
      v-if="q.type === 'fill-blank'"
      :disabled="submitted"
      :value="answer ?? ''"
      placeholder="输入答案"
      class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      @input="
        $emit('answer', ($event.target as HTMLInputElement).value)
      "
    >

    <!-- 配对/标注题的选项框（如 Q21-25 的 A-G，印在卷面上，作答时可见）；
         同一 Part 内连续且选项内容相同的题组只在首题出框（showOptionsBox） -->
    <div
      v-if="showOptionsBox(questions, index)"
      class="mb-2 border border-gray-200 rounded-lg bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="mb-1 font-bold">
        选项
      </p>
      <ul class="space-y-0.5">
        <li v-for="(opt, oi) in q.options" :key="oi">
          {{ String.fromCharCode(65 + oi) }}. {{ opt }}
        </li>
      </ul>
    </div>

    <slot name="map-label" />

    <p
      v-if="submitted && status !== 'correct'"
      class="mt-2 text-sm text-gray-500 dark:text-gray-400"
    >
      <span
        v-if="status === 'partial'"
        class="text-amber-700 font-bold"
      >部分正确（{{
        multiSelectScore(q, answer ?? "")
      }}
        / {{ Array.isArray(q.answer) ? q.answer.length : 1 }} 分）
        · </span>正确答案：{{
        q.type === "multi-select"
          ? (q.answer as number[])
            .map((i) => q.options?.[i])
            .join(" / ")
          : q.type === "fill-blank"
            ? Array.isArray(q.answer)
              ? q.answer.join(" / ")
              : q.answer
            : q.type === "map-label"
              ? q.answer
              : q.options?.[q.answer as number]
      }}
    </p>
  </div>
</template>

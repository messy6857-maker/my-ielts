<script setup lang="ts">
import type { AIGradeResult, AISpeakingResult } from '~/composables/useAISettings'
import type { GradingRecord } from '~/composables/useGradingHistory'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { onSyncApplied } from '~/composables/syncClient'
import { useAuth } from '~/composables/useAuth'
import { getGradingRecords } from '~/composables/useGradingHistory'

const records = ref<GradingRecord[]>([])
const expandedKey = ref<string | null>(null)
const { currentUser } = useAuth()

function load() {
  records.value = getGradingRecords(currentUser.value)
  expandedKey.value = null
}

onMounted(load)

// 拉取重载只写 localStorage、不通知本页时列表会滞后：订阅同步应用通知后重读
// （与模考记录页的做法一致）
const offSync = onSyncApplied(load)

// 退出/切换账号不导航、不触发拉取时列表会滞留旧账号数据：跟随身份变化重读
watch(currentUser, load)

onUnmounted(offSync)

function writingResult(r: GradingRecord): AIGradeResult | null {
  return r.kind === 'writing'
    ? (r.result as AIGradeResult)
    : null
}

function speakingResult(r: GradingRecord): AISpeakingResult | null {
  return r.kind === 'speaking'
    ? (r.result as AISpeakingResult)
    : null
}

function overall(r: GradingRecord): number | null {
  const s = r.result.scores as { overall?: unknown }
  return typeof s.overall === 'number' && Number.isFinite(s.overall)
    ? s.overall
    : null
}

function formatDate(ms: number): string {
  if (!ms)
    return '未知时间'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtScore(s: unknown): string {
  return typeof s === 'number' && Number.isFinite(s)
    ? s.toFixed(1)
    : '—'
}

function scoreColor(s: number | null): string {
  if (s === null)
    return ''
  if (s >= 7)
    return 'text-green-600 dark:text-green-400'
  if (s >= 6)
    return 'text-blue-600 dark:text-blue-400'
  if (s >= 5)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

function toggle(key: string) {
  expandedKey.value = expandedKey.value === key
    ? null
    : key
}

// 写作四项标签：存档 key 里不存 Task 1/2，TA 项统一用中性名「任务回应」
const writingLabels: Record<'ta' | 'cc' | 'lr' | 'gra', string> = {
  ta: '任务回应',
  cc: '连贯衔接',
  lr: '词汇资源',
  gra: '语法',
}
const speakingLabels: Record<'fluency' | 'lexical' | 'grammar', string> = {
  fluency: '流利连贯',
  lexical: '词汇资源',
  grammar: '语法',
}

function partLabel(part?: string): string {
  if (!part || part === 'na')
    return ''
  const n = part.replace(/^part/i, '')
  return /^[123]$/.test(n)
    ? `Part ${n}`
    : part
}

function rewrittenParagraphs(text: string): string[] {
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean)
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl text-gray-900 font-bold dark:text-white">
        📝 批改记录
      </h2>
    </div>
    <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
      本账号的 AI 作文批改与口语评分历史（按时间倒序）。旧版写作和口语评分保留现有记录。新版写作保留最近 30 份，最多占用 1 MiB。
    </p>

    <div
      v-if="!currentUser"
      class="border border-gray-200 rounded-2xl bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    >
      批改记录需要登录账号，<router-link to="/login" class="text-blue-600 dark:text-blue-400 hover:underline">
        去登录 →
      </router-link>
    </div>

    <div
      v-else-if="!records.length"
      class="border border-gray-200 rounded-2xl bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    >
      还没有批改记录，去写作或口语页做一次 AI 批改吧！
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="r in records"
        :key="r.key"
        class="border border-gray-200 rounded-xl bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          class="w-full flex items-center justify-between px-5 py-4 text-left"
          @click="toggle(r.key)"
        >
          <div>
            <div class="text-gray-900 font-medium dark:text-white">
              {{ r.kind === 'writing' ? '✍️ 写作批改' : '🎙 口语评分' }}
              <span v-if="r.kind === 'speaking' && partLabel(r.part)"> · {{ partLabel(r.part) }}</span>
              <span v-if="r.kind === 'writing' && r.version === 'v1'" class="ml-1 text-xs text-gray-400 font-normal">（旧版）</span>
            </div>
            <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(r.date) }}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="text-lg font-bold" :class="scoreColor(overall(r))">
                {{ overall(r) === null ? '—' : overall(r)!.toFixed(1) }}
              </div>
              <div class="text-xs text-gray-400">
                AI 预估总分
              </div>
            </div>
            <span class="text-xs text-gray-400">{{ expandedKey === r.key ? '▲' : '▼' }}</span>
          </div>
        </button>

        <div v-if="expandedKey === r.key" class="border-t border-gray-100 px-5 py-4 dark:border-gray-700">
          <template v-if="writingResult(r) as AIGradeResult | null">
            <div class="grid grid-cols-2 mb-4 gap-3 sm:grid-cols-4">
              <div
                v-for="(label, key) in writingLabels"
                :key="key"
                class="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-700/50"
              >
                <div class="text-2xl font-bold" :class="scoreColor(writingResult(r)!.scores[key])">
                  {{ fmtScore(writingResult(r)!.scores[key]) }}
                </div>
                <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ label }}
                </div>
              </div>
            </div>
            <div class="mb-4 space-y-3">
              <div v-for="(label, key) in writingLabels" :key="key">
                <div class="mb-1 text-sm font-bold dark:text-white">
                  {{ label }}
                </div>
                <p class="text-sm text-gray-600 leading-6 dark:text-gray-300">
                  {{ writingResult(r)!.comments?.[key] ?? '' }}
                </p>
              </div>
            </div>
            <div v-if="writingResult(r)!.advice" class="mb-4">
              <div class="mb-2 text-sm font-bold dark:text-white">
                📋 四项标准详细修改建议
              </div>
              <div class="space-y-2">
                <div
                  v-for="(label, key) in writingLabels"
                  :key="key"
                  class="border border-blue-100 rounded-lg bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-900/10"
                >
                  <div class="mb-1 text-xs text-blue-700 font-bold dark:text-blue-300">
                    {{ label }} · {{ fmtScore(writingResult(r)!.scores[key]) }}分
                  </div>
                  <p class="text-sm text-gray-700 leading-6 dark:text-gray-200">
                    {{ writingResult(r)!.advice?.[key] ?? '' }}
                  </p>
                </div>
              </div>
            </div>
            <div v-if="writingResult(r)!.corrections?.length" class="mb-4">
              <div class="mb-2 text-sm font-bold dark:text-white">
                ✏️ 逐句修改
              </div>
              <div class="space-y-2">
                <div
                  v-for="(c, i) in writingResult(r)!.corrections"
                  :key="i"
                  class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-700/50"
                >
                  <p class="text-gray-500 line-through dark:text-gray-400">
                    {{ c.original }}
                  </p>
                  <p class="mt-1 text-green-700 font-medium dark:text-green-400">
                    {{ c.fixed }}
                  </p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    💡 {{ c.reason }}
                  </p>
                </div>
              </div>
            </div>
            <div v-if="writingResult(r)!.rewritten" class="mb-4">
              <div class="mb-2 text-sm font-bold dark:text-white">
                📄 改写后全文
              </div>
              <div class="break-words rounded-lg bg-gray-50 p-4 text-sm leading-7 dark:bg-gray-700/50 dark:text-gray-200">
                <p
                  v-for="(para, pi) in rewrittenParagraphs(writingResult(r)!.rewritten!)"
                  :key="pi"
                  class="mb-3 last:mb-0"
                >
                  {{ para }}
                </p>
              </div>
            </div>
            <div class="rounded-lg bg-purple-50 p-4 text-sm leading-6 dark:bg-purple-900/20 dark:text-gray-200">
              <span class="font-bold">📈 提分建议：</span>{{ writingResult(r)!.suggestion }}
            </div>
          </template>

          <template v-if="speakingResult(r) as AISpeakingResult | null">
            <div class="grid grid-cols-3 mb-4 gap-2">
              <div
                v-for="(label, key) in speakingLabels"
                :key="key"
                class="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-700/50"
              >
                <div class="text-2xl font-bold" :class="scoreColor(speakingResult(r)!.scores[key])">
                  {{ fmtScore(speakingResult(r)!.scores[key]) }}
                </div>
                <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ label }}
                </div>
              </div>
            </div>
            <div class="mb-4 space-y-2">
              <div v-for="(label, key) in speakingLabels" :key="key">
                <div class="text-xs font-bold dark:text-white">
                  {{ label }}
                </div>
                <p class="text-xs text-gray-600 leading-5 dark:text-gray-300">
                  {{ speakingResult(r)!.comments?.[key] ?? '' }}
                </p>
              </div>
            </div>
            <div class="rounded-lg bg-purple-50 p-3 text-xs leading-5 dark:bg-purple-900/20 dark:text-gray-200">
              <span class="font-bold">📈 提分建议：</span>{{ speakingResult(r)!.suggestion }}
            </div>
            <p class="mt-2 text-xs text-gray-400">
              发音项无法从文字转写评估，请回放录音自行检查语调、重音和连读。
            </p>
          </template>
          <p class="mt-3 text-xs text-gray-400">
            AI 批改仅供练习参考，不是官方评分
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getMockHistory } from '../composables/useMockHistory'
import { formatDuration, useStudyTimer } from '../composables/useStudyTimer'
import { useCheckin, useWordSchedule } from '../composables/useSpacedRepetition'
import { useGoBack } from '../composables/useGoBack'
import {
  attemptModuleLabel,
  dateLabel,
  getAttempts,
  knownRate,
  mergeCounts,
  sumCount,
  todayStr,
} from '../composables/useStats'
import type { AttemptCount, AttemptRecord } from '../composables/useStats'

const { goBack } = useGoBack('/')
const { modules } = useProgress()
const { mistakes, totalCount: mistakeTotal } = useMistakes()
const { dates: checkinDates, streak } = useCheckin()
const { schedules } = useWordSchedule()
const { currentUser } = useAuth()
const timer = useStudyTimer()

const attempts = ref<AttemptRecord>({})
const mockHistory = ref(getMockHistory())

function load() {
  attempts.value = getAttempts()
  mockHistory.value = getMockHistory()
  // 只读已持久化的当日累计（不启动计时），与自测页结算后写入的值一致
  timer.refresh()
}
load()
watch(currentUser, load)

function percent(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

const progressShown = computed(() =>
  modules.value.filter(m => m.total > 0 || m.done > 0),
)

// ---- 自测正确率（按日累计，上线后开始） ----
const attemptModules = computed(() => {
  const map = new Map<string, AttemptCount>()
  for (const day of Object.values(attempts.value)) {
    for (const [ns, c] of Object.entries(day)) {
      const prev = map.get(ns)
      map.set(ns, prev ? mergeCounts([prev, c]) : { ...c })
    }
  }
  return [...map.entries()].map(([ns, c]) => ({
    ns,
    label: attemptModuleLabel(ns),
    ...c,
    total: sumCount(c),
    rate: knownRate(c),
  })).sort((a, b) => b.total - a.total)
})

const totalAttempts = computed(() => mergeCounts(
  attemptModules.value.map(m => ({ known: m.known, vague: m.vague, unknown: m.unknown })),
))

// 最近 14 天每天自评总数
const dailyAttempts = computed(() => {
  const days = []
  for (let offset = 13; offset >= 0; offset--) {
    const key = todayStr(offset)
    const dayRec = attempts.value[key] || {}
    const total = Object.values(dayRec).reduce((s, c) => s + sumCount(c), 0)
    days.push({ key, label: dateLabel(offset), total })
  }
  return days
})
const maxDailyAttempts = computed(() => Math.max(1, ...dailyAttempts.value.map(d => d.total)))

// ---- 词汇 SM-2 现状 ----
const vocabStats = computed(() => {
  const list = Object.values(schedules.value)
  const now = Date.now()
  return {
    learned: list.length,
    due: list.filter(s => s.dueAt > 0 && s.dueAt <= now).length,
    stable: list.filter(s => s.reps >= 3).length,
    lapses: list.reduce((s, w) => s + w.lapses, 0),
  }
})

// ---- 模考 ----
function mockStats(kind: 'listening' | 'reading') {
  const list = mockHistory.value.filter(m => m.kind === kind)
  const score = list.reduce((s, m) => s + m.score, 0)
  const total = list.reduce((s, m) => s + m.total, 0)
  const band = list.length > 0
    ? (list.reduce((s, m) => s + m.band, 0) / list.length).toFixed(1)
    : null
  return {
    count: list.length,
    accuracy: total > 0 ? Math.round((score / total) * 100) : null,
    band,
    latest: list[0] || null,
  }
}
const listeningMock = computed(() => mockStats('listening'))
const readingMock = computed(() => mockStats('reading'))

const mockTrend = computed(() => {
  const list = [...mockHistory.value]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12)
  return list.map(m => ({
    ...m,
    accuracy: m.total > 0 ? Math.round((m.score / m.total) * 100) : 0,
    shortDate: `${new Date(m.date).getMonth() + 1}/${new Date(m.date).getDate()}`,
  }))
})

// ---- 错题 ----
const topMistakes = computed(() =>
  [...mistakes.value].sort((a, b) => b.count - a.count).slice(0, 5),
)

// ---- 打卡 ----
const last14Checkin = computed(() => {
  const out = []
  for (let offset = 13; offset >= 0; offset--) {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    out.push({ label: dateLabel(offset), checked: checkinDates.value.includes(todayStr(offset)) })
  }
  return out
})
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-screen-xl">
      <button class="mb-4 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" @click="goBack">
        ← 返回
      </button>
      <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        📊 学习数据统计
      </h1>
      <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {{ currentUser ? `当前账号：${currentUser}` : '游客模式' }} · 按当前账号统计，换账号后数据会切换
      </p>

      <!-- 今日概览 -->
      <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            今日自测学习时长
          </p>
          <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ formatDuration(timer.dailySeconds.value) }}
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            目标 2 小时 · {{ timer.dailySeconds.value >= timer.dailyGoal ? '今日目标已达成 🎉' : `还差 ${formatDuration(timer.dailyGoal - timer.dailySeconds.value)}` }}
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            连续打卡
          </p>
          <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ streak }} 天
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            累计打卡 {{ checkinDates.length }} 天
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            错词本
          </p>
          <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ mistakeTotal }} 个
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            <RouterLink to="/mistakes" class="text-blue-600 hover:underline dark:text-blue-400">
              去复习 →
            </RouterLink>
          </p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            模考次数
          </p>
          <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ mockHistory.length }} 次
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            听力 {{ listeningMock.count }} 次 · 阅读 {{ readingMock.count }} 次
          </p>
        </div>
      </div>

      <!-- 各模块进度 -->
      <section class="mb-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
          各模块进度
        </h2>
        <div v-if="progressShown.length" class="grid gap-4 md:grid-cols-2">
          <div v-for="m in progressShown" :key="m.module">
            <div class="mb-1 flex items-center justify-between text-sm">
              <span class="font-medium text-gray-700 dark:text-gray-300">{{ m.label }}</span>
              <span class="text-gray-500 dark:text-gray-400">{{ m.done }} / {{ m.total }}（{{ percent(m.done, m.total) }}%）</span>
            </div>
            <div class="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div class="h-2.5 rounded-full bg-blue-600" :style="{ width: `${percent(m.done, m.total)}%` }" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-500 dark:text-gray-400">
          还没有模块进度记录，做一轮自测卡片或练习后这里就会有数据。
        </p>
      </section>

      <!-- 自测正确率 + 每日量 -->
      <section class="mb-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
          自测正确率
        </h2>
        <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
          按每次自评计：认识率 = 认识次数 / 全部自评次数。按日累计从本功能上线后开始，此前的自评没有按日记录，无法还原。
        </p>
        <div v-if="attemptModules.length" class="mb-6 space-y-3">
          <div v-for="m in attemptModules" :key="m.ns" class="flex items-center gap-3 text-sm">
            <span class="w-24 shrink-0 font-medium text-gray-700 dark:text-gray-300">{{ m.label }}</span>
            <div class="h-2.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
              <div class="h-2.5 rounded-full bg-green-500" :style="{ width: `${m.rate ?? 0}%` }" />
            </div>
            <span class="w-32 shrink-0 text-right text-gray-500 dark:text-gray-400">
              {{ m.rate ?? '—' }}% · {{ m.known }}认识 / {{ m.vague }}模糊 / {{ m.unknown }}不认识
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            合计自评 {{ totalAttempts.known + totalAttempts.vague + totalAttempts.unknown }} 次，认识率 {{ knownRate(totalAttempts) ?? '—' }}%。
          </p>
        </div>
        <p v-else class="mb-6 text-sm text-gray-500 dark:text-gray-400">
          还没有自评记录，做一轮自测卡片后这里就会开始累计。
        </p>
        <h3 class="mb-3 text-sm font-bold text-gray-900 dark:text-white">
          最近 14 天每天自评次数
        </h3>
        <div class="flex items-end gap-1.5">
          <div v-for="d in dailyAttempts" :key="d.key" class="flex flex-1 flex-col items-center gap-1">
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ d.total > 0 ? d.total : '' }}</span>
            <div
              class="w-full rounded-t bg-blue-500"
              :style="{ height: `${d.total > 0 ? Math.max(6, Math.round((d.total / maxDailyAttempts) * 80)) : 2}px` }"
              :title="`${d.label}：${d.total} 次`"
            />
            <span class="text-xs text-gray-400">{{ d.label }}</span>
          </div>
        </div>
      </section>

      <!-- 词汇掌握 + 模考 -->
      <div class="mb-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            词汇掌握（SM-2 现状）
          </h2>
          <div class="grid grid-cols-2 gap-4 text-center">
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ vocabStats.learned }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                已学词（至少自评过 1 次）
              </p>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ vocabStats.due }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                到期待复习
              </p>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ vocabStats.stable }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                已稳定（累计答对 ≥3 次，模糊不打断）
              </p>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ vocabStats.lapses }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                累计记错次数
              </p>
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            模考成绩
          </h2>
          <div class="space-y-3 text-sm">
            <p class="text-gray-700 dark:text-gray-300">
              听力：{{ listeningMock.count }} 次 ·
              平均正确率 {{ listeningMock.accuracy ?? '—' }}% ·
              平均分 {{ listeningMock.band ?? '—' }}
              <span v-if="listeningMock.latest"> · 最近 {{ listeningMock.latest.label }} {{ listeningMock.latest.score }}/{{ listeningMock.latest.total }}</span>
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              阅读：{{ readingMock.count }} 次 ·
              平均正确率 {{ readingMock.accuracy ?? '—' }}% ·
              平均分 {{ readingMock.band ?? '—' }}
              <span v-if="readingMock.latest"> · 最近 {{ readingMock.latest.label }} {{ readingMock.latest.score }}/{{ readingMock.latest.total }}</span>
            </p>
          </div>
          <div v-if="mockTrend.length" class="mt-4 flex items-end gap-1.5">
            <div v-for="m in mockTrend" :key="m.id + m.date" class="flex flex-1 flex-col items-center gap-1">
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ m.accuracy }}%</span>
              <div
                class="w-full rounded-t"
                :class="m.kind === 'listening' ? 'bg-purple-500' : 'bg-teal-500'"
                :style="{ height: `${Math.max(4, m.accuracy)}px` }"
                :title="`${m.label}（${m.kind === 'listening' ? '听力' : '阅读'}）：${m.score}/${m.total}`"
              />
              <span class="text-xs text-gray-400">{{ m.shortDate }}</span>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-gray-500 dark:text-gray-400">
            还没有模考记录，做一套限时模考后这里就会有成绩曲线。
          </p>
          <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            柱子颜色：紫色 = 听力，青色 = 阅读；按时间从左到右，最近 12 次。
          </p>
        </section>
      </div>

      <!-- 错题 + 打卡 -->
      <div class="grid gap-6 pb-8 lg:grid-cols-2">
        <section class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            错得最多的词
          </h2>
          <ul v-if="topMistakes.length" class="space-y-2 text-sm">
            <li v-for="m in topMistakes" :key="m.key" class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">{{ m.title }}</span>
              <span class="text-gray-500 dark:text-gray-400">记错 {{ m.count }} 次</span>
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">
            错词本是空的，继续保持。
          </p>
          <p class="mt-4 text-sm">
            <RouterLink to="/mistakes" class="text-blue-600 hover:underline dark:text-blue-400">
              打开错词本复习 →
            </RouterLink>
          </p>
        </section>

        <section class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            打卡（最近 14 天）
          </h2>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="d in last14Checkin"
              :key="d.label"
              class="flex flex-col items-center gap-1"
            >
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                :class="d.checked ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'"
              >
                {{ d.checked ? '✓' : '' }}
              </span>
              <span class="text-xs text-gray-400">{{ d.label }}</span>
            </div>
          </div>
          <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
            数据说明：学习时长只统计自测卡片页（精听、阅读、写作等不计入计时）；模考正确率是真实得分；自测正确率按每次自评计。
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

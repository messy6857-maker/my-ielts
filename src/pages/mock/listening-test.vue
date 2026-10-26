<script setup lang="ts">
import { useMockSession } from '../../composables/useMockSession'
import { mockTestList } from './registry'
import { formatCountdown } from './types'
const router = useRouter()
const activePart = ref(0)
const audioEl = ref<HTMLAudioElement | null>(null)

// audio 的 ref 写在 v-for 里，Vue 会收成数组；逐个暂停
function pauseAllAudio() {
  const els = audioEl.value as unknown as HTMLAudioElement | HTMLAudioElement[] | null
  if (Array.isArray(els))
    els.forEach(el => el?.pause?.())
  else
    els?.pause?.()
}

const { testId, testPair, loading, loadError, started, timeLeft, answers, submitted,
  scoredTotal, correctCount, band, loadTest, startTest, submit, setAnswer, toggleMultiSelect, questionStatus } = useMockSession('listening', () => {
  activePart.value = 0
}, pauseAllAudio)
const test = computed(() => testPair.value?.listening)
onUnmounted(() => document.body.classList.remove('listening-sticky-page'))

// ---------- 地图图片 sticky ----------
// App 内容容器默认 overflow-y-auto 会自己滚动，导致 sticky 相对它失效；
// 本页挂载时强制它 overflow 可见，让 window 成为滚动容器，sticky 即可靠生效。
// sticky 是文档流内定位，不会像 fixed 那样遮挡 Part 切换按钮。
onMounted(() => {
  document.body.classList.add('listening-sticky-page')
})

// ---------- 图片全屏查看器（双指缩放 / 拖动 / 双击切换） ----------
const zoomImage = ref<string | null>(null)
const zoomScale = ref(1)
const zoomPos = ref({ x: 0, y: 0 })

function openZoom(src: string) {
  zoomImage.value = src
  zoomScale.value = 1
  zoomPos.value = { x: 0, y: 0 }
}

function closeZoom() {
  zoomImage.value = null
}

function adjustZoom(delta: number) {
  zoomScale.value = Math.min(4, Math.max(1, +(zoomScale.value + delta).toFixed(2)))
  if (zoomScale.value === 1)
    zoomPos.value = { x: 0, y: 0 }
}

function toggleZoom() {
  if (zoomScale.value > 1.5) {
    zoomScale.value = 1
    zoomPos.value = { x: 0, y: 0 }
  }
  else {
    zoomScale.value = 2.5
  }
}

let pinchBase = 0
let pinchScale = 1
let panBase: { x: number, y: number } | null = null

function onZoomTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    const t1 = e.touches[0]
    const t2 = e.touches[1]
    pinchBase = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    pinchScale = zoomScale.value
    panBase = null
  }
  else if (e.touches.length === 1 && zoomScale.value > 1) {
    const t = e.touches[0]
    panBase = { x: t.clientX - zoomPos.value.x, y: t.clientY - zoomPos.value.y }
  }
}

function onZoomTouchMove(e: TouchEvent) {
  if (e.touches.length === 2 && pinchBase > 0) {
    e.preventDefault()
    const t1 = e.touches[0]
    const t2 = e.touches[1]
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    zoomScale.value = Math.min(4, Math.max(1, +(pinchScale * dist / pinchBase).toFixed(2)))
    if (zoomScale.value === 1)
      zoomPos.value = { x: 0, y: 0 }
  }
  else if (e.touches.length === 1 && panBase && zoomScale.value > 1) {
    e.preventDefault()
    const t = e.touches[0]
    zoomPos.value = { x: t.clientX - panBase.x, y: t.clientY - panBase.y }
  }
}

function onZoomTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2)
    pinchBase = 0
  if (e.touches.length === 0)
    panBase = null
}

function onZoomWheel(e: WheelEvent) {
  e.preventDefault()
  adjustZoom(e.deltaY < 0 ? 0.25 : -0.25)
}

</script>

<template>
  <div class="mx-auto max-w-5xl px-4 pt-6 2xl:px-0">
    <div v-if="loading" class="py-20 text-center text-gray-500">
      加载中…
    </div>
    <div v-else-if="loadError" class="py-20 text-center">
      <p class="mb-4 text-4xl">
😢
</p>
      <p class="mb-4 text-gray-500 dark:text-gray-400">
题目加载失败，可能是网络抖动
</p>
      <button
        class="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700"
        @click="loadTest"
      >
        🔄 重新加载
      </button>
    </div>
    <template v-else-if="test">
    <!-- 开始屏：点开始才计时 -->
    <div v-if="!started" class="mx-auto max-w-2xl py-16 text-center">
      <p class="mb-4 text-5xl">
🎧
</p>
      <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        {{ test.title }}
      </h2>
      <p class="mb-2 text-gray-500 dark:text-gray-400">
        共 {{ test.parts.length }} 个 Part · {{ scoredTotal }} 道题 · 限时 {{ Math.round(test.timeLimit / 60) }} 分钟
      </p>
      <p class="mb-8 text-sm text-gray-400 dark:text-gray-500">
        点击开始后计时启动，时间到自动交卷
      </p>
      <div class="mb-6 flex items-center justify-center gap-3">
        <span class="text-sm text-gray-500 dark:text-gray-400">选择套题：</span>
        <select
          :value="testId"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          @change="router.push({ path: '/mock/listening-test', query: { test: ($event.target as HTMLSelectElement).value } })"
        >
          <option v-for="t in mockTestList" :key="t.id" :value="t.id">
            {{ t.label }}
          </option>
        </select>
      </div>
      <button
        class="rounded-xl bg-blue-600 px-10 py-3 text-lg font-bold text-white hover:bg-blue-700"
        @click="startTest"
      >
        ▶ 开始测试
      </button>
    </div>
    <div v-else>
    <div class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          🎧 {{ test.title }}
        </h2>
        <select
          :value="testId"
          class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
          @change="router.push({ path: '/mock/listening-test', query: { test: ($event.target as HTMLSelectElement).value } })"
        >
          <option v-for="t in mockTestList" :key="t.id" :value="t.id">
            {{ t.label }}
          </option>
        </select>
      </div>
      <div class="flex items-center gap-4">
        <span
          class="rounded-lg px-4 py-2 font-mono text-xl font-bold"
          :class="timeLeft < 300 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'"
        >
          ⏱ {{ formatCountdown(timeLeft) }}
        </span>
        <button
          v-if="!submitted"
          class="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-700"
          @click="submit"
        >
          交卷
        </button>
      </div>
    </div>

    <div v-if="submitted" class="mb-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p class="mb-2 text-5xl font-black text-blue-600 dark:text-blue-400">
        {{ band.toFixed(1) }}
      </p>
      <p class="text-gray-600 dark:text-gray-400">
        答对 {{ correctCount }} / 40 题
      </p>
    </div>

    <div v-if="!submitted" class="mb-6 flex gap-2">
      <button
        v-for="(_, i) in test.parts"
        :key="i"
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="activePart === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
        @click="activePart = i"
      >
        Part {{ i + 1 }}
      </button>
    </div>

    <div v-for="(p, pi) in test.parts" v-show="submitted || activePart === pi" :key="pi" class="mb-8">
      <article class="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          {{ p.title }}
        </h3>
        <audio
          v-if="!submitted"
          ref="audioEl"
          controls
          :src="p.audio"
          class="w-full"
        />
        <p v-if="submitted && p.transcript" class="mt-4 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">
          {{ p.transcript }}
        </p>
      </article>

      <!-- 有图的 Part：图片吸顶，滑到题目时一直看得见 -->
      <div :class="p.image ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6' : ''">
        <div v-if="p.image" class="sticky top-20 z-10 mb-6 lg:mb-0 lg:top-24">
          <div class="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <img
              :src="p.image"
              alt="题目示意图"
              class="w-full cursor-zoom-in rounded-lg lg:max-h-[70vh] lg:object-contain"
              @click="openZoom(p.image)"
            >
            <button
              class="mt-2 w-full rounded-lg bg-gray-100 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              @click="openZoom(p.image)"
            >
              🔍 点击放大查看
            </button>
          </div>
        </div>
        <div>
          <div class="space-y-4">
        <div
          v-for="q in p.questions"
          :key="q.id"
          class="rounded-xl border p-4 dark:border-gray-700"
          :class="questionStatus(q) === 'correct' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : questionStatus(q) === 'wrong' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 bg-white dark:bg-gray-800'"
        >
          <p class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
            <span class="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-bold dark:bg-gray-700">{{ q.id }}</span>
            {{ q.question }}
          </p>

          <div v-if="q.type === 'multiple-choice' || q.type === 'tfng'" class="space-y-2">
            <button
              v-for="(opt, oi) in q.options"
              :key="oi"
              :disabled="submitted"
              class="block w-full rounded-lg border px-4 py-2 text-left text-sm"
              :class="submitted
                ? oi === q.answer
                  ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
                  : answers[q.id] === String(oi)
                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                    : 'border-gray-200 opacity-60 dark:border-gray-700'
                : answers[q.id] === String(oi)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'"
              @click="setAnswer(q.id, String(oi))"
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
              class="block w-full rounded-lg border px-4 py-2 text-left text-sm"
              :class="submitted
                ? (q.answer as number[]).includes(oi)
                  ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
                  : (answers[q.id] ?? '').split(',').includes(String(oi))
                    ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                    : 'border-gray-200 opacity-60 dark:border-gray-700'
                : (answers[q.id] ?? '').split(',').includes(String(oi))
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'"
              @click="toggleMultiSelect(q.id, oi)"
            >
              <span class="mr-2 inline-block h-4 w-4 rounded border text-center text-xs leading-3" :class="(answers[q.id] ?? '').split(',').includes(String(oi)) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-400'">
                {{ (answers[q.id] ?? '').split(',').includes(String(oi)) ? '✓' : '' }}
              </span>
              {{ opt }}
            </button>
          </div>

          <input
            v-if="q.type === 'fill-blank'"
            :disabled="submitted"
            :value="answers[q.id] ?? ''"
            placeholder="输入答案"
            class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value)"
          >

          <input
            v-if="q.type === 'map-label'"
            :disabled="submitted"
            :value="answers[q.id] ?? ''"
            placeholder="输入字母 A-H"
            maxlength="1"
            class="w-24 rounded-lg border border-gray-300 px-4 py-2 text-center text-sm uppercase dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @input="setAnswer(q.id, ($event.target as HTMLInputElement).value)"
          >

          <p v-if="submitted && questionStatus(q) !== 'correct'" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            正确答案：{{ q.type === 'fill-blank' ? (Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer) : q.type === 'map-label' ? q.answer : q.options?.[q.answer as number] }}
          </p>
        </div>
        </div>
      </div>
    </div>
  </div>

    <div class="pb-12 text-center">
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="router.push('/listening')"
      >
        ← 返回听力
      </button>
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="router.push('/mock/history')"
      >
        📊 做题记录
      </button>
    </div>
    </div>
    </template>
  </div>

  <!-- 图片全屏查看器：双指缩放 / 单指拖动 / 双击切换 / 滚轮缩放 -->
  <div v-if="zoomImage" class="fixed inset-0 z-50 flex flex-col bg-black/95">
    <div class="flex items-center justify-between gap-2 p-3">
      <div class="flex items-center gap-2">
        <button
          class="h-9 w-9 rounded-full bg-white/15 text-xl font-bold text-white active:bg-white/30"
          @click="adjustZoom(-0.5)"
        >
−
</button>
        <span class="w-14 text-center text-sm text-white/80">{{ Math.round(zoomScale * 100) }}%</span>
        <button
          class="h-9 w-9 rounded-full bg-white/15 text-xl font-bold text-white active:bg-white/30"
          @click="adjustZoom(0.5)"
        >
＋
</button>
      </div>
      <span class="hidden text-xs text-white/50 sm:inline">双指缩放 · 拖动平移 · 双击放大/还原</span>
      <button
        class="rounded-full bg-white/15 px-4 py-2 text-sm text-white active:bg-white/30"
        @click="closeZoom"
      >
✕ 关闭
</button>
    </div>
    <div
      class="flex flex-1 touch-none items-center justify-center overflow-hidden"
      @touchstart="onZoomTouchStart"
      @touchmove="onZoomTouchMove"
      @touchend="onZoomTouchEnd"
      @wheel="onZoomWheel"
      @dblclick="toggleZoom"
    >
      <img
        :src="zoomImage"
        alt="题目示意图"
        class="max-h-full max-w-full rounded-lg"
        :style="{ transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})` }"
        draggable="false"
      >
    </div>
  </div>
</template>

<style>
/* 听力模考页：App 的两层内容容器改为 overflow 可见，让 window 成为滚动容器，
   图片的 sticky 定位才能可靠生效（sticky 相对最近的滚动祖先） */
body.listening-sticky-page #app > div.flex {
  overflow: visible;
}
body.listening-sticky-page #app > div.flex > div.overflow-y-auto {
  overflow-y: visible;
}
</style>

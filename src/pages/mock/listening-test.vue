<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useExamRecovery } from '../../composables/useExamRecovery'

import { loadMockTest, mockTestList } from './registry'
import type { MockTestPair } from './registry'
import {
  bandScore,
  formatCountdown,
  isCorrect,
  multiSelectScore,
} from './types'
import type { MockQuestion } from './types'
import { saveMockRecord } from '~/composables/useMockHistory'
import { resolveMediaUrl } from '~/composables/useAudio'
import { useGoBack } from '~/composables/useGoBack'
import ListeningTabs from '~/components/ListeningTabs.vue'

const mediaError = ref('')
const mediaRoot = ref<HTMLElement | null>(null)
function retryMedia() {
  mediaError.value = ''
  mediaRoot.value?.querySelectorAll('audio').forEach(audio => audio.load())
}

const { goBack } = useGoBack('/listening')

const router = useRouter()
const route = useRoute()

const testId = computed(() => (route.query.test as string) || 'cam21-test1')
const testPair = ref<MockTestPair | null>(null)
const test = computed(() => testPair.value?.listening)
const loading = ref(true)
const loadError = ref(false)
const started = ref(false) // 点"开始测试"后才计时
const timeLeft = ref(0)
const answers = ref<Record<string, string>>({})
const submitted = ref(false)
const activePart = ref(0)
const audioEl = ref<HTMLAudioElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let loadSeq = 0
let endAt = 0

function pauseExam() {
  if (endAt)
    timeLeft.value = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  endAt = 0
  if (timer)
    clearInterval(timer)
  timer = null
  pauseAllAudio()
}
// 阻断解除后恢复计时：按暂停时冻结的 timeLeft 重建墙钟锚点与 interval
function startTimer() {
  if (timer)
    clearInterval(timer)
  // 墙钟锚点：后台节流导致 tick 稀疏时，剩余时间仍按真实时间重算
  endAt = Date.now() + timeLeft.value * 1000
  timer = setInterval(() => {
    timeLeft.value = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
    if (timeLeft.value <= 0)
      submit()
  }, 1000)
}
const recovery = useExamRecovery({
  kind: 'listening',
  testId,
  started,
  submitted,
  answers,
  timeLeft,
  pause: pauseExam,
  remaining: () =>
    endAt
      ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      : timeLeft.value,
  extra: () => ({ active: activePart.value }),
  onUnblocked: startTimer,
})

// audio 的 ref 写在 v-for 里，Vue 会收成数组；逐个暂停
function pauseAllAudio() {
  const els = audioEl.value as unknown as
    | HTMLAudioElement
    | HTMLAudioElement[]
    | null
  if (Array.isArray(els))
    els.forEach(el => el?.pause?.())
  else els?.pause?.()
}

// 异步加载选中的套题（按需加载，不一次全载入）
// loadSeq 防止快速切换时旧的加载覆盖新的；try/finally 保证 loading 一定复位
async function loadTest() {
  if (recovery.blocked.value) {
    // 被阻断时不允许切题：把 URL 换回进行中的套题，保持内容与 URL 一致，
    // 且不碰 started/答案（暂停中的考试保持原样）。
    const active = recovery.activeTestId()
    if (active && testId.value !== active)
      router.replace({ query: { ...route.query, test: active } })
    return
  }
  recovery.save()
  pauseExam()
  started.value = false
  // 非法 test id（如手写 URL / 过期书签）不再静默 fallback：把 URL 参数规范化为默认套题，
  // 与实际加载内容一致，书签也被修复；replace 不产生多余历史记录，随后 watcher 以新 id 重载
  if (!mockTestList.some(t => t.id === testId.value)) {
    router.replace({ query: { ...route.query, test: 'cam21-test1' } })
    return
  }
  const seq = ++loadSeq
  loading.value = true
  loadError.value = false
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
  try {
    const pair = await loadMockTest(testId.value)
    if (seq !== loadSeq)
      return // 已被更新的加载取代
    if (recovery.blocked.value) {
      // 加载途中被阻断：不应用新套题，把 URL 换回进行中的套题
      const active = recovery.activeTestId()
      if (active && testId.value !== active)
        router.replace({ query: { ...route.query, test: active } })
      return
    }
    testPair.value = pair
    answers.value = {}
    submitted.value = false
    activePart.value = 0
    started.value = false
    recovery.refresh()
  }
  catch {
    if (seq !== loadSeq)
      return
    loadError.value = true
  }
  finally {
    if (seq === loadSeq)
      loading.value = false
  }
}

// 点"开始测试"才重置状态并开始计时
function startTest() {
  if (recovery.mismatch())
    return
  if (!testPair.value || started.value)
    return
  // 已交卷的草稿不再续做：按全新测试开始
  const saved = recovery.draft.value && !recovery.draft.value.submitted
    ? recovery.draft.value
    : null
  recovery.begin()
  timeLeft.value = saved
    ? Math.min(Math.max(0, saved.timeLeft), testPair.value.listening.timeLimit)
    : testPair.value.listening.timeLimit
  answers.value = saved?.answers ?? {}
  submitted.value = false
  activePart.value = saved?.extra?.active ?? 0
  started.value = true
  recovery.save()
  startTimer()
}

// 放弃当前草稿并重新开始：清掉本会话草稿后立刻全新开考，
// 避免清完仍留在开始屏、下次刷新又被其他页签快照顶回来。
function discardDraftAndStart() {
  if (!window.confirm('放弃当前草稿并重新开始？草稿删除后无法恢复。'))
    return
  recovery.clear()
  startTest()
}

onMounted(loadTest)
watch(testId, loadTest)

// 切 Part 时停掉上一个 Part 的录音：v-show 只隐藏不暂停，
// 否则录音会在看不见的地方继续放、且无法暂停。
watch(activePart, () => pauseAllAudio())

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
  document.body.classList.remove('listening-sticky-page')
})

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
  zoomScale.value = Math.min(
    4,
    Math.max(1, +(zoomScale.value + delta).toFixed(2)),
  )
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
let panBase: { x: number; y: number } | null = null

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
    zoomScale.value = Math.min(
      4,
      Math.max(1, +((pinchScale * dist) / pinchBase).toFixed(2)),
    )
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

const allQuestions = computed<MockQuestion[]>(
  () => test.value?.parts.flatMap(p => p.questions) ?? [],
)

// 满分题数（多选题按答案个数计）
const scoredTotal = computed(() =>
  allQuestions.value.reduce(
    (s, q) =>
      s
      + (q.type === 'multi-select' && Array.isArray(q.answer)
        ? q.answer.length
        : 1),
    0,
  ),
)

const correctCount = computed(() => {
  if (!submitted.value)
    return 0
  return allQuestions.value.reduce((sum, q) => {
    const ans = answers.value[q.id] ?? ''
    return (
      sum
      + (q.type === 'multi-select'
        ? multiSelectScore(q, ans)
        : isCorrect(q, ans)
          ? 1
          : 0)
    )
  }, 0)
})

const band = computed(() => bandScore(correctCount.value, scoredTotal.value))

function setAnswer(qid: string, val: string) {
  if (recovery.mismatch())
    return
  if (!submitted.value)
    answers.value[qid] = val
}

function toggleMultiSelect(qid: string, idx: number) {
  if (recovery.mismatch())
    return
  if (submitted.value)
    return
  const current = new Set((answers.value[qid] ?? '').split(',').filter(Boolean))
  const s = String(idx)
  if (current.has(s)) {
    current.delete(s)
  }
  else {
    // 多选题最多选该题答案个数（Choose TWO 即 2 个），多出的拒绝加入，防止全选刷分
    const q = allQuestions.value.find(q => q.id === qid)
    const max
      = q && Array.isArray(q.answer) ? q.answer.length : Number.POSITIVE_INFINITY
    if (current.size >= max)
      return
    current.add(s)
  }
  answers.value[qid] = [...current].join(',')
}

// 切换套题：已开始且未交卷且已有答案时先确认，避免误触丢进度；
// select 是 :value 绑定，取消时 testId 未变，选择框会自动复原
const hasAnswers = computed(() =>
  Object.values(answers.value).some(v => v.trim() !== ''),
)
function onTestChange(e: Event) {
  const target = (e.target as HTMLSelectElement).value
  if (started.value && !submitted.value && hasAnswers.value) {
    if (!window.confirm('切换套题将暂停并保留当前作答草稿，确定吗？'))
      return
  }

  router.push({ path: '/mock/listening-test', query: { test: target } })
}

function questionStatus(
  q: MockQuestion,
): 'correct' | 'wrong' | 'partial' | 'unanswered' {
  if (!submitted.value)
    return 'unanswered'
  const userAns = answers.value[q.id] ?? ''
  if (!userAns)
    return 'unanswered'
  if (q.type === 'multi-select') {
    const score = multiSelectScore(q, userAns)
    const max = Array.isArray(q.answer) ? q.answer.length : 1
    if (score === max)
      return 'correct'
    return score > 0 ? 'partial' : 'wrong'
  }
  return isCorrect(q, userAns) ? 'correct' : 'wrong'
}
onBeforeRouteLeave(
  () =>
    useAuth().currentUser.value !== recovery.owner.value
    || !started.value
    || submitted.value
    || window.confirm('尚未交卷，离开将暂停计时并保留本机草稿，确定吗？'),
)
function submit() {
  if (recovery.mismatch())
    return
  if (submitted.value)
    return
  submitted.value = true
  if (timer)
    clearInterval(timer)
  pauseAllAudio()
  // 保存做题记录
  const qs = allQuestions.value
  const total = qs.reduce(
    (s, q) =>
      s
      + (q.type === 'multi-select' && Array.isArray(q.answer)
        ? q.answer.length
        : 1),
    0,
  )
  const saved = saveMockRecord({
    id: testId.value,
    label: testPair.value?.label ?? testId.value,
    kind: 'listening',
    score: correctCount.value,
    total,
    band: band.value,
  })
  recovery.markSubmitted()
  if (saved)
    recovery.clear()
  else
    recovery.error.value = '交卷记录保存失败，成绩已在当前页显示；本机草稿已标记为已交卷，不会再提示继续作答。'
}
</script>

<template>
  <div ref="mediaRoot" class="mx-auto max-w-5xl px-4 pt-6 2xl:px-0">
    <p
      v-if="recovery.error.value"
      role="alert"
      class="my-3 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
    >
      {{ recovery.error.value }}
      <button type="button" class="ml-2 underline" @click="recovery.dismissNotice()">
        知道了
      </button>
    </p>
    <p
      v-if="mediaError"
      role="alert"
      class="my-3 border border-amber-300 rounded p-3 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ mediaError }}
      <button class="underline" @click="retryMedia">
        重试
      </button>
    </p>
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
        <ListeningTabs />
        <div class="mb-6 text-left">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="goBack"
          >
            ← 返回
          </button>
        </div>
        <p class="mb-4 text-5xl">
          🎧
        </p>
        <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          {{ test.title }}
        </h2>
        <p class="mb-2 text-gray-500 dark:text-gray-400">
          共 {{ test.parts.length }} 个 Part · {{ allQuestions.length }} 道题 ·
          满分 {{ scoredTotal }} 分 · 限时
          {{ Math.round(test.timeLimit / 60) }} 分钟
        </p>
        <p class="mb-8 text-sm text-gray-400 dark:text-gray-500">
          点击开始后计时启动，时间到自动交卷
        </p>
        <div class="mb-6 flex items-center justify-center gap-3">
          <span class="text-sm text-gray-500 dark:text-gray-400">选择套题：</span>
          <select
            :value="testId"
            class="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @change="onTestChange"
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
          {{
            recovery.draft.value && !recovery.draft.value.submitted
              ? '继续上次作答（从剩余时间计时）'
              : '▶ 开始测试'
          }}
        </button>
        <button
          v-if="recovery.draft.value && !recovery.draft.value.submitted"
          type="button"
          class="ml-3 border border-gray-300 rounded-xl px-6 py-3 text-lg text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          @click="discardDraftAndStart"
        >
          放弃草稿，重新开始
        </button>
        <p v-if="recovery.draft.value?.submitted" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
          该套题已交卷，重新开始将是一次新的测试
        </p>
      </div>
      <div v-else>
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              🎧 {{ test.title }}
            </h2>
            <select
              :value="testId"
              :disabled="recovery.blocked.value"
              class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
              @change="onTestChange"
            >
              <option v-for="t in mockTestList" :key="t.id" :value="t.id">
                {{ t.label }}
              </option>
            </select>
          </div>
          <div class="flex items-center gap-4">
            <span
              class="rounded-lg px-4 py-2 text-xl font-bold font-mono"
              :class="
                timeLeft < 300
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              "
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

        <div
          v-if="submitted"
          class="mb-8 border border-gray-200 rounded-2xl bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <p class="mb-2 text-5xl font-black text-blue-600 dark:text-blue-400">
            {{ band.toFixed(1) }}
          </p>
          <p class="text-gray-600 dark:text-gray-400">
            答对 {{ correctCount }} / {{ scoredTotal }} 分
          </p>
        </div>

        <div v-if="!submitted" class="mb-6 flex gap-2">
          <button
            v-for="(_, i) in test.parts"
            :key="i"
            class="rounded-lg px-4 py-2 text-sm font-bold"
            :class="
              activePart === i
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            "
            @click="activePart = i"
          >
            Part {{ i + 1 }}
          </button>
        </div>

        <div
          v-for="(p, pi) in test.parts"
          v-show="submitted || activePart === pi"
          :key="pi"
          class="mb-8"
        >
          <article
            class="mb-6 border border-gray-200 rounded-2xl bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              {{ p.title }}
            </h3>
            <audio
              v-if="!submitted"
              ref="audioEl"
              controls
              :src="resolveMediaUrl(p.audio)"
              class="w-full"
              @error="mediaError = '音频加载失败，请检查网络后重试'"
              @loadeddata="mediaError = ''"
            />
            <p
              v-if="submitted && p.transcript"
              class="mt-4 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400"
            >
              {{ p.transcript }}
            </p>
          </article>

          <!-- 有图的 Part：图片吸顶，滑到题目时一直看得见 -->
          <div
            :class="
              p.image ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6' : ''
            "
          >
            <div
              v-if="p.image"
              class="sticky top-20 z-10 mb-6 lg:top-24 lg:mb-0"
            >
              <div
                class="border border-gray-200 rounded-xl bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <img
                  :src="resolveMediaUrl(p.image)"
                  alt="题目示意图"
                  class="w-full cursor-zoom-in rounded-lg lg:max-h-[70vh] lg:object-contain"
                  @click="openZoom(resolveMediaUrl(p.image))"
                >
                <button
                  class="mt-2 w-full rounded-lg bg-gray-100 py-2 text-sm font-bold text-gray-700 dark:bg-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600"
                  @click="openZoom(resolveMediaUrl(p.image))"
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
                  class="border rounded-xl p-4 dark:border-gray-700"
                  :class="
                    questionStatus(q) === 'correct'
                      ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                      : questionStatus(q) === 'wrong'
                        ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
                        : questionStatus(q) === 'partial'
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-gray-200 bg-white dark:bg-gray-800'
                  "
                >
                  <p
                    class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200"
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
                            : answers[q.id] === String(oi)
                              ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                              : 'border-gray-200 opacity-60 dark:border-gray-700'
                          : answers[q.id] === String(oi)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'
                      "
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
                      class="block w-full border rounded-lg px-4 py-2 text-left text-sm"
                      :class="
                        submitted
                          ? (q.answer as number[]).includes(oi)
                            ? 'border-green-500 bg-green-100 font-bold dark:bg-green-900/40'
                            : (answers[q.id] ?? '')
                              .split(',')
                              .includes(String(oi))
                              ? 'border-red-500 bg-red-100 dark:bg-red-900/40'
                              : 'border-gray-200 opacity-60 dark:border-gray-700'
                          : (answers[q.id] ?? '')
                            .split(',')
                            .includes(String(oi))
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 hover:border-blue-400 dark:border-gray-700'
                      "
                      @click="toggleMultiSelect(q.id, oi)"
                    >
                      <span
                        class="mr-2 inline-block h-4 w-4 border rounded text-center text-xs leading-3"
                        :class="
                          (answers[q.id] ?? '').split(',').includes(String(oi))
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-400'
                        "
                      >
                        {{
                          (answers[q.id] ?? '').split(',').includes(String(oi))
                            ? '✓'
                            : ''
                        }}
                      </span>
                      {{ opt }}
                    </button>
                  </div>

                  <input
                    v-if="q.type === 'fill-blank'"
                    :disabled="submitted"
                    :value="answers[q.id] ?? ''"
                    placeholder="输入答案"
                    class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    @input="
                      setAnswer(q.id, ($event.target as HTMLInputElement).value)
                    "
                  >

                  <!-- 配对/标注题的选项框（如 Q21-25 的 A-G，印在卷面上，作答时可见） -->
                  <div
                    v-if="q.type === 'map-label' && q.options?.length"
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

                  <input
                    v-if="q.type === 'map-label'"
                    :disabled="submitted"
                    :value="answers[q.id] ?? ''"
                    placeholder="输入字母"
                    maxlength="4"
                    class="w-24 border border-gray-300 rounded-lg px-4 py-2 text-center text-sm uppercase dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    @input="
                      setAnswer(q.id, ($event.target as HTMLInputElement).value)
                    "
                  >

                  <p
                    v-if="submitted && questionStatus(q) !== 'correct'"
                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                  >
                    <span
                      v-if="questionStatus(q) === 'partial'"
                      class="font-bold text-amber-700"
                    >部分正确（{{
                      multiSelectScore(q, answers[q.id] ?? '')
                    }}
                      / {{ Array.isArray(q.answer) ? q.answer.length : 1 }} 分）
                      · </span>正确答案：{{
                      q.type === 'multi-select'
                        ? (q.answer as number[])
                          .map((i) => q.options?.[i])
                          .join(' / ')
                        : q.type === 'fill-blank'
                          ? Array.isArray(q.answer)
                            ? q.answer.join(' / ')
                            : q.answer
                          : q.type === 'map-label'
                            ? q.answer
                            : q.options?.[q.answer as number]
                    }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="pb-12 text-center">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="router.push('/listening')"
          >
            ← 返回听力
          </button>
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
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
        :style="{
          transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})`,
        }"
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

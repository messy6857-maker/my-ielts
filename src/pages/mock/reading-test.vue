<script setup lang="ts">
import { useRouter } from 'vue-router'
import { onBeforeLogout } from '../../composables/useAuth'

import TextHighlights from '../../components/TextHighlights.vue'
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

const router = useRouter()
const route = useRoute()
const { goBack } = useGoBack('/reading')
// 考试中点返回先确认未交卷；开始屏/已交卷直接返回

function handleBack() {
  goBack()
}
function leaveForHistory() {
  router.push('/mock/history')
}
const testOwner = useAuth().currentUser.value

const testId = computed(() => (route.query.test as string) || 'cam21-test1')
const testPair = ref<MockTestPair | null>(null)
const test = computed(() => testPair.value?.reading)
const loading = ref(true)
const loadError = ref(false)
const started = ref(false) // 点"开始测试"后才计时
const timeLeft = ref(0)
const answers = ref<Record<string, string>>({})
const submitted = ref(false)
const activePassage = ref(0)

const showPassageModal = ref(false)
// 划词高亮：passageIndex -> 高亮词组列表
const highlights = ref<Map<number, string[]>>(new Map())
const selPopup = ref<{ x: number; y: number; text: string } | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let loadSeq = 0
let endAt = 0

watch(
  useAuth().currentUser,
  () => {
    if (timer)
      clearInterval(timer)
    started.value = false
  },
  { flush: 'sync' },
)

// 异步加载选中的套题（按需加载）
// loadSeq 防止快速切换时旧的加载覆盖新的；try/finally 保证 loading 一定复位
async function loadTest() {
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
  try {
    const pair = await loadMockTest(testId.value)
    if (seq !== loadSeq)
      return // 已被更新的加载取代
    testPair.value = pair
    answers.value = {}
    submitted.value = false
    activePassage.value = 0
    highlights.value = new Map()
    selPopup.value = null
    started.value = false
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
  if (!testPair.value || started.value)
    return
  started.value = true
  timeLeft.value = testPair.value.reading.timeLimit
  answers.value = {}
  submitted.value = false
  activePassage.value = 0
  highlights.value = new Map()
  selPopup.value = null
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

onMounted(loadTest)
watch(testId, loadTest)

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

const allQuestions = computed<MockQuestion[]>(
  () => test.value?.passages.flatMap(p => p.questions) ?? [],
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
  if (!submitted.value)
    answers.value[qid] = val
}

function toggleMultiSelect(qid: string, idx: number) {
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
    if (!window.confirm('切换套题将丢失当前进度，确定吗？'))
      return
  }

  router.push({ path: '/mock/reading-test', query: { test: target } })
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

// 划词高亮
function handleSelect(pi: number) {
  // 延迟一帧，确保浏览器完成选中
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      selPopup.value = null
      return
    }
    const text = sel.toString().trim()
    // 只处理文章区内的选中
    const anchorEl = sel.anchorNode?.parentElement
    if (!anchorEl?.closest('[data-passage]')) {
      selPopup.value = null
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    selPopup.value = {
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      text,
    }
    // 记住当前 passage
    ;(selPopup.value as any).pi = pi
  }, 10)
}

function addHighlight() {
  if (!selPopup.value)
    return
  const pi = (selPopup.value as any).pi as number
  const text = selPopup.value.text
  const list = highlights.value.get(pi) ?? []
  if (!list.includes(text)) {
    list.push(text)
    highlights.value.set(pi, list)
  }
  selPopup.value = null
  window.getSelection()?.removeAllRanges()
}

function clearSelection() {
  selPopup.value = null
}

// 点击已高亮的词取消高亮：只删点击所在的 Passage 的该文本，不动其他 Passage 的同文本
function handleMarkClick(e: MouseEvent, pi: number) {
  const target = e.target as HTMLElement
  if (target.classList?.contains('user-mark')) {
    const text = target.textContent ?? ''
    const list = highlights.value.get(pi) ?? []
    const idx = list.indexOf(text)
    if (idx >= 0) {
      list.splice(idx, 1)
      highlights.value.set(pi, [...list])
    }
  }
}
onBeforeRouteLeave(
  () =>
    useAuth().currentUser.value !== testOwner
    || !started.value
    || submitted.value
    || window.confirm('尚未交卷，离开将丢失本次作答，确定吗？'),
)
function submit() {
  if (useAuth().currentUser.value !== testOwner)
    return
  if (submitted.value)
    return
  submitted.value = true
  selPopup.value = null
  if (timer)
    clearInterval(timer)
  // 保存做题记录
  const total = allQuestions.value.reduce(
    (s, q) =>
      s
      + (q.type === 'multi-select' && Array.isArray(q.answer)
        ? q.answer.length
        : 1),
    0,
  )
  saveMockRecord({
    id: testId.value,
    label: testPair.value?.label ?? testId.value,
    kind: 'reading',
    score: correctCount.value,
    total,
    band: band.value,
  })
}
const offLogout = onBeforeLogout(() => {
  if (timer)
    clearInterval(timer)
})
onUnmounted(offLogout)
function switchPassage(index: number) {
  activePassage.value = index
  selPopup.value = null
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 pt-6 2xl:px-0">
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
        <div class="mb-6 text-left">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← 返回
          </button>
        </div>
        <div class="mb-6 text-left">
          <ReadingTabs />
        </div>
        <p class="mb-4 text-5xl">
          📖
        </p>
        <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          {{ test.title }}
        </h2>
        <p class="mb-2 text-gray-500 dark:text-gray-400">
          共 {{ test.passages.length }} 篇文章 · {{ allQuestions.length }} 道题
          · 满分 {{ scoredTotal }} 分 · 限时
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
          ▶ 开始测试
        </button>
      </div>
      <div v-else>
        <!-- 顶栏：标题 + 计时器 -->
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="handleBack"
            >
              ← 返回
            </button>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              📖 {{ test.title }}
            </h2>
            <select
              :value="testId"
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

        <!-- 成绩单 -->
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

        <!-- Passage 切换 -->
        <div v-if="!submitted" class="mb-6 flex gap-2">
          <button
            v-for="(_, i) in test.passages"
            :key="i"
            class="rounded-lg px-4 py-2 text-sm font-bold"
            :class="
              activePassage === i
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            "
            @click="switchPassage(i)"
          >
            Passage {{ i + 1 }}
          </button>
        </div>

        <!-- 题目区：桌面端左右分栏各自独立滚动，手机端上下堆叠 -->
        <div
          v-for="(p, pi) in test.passages"
          v-show="submitted || activePassage === pi"
          :key="pi"
          class="mb-8"
        >
          <div class="grid gap-6 lg:grid-cols-2 lg:h-[calc(100vh-12rem)]">
            <!-- 左：文章（独立滚动，支持划词高亮） -->
            <article
              data-passage
              class="select-text border border-gray-200 rounded-2xl bg-white p-6 shadow-sm lg:min-h-0 lg:overflow-y-auto dark:border-gray-700 dark:bg-gray-800"
              @mouseup="handleSelect(pi)"
              @touchend="handleSelect(pi)"
            >
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                  Passage {{ pi + 1 }}：{{ p.title }}
                </h3>
                <button
                  v-if="(highlights.get(pi) ?? []).length"
                  class="border border-gray-300 rounded-lg px-3 py-1 text-xs text-gray-500 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  @click="highlights.set(pi, [])"
                >
                  清除标记
                </button>
              </div>
              <p class="mb-4 text-xs text-gray-400 dark:text-gray-500">
                💡 选中词组可标记高亮，点击已标记的词可取消
              </p>
              <div
                class="leading-relaxed text-gray-700 space-y-4 dark:text-gray-300"
              >
                <p
                  v-for="(para, i) in p.passage.split('\n\n')"
                  :key="i"
                  @click="handleMarkClick($event, pi)"
                >
                  <TextHighlights
                    :text="para"
                    :words="highlights.get(pi) ?? []"
                    marking
                  />
                </p>
              </div>
              <img
                v-if="p.image"
                :src="resolveMediaUrl(p.image)"
                :alt="`${p.title} 示意图`"
                class="mt-4 max-w-full border border-gray-200 rounded-lg dark:border-gray-700"
              >
            </article>

            <!-- 右：题目（独立滚动） -->
            <div class="lg:min-h-0 space-y-4 lg:overflow-y-auto lg:pr-2">
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

                <!-- 选择题 / TFNG -->
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
                        : (answers[q.id] ?? '').split(',').includes(String(oi))
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

                <!-- 填空题 -->
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

                <!-- 地图标注题 -->
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

                <!-- 交卷后显示正确答案 -->
                <p
                  v-if="submitted && questionStatus(q) !== 'correct'"
                  class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                >
                  <span
                    v-if="questionStatus(q) === 'partial'"
                    class="font-bold text-amber-700"
                  >部分正确（{{ multiSelectScore(q, answers[q.id] ?? '') }} /
                    {{ Array.isArray(q.answer) ? q.answer.length : 1 }} 分） · </span>正确答案：{{
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

        <div class="pb-12 text-center space-x-3">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← 返回阅读
          </button>
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="leaveForHistory"
          >
            📊 做题记录
          </button>
        </div>

        <!-- 划词高亮弹窗 -->
        <div
          v-if="selPopup"
          class="fixed z-50 rounded-lg bg-gray-900 px-3 py-2 shadow-xl -translate-x-1/2 -translate-y-full"
          :style="{ left: `${selPopup.x}px`, top: `${selPopup.y}px` }"
        >
          <div class="flex items-center gap-2">
            <button
              class="rounded bg-yellow-400 px-3 py-1 text-sm font-bold text-gray-900 hover:bg-yellow-300"
              @click="addHighlight"
            >
              🖍 标记
            </button>
            <button
              class="rounded px-2 py-1 text-sm text-gray-300 hover:text-white"
              @click="clearSelection"
            >
              ✕
            </button>
          </div>
          <div
            class="absolute left-1/2 top-full h-0 w-0 border-8 border-transparent border-t-gray-900 -translate-x-1/2"
          />
        </div>

        <!-- 手机端悬浮"原文"按钮 -->
        <button
          v-if="!submitted"
          class="fixed bottom-6 right-6 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg lg:hidden hover:bg-blue-700"
          @click="showPassageModal = true"
        >
          📖 原文
        </button>

        <!-- 手机端原文弹窗 -->
        <div
          v-if="showPassageModal"
          class="fixed inset-0 z-50 flex flex-col bg-white lg:hidden dark:bg-gray-900"
        >
          <div
            class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
          >
            <h3 class="font-bold text-gray-900 dark:text-white">
              Passage {{ activePassage + 1 }}：{{
                test.passages[activePassage].title
              }}
            </h3>
            <button
              class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold dark:bg-gray-700"
              @click="showPassageModal = false"
            >
              ✕ 关闭
            </button>
          </div>
          <div
            class="flex-1 overflow-y-auto px-4 py-4"
            data-passage
            @mouseup="handleSelect(activePassage)"
            @touchend="handleSelect(activePassage)"
          >
            <div
              class="leading-relaxed text-gray-700 space-y-4 dark:text-gray-300"
            >
              <p
                v-for="(para, i) in test.passages[activePassage].passage.split(
                  '\n\n',
                )"
                :key="i"
                @click="handleMarkClick($event, activePassage)"
              >
                <TextHighlights
                  :text="para"
                  :words="highlights.get(activePassage) ?? []"
                  marking
                />
              </p>
            </div>
            <img
              v-if="test.passages[activePassage].image"
              :src="resolveMediaUrl(test.passages[activePassage].image ?? '')"
              :alt="`${test.passages[activePassage].title} 示意图`"
              class="mt-4 max-w-full border border-gray-200 rounded-lg dark:border-gray-700"
            >
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.user-mark {
  background-color: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
  cursor: pointer;
}
.dark .user-mark {
  background-color: #a16207;
  color: #fefce8;
}
</style>

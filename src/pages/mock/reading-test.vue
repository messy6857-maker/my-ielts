<script setup lang="ts">
import { useRouter } from 'vue-router'
import { selectionInOneParagraph } from '../../utils/text'
import { useExamClock } from '../../composables/useExamClock'
import { useExamRecovery } from '../../composables/useExamRecovery'

import ImageViewer from '../../components/ImageViewer.vue'
import TextHighlights from '../../components/TextHighlights.vue'
import { loadMockTest, mockTestList } from './registry'
import type { MockTestPair } from './registry'
import {
  bandScore,
  countCorrect,
  formatCountdown,
  isRomanLabel,
  mapLabelPlaceholder,
  mockQuestionStatus,
  multiSelectScore,
  restoreTimeLeft,
  toggleMultiSelectValue,
  totalScorePoints,
} from './types'
import type { MockQuestion } from './types'
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
const enlargedImage = ref<string | null>(null)
// 划词高亮：passageIndex -> 高亮词组列表
const highlights = ref<Map<number, string[]>>(new Map())
const selectionHint = ref('')
const mapInputHint = ref('')
const selPopup = ref<{ x: number; y: number; text: string } | null>(null)
let loadSeq = 0
const examClock = useExamClock(timeLeft, () => {
  submit()
})
const pauseExam = examClock.pause
const startTimer = examClock.start
const recovery = useExamRecovery({
  kind: 'reading',
  testId,
  started,
  submitted,
  answers,
  timeLeft,
  pause: pauseExam,
  remaining: examClock.remaining,
  extra: () => ({
    active: activePassage.value,
    highlights: [...highlights.value.entries()],
  }),
  onUnblocked: startTimer,
})

const recordSaveFailed = ref(false)
let resultsOwner: string | null = null
function retrySaveResult() {
  if (useAuth().currentUser.value !== resultsOwner) {
    recovery.error.value = '请先回到本次作答的原身份，再重试保存成绩。'
    return
  }
  submitted.value = false
  submit()
}
// 异步加载选中的套题（按需加载）
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
  recovery.saveFlush()
  mapInputHint.value = ''
  enlargedImage.value = null
  selectionHint.value = ''
  showPassageModal.value = false
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
  pauseExam()
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
    recordSaveFailed.value = false
    testPair.value = pair
    answers.value = {}
    submitted.value = false
    activePassage.value = 0
    highlights.value = new Map()
    selPopup.value = null
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
  let saved
    = recovery.draft.value && !recovery.draft.value.submitted
      ? recovery.draft.value
      : null
  // M-Opt-#4：0 秒草稿不再 1 秒后自动交卷，给二选一：确定 = 直接交卷查看
  // 成绩，取消 = 放弃草稿、全新开始。
  if (saved && saved.timeLeft <= 0) {
    if (!recovery.begin(saved))
      return
    if (
      window.confirm(
        '该草稿剩余时间已到（0 秒）。点“确定”直接交卷查看成绩，点“取消”放弃草稿、全新开始。',
      )
    ) {
      answers.value = saved.answers ?? {}
      activePassage.value = saved.extra?.active ?? 0
      highlights.value = new Map(saved.extra?.highlights ?? [])
      selPopup.value = null
      started.value = true
      submitted.value = false
      submit()
      return
    }
    if (!recovery.clear())
      return
    saved = null
  }
  if (!recovery.begin(saved))
    return
  timeLeft.value = restoreTimeLeft(
    saved?.timeLeft,
    testPair.value.reading.timeLimit,
  )
  answers.value = saved?.answers ?? {}
  submitted.value = false
  activePassage.value = saved?.extra?.active ?? 0
  highlights.value = new Map(saved?.extra?.highlights ?? [])
  selPopup.value = null
  started.value = true
  recovery.save()
  startTimer()
}

// 放弃当前草稿并重新开始：清掉本会话草稿后立刻全新开考，
// 避免清完仍留在开始屏、下次刷新又被其他页签快照顶回来。
function discardDraftAndStart() {
  if (
    !window.confirm(
      '放弃所选的这一次作答并重新开始？同一 attempt 的副本将退役，其他独立作答不受影响。',
    )
  )
    return
  if (recovery.clear())
    startTest()
}

onMounted(loadTest)
watch(testId, loadTest)

onUnmounted(() => {
  pauseExam()
})

const allQuestions = computed<MockQuestion[]>(
  () => test.value?.passages.flatMap(p => p.questions) ?? [],
)

// 满分题数（多选题按答案个数计）
const scoredTotal = computed(() => totalScorePoints(allQuestions.value))

const correctCount = computed(() =>
  countCorrect(allQuestions.value, answers.value, submitted.value),
)

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
  // 多选题最多选该题答案个数（Choose TWO 即 2 个），多出的拒绝加入，防止全选刷分
  const q = allQuestions.value.find(q => q.id === qid)
  const max
    = q && Array.isArray(q.answer) ? q.answer.length : Number.POSITIVE_INFINITY
  answers.value[qid] = toggleMultiSelectValue(
    answers.value[qid] ?? '',
    idx,
    max,
  )
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

  router.push({ path: '/mock/reading-test', query: { test: target } })
}

function questionStatus(
  q: MockQuestion,
): 'correct' | 'wrong' | 'partial' | 'unanswered' {
  return mockQuestionStatus(q, answers.value[q.id] ?? '', submitted.value)
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
    if (!selectionInOneParagraph(sel)) {
      selectionHint.value
        = '请在同一个段落内选择词组后高亮，跨段选择不会保存。'
      selPopup.value = null
      return
    }
    selectionHint.value = ''
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
    };
    // 记住当前 passage
    (selPopup.value as any).pi = pi
  }, 10)
}

function addHighlight() {
  if (!selPopup.value)
    return
  const pi = (selPopup.value as any).pi as number
  const text = selPopup.value.text
  if (
    !test.value?.passages[pi]?.passage
      .split(/\n\n/)
      .some(p => p.includes(text))
  ) {
    selectionHint.value = '所选词组不在单一段落内，请重新选择。'
    selPopup.value = null
    return
  }
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
    useAuth().currentUser.value !== recovery.owner.value
    || !started.value
    || submitted.value
    || window.confirm(
      '尚未交卷，离开将暂停本页作答并保留草稿，其他页签独立作答不受影响，确定吗？',
    ),
)
function submit() {
  const total = totalScorePoints(allQuestions.value)
  const score = countCorrect(allQuestions.value, answers.value, true)
  const result = recovery.submitResult({
    id: testId.value,
    label: testPair.value?.label ?? testId.value,
    kind: 'reading',
    score,
    total,
    band: bandScore(score, total),
  })
  if (!result)
    return
  recordSaveFailed.value = !result.saved
  if (!result.saved)
    resultsOwner = recovery.owner.value
  selPopup.value = null
}

function setMapLabel(q: MockQuestion, event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value.trim()
  if (isRomanLabel(q)) {
    mapInputHint.value
      = value && !/^[ivxlcdm]{1,4}$/i.test(value)
        ? '标题配对请填写罗马数字（如 i、iv、ix）'
        : ''
    value = value
      .toLowerCase()
      .replace(/[^ivxlcdm]/g, '')
      .slice(0, 4)
  }
  else {
    const letters = value.toUpperCase().replace(/[^A-Z]/g, '')
    mapInputHint.value
      = value && (!letters || letters.length > 1)
        ? '配对题只填一个字母（A–Z）'
        : ''
    value = letters.slice(0, 1)
  }
  input.value = value
  setAnswer(q.id, value)
}
function switchPassage(index: number) {
  activePassage.value = index
  selPopup.value = null
  mapInputHint.value = ''
  selectionHint.value = ''
  enlargedImage.value = null
  showPassageModal.value = false
}
</script>

<template>
  <p
    v-if="recovery.retired.value"
    role="alert"
    class="mx-auto max-w-4xl rounded bg-amber-50 p-3 text-amber-900"
  >
    {{ recovery.retiredMessage.value }}
    <button class="ml-2 underline" @click="recovery.continueRecovered">
      保留答案，继续为独立作答
    </button>
    <button class="ml-2 underline" @click="recovery.leaveRetired">
      保留副本，回到开始页
    </button>
  </p>
  <ImageViewer
    v-if="enlargedImage"
    :src="enlargedImage"
    :disabled="recovery.blocked.value"
    @close="enlargedImage = null"
  />
  <button
    v-if="recordSaveFailed"
    class="m-4 rounded bg-amber-100 p-2 text-amber-900"
    @click="retrySaveResult"
  >
    重试保存成绩
  </button>
  <div class="mx-auto max-w-7xl px-4 pt-6 2xl:px-0">
    <p v-if="mapInputHint" role="status" class="my-2 text-amber-700">
      {{ mapInputHint }}
    </p>
    <p
      v-if="selectionHint"
      role="status"
      class="my-3 text-sm text-amber-700 dark:text-amber-300"
    >
      {{ selectionHint }}
    </p>
    <p
      v-if="recovery.error.value"
      :inert="recovery.blocked.value ? true : undefined"
      role="alert"
      class="my-3 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
    >
      {{ recovery.error.value }}
      <button
        type="button"
        class="ml-2 underline"
        @click="recovery.dismissNotice()"
      >
        知道了
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
          {{
            recovery.draft.value && !recovery.draft.value.submitted
              ? "继续所选作答（从剩余时间计时）"
              : recovery.availableDrafts.value.length && !recovery.draft.value
                ? "▶ 全新开始（已有草稿未选）"
                : "▶ 开始测试"
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
        <p
          v-if="recovery.retainedNotice.value"
          role="status"
          class="mt-4 text-sm text-amber-700 dark:text-amber-300"
        >
          {{ recovery.retainedNotice.value }}
          <button
            type="button"
            class="ml-2 underline"
            @click="recovery.dismissRetainedNotice()"
          >
            知道了
          </button>
        </p>
        <p
          v-if="recovery.submittedDrafts.value.length"
          class="mt-4 text-sm text-gray-500 dark:text-gray-400"
        >
          该套题已有交卷记录，重新开始将是一次新的测试
        </p>
        <div
          v-if="
            recovery.availableDrafts.value.length > 1
              || (recovery.availableDrafts.value.length && !recovery.draft.value)
          "
          class="my-3 text-sm"
        >
          <p>
            不同页签是独立作答。请选择要恢复的草稿，提交或放弃仅影响所选的同次作答。
          </p>
          <select
            aria-label="选择独立作答草稿"
            :value="recovery.draft.value?.versionId || ''"
            @change="
              recovery.selectDraft(($event.target as HTMLSelectElement).value)
            "
          >
            <option value="" disabled>
              选择要恢复的作答
            </option>
            <option
              v-for="snapshot in recovery.availableDrafts.value"
              :key="snapshot.versionId"
              :value="snapshot.versionId"
            >
              {{
                snapshot.editedAt || snapshot.updatedAt
                  ? new Date(
                    snapshot.editedAt || snapshot.updatedAt,
                  ).toLocaleString()
                  : "时间未知"
              }}
              · {{ Object.values(snapshot.answers).filter(Boolean).length }} 题
              {{
                snapshot.activeElsewhere
                  ? "（另一页签可能在使用）"
                  : "（本机保留）"
              }}
            </option>
          </select>
        </div>
        <p
          v-if="recovery.draft.value && !recovery.draft.value.submitted"
          class="mt-4 text-sm text-gray-500 dark:text-gray-400"
        >
          草稿最后保存：{{
            recovery.draft.value.updatedAt
              ? new Date(recovery.draft.value.updatedAt).toLocaleString()
              : "时间未知（答案已保留）"
          }}
        </p>
      </div>
      <div v-else :inert="recovery.blocked.value ? true : undefined">
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
            <!-- M-Opt5：桌面端标题列表置顶对照。article 在 lg 下改为 flex 列，
                 headings 块仅在 lg 下 order-first + 吸顶；移动端 DOM 顺序与
                 手机原文弹窗均不动。 -->
            <article
              data-passage
              class="select-text border border-gray-200 rounded-2xl bg-white p-6 shadow-sm lg:min-h-0 lg:flex lg:flex-col lg:overflow-y-auto dark:border-gray-700 dark:bg-gray-800"
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
                class="mt-4 max-w-full cursor-zoom-in border border-gray-200 rounded-lg dark:border-gray-700"
                @click="enlargedImage = resolveMediaUrl(p.image)"
              >
              <div
                v-if="p.headings?.length"
                class="mt-4 border border-gray-200 rounded-lg bg-white p-4 lg:sticky lg:top-0 lg:z-10 lg:order-first lg:mt-0 dark:border-gray-700 dark:bg-gray-800"
              >
                <p class="mb-2 text-sm font-bold text-gray-900 dark:text-white">
                  标题列表
                </p>
                <ul class="text-sm text-gray-700 space-y-1 dark:text-gray-300">
                  <li v-for="(h, hi) in p.headings" :key="hi">
                    {{ h }}
                  </li>
                </ul>
              </div>
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
                        (answers[q.id] ?? "").split(",").includes(String(oi))
                          ? "✓"
                          : ""
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

                <!-- 配对/标注题的选项框：镜像听力页写法（M-Opt4）。当前阅读数据
                     尚无 options 字段，只补渲染分支不改数据；“按题组只渲染一次”
                     需改 v-for 分组结构，非零风险，本次不动。 -->
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

                <!-- 地图标注题 -->
                <input
                  v-if="q.type === 'map-label'"
                  :disabled="submitted"
                  :value="answers[q.id] ?? ''"
                  :placeholder="mapLabelPlaceholder(q)"
                  :maxlength="isRomanLabel(q) ? 4 : 1"
                  class="w-24 border border-gray-300 rounded-lg px-4 py-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  @input="setMapLabel(q, $event)"
                >

                <!-- 交卷后显示正确答案 -->
                <p
                  v-if="submitted && questionStatus(q) !== 'correct'"
                  class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                >
                  <span
                    v-if="questionStatus(q) === 'partial'"
                    class="font-bold text-amber-700"
                  >部分正确（{{ multiSelectScore(q, answers[q.id] ?? "") }} /
                    {{ Array.isArray(q.answer) ? q.answer.length : 1 }} 分） · </span>正确答案：{{
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
              class="mt-4 max-w-full cursor-zoom-in border border-gray-200 rounded-lg dark:border-gray-700"
              @click="
                enlargedImage = resolveMediaUrl(
                  test.passages[activePassage].image ?? '',
                )
              "
            >
            <div
              v-if="test.passages[activePassage].headings?.length"
              class="mt-4 border border-gray-200 rounded-lg p-4 dark:border-gray-700"
            >
              <p class="mb-2 text-sm font-bold text-gray-900 dark:text-white">
                标题列表
              </p>
              <ul class="text-sm text-gray-700 space-y-1 dark:text-gray-300">
                <li
                  v-for="(h, hi) in test.passages[activePassage].headings"
                  :key="hi"
                >
                  {{ h }}
                </li>
              </ul>
            </div>
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

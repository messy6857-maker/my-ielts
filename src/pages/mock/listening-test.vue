<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useExamClock } from '../../composables/useExamClock'
import { useExamRecovery } from '../../composables/useExamRecovery'

import {
  loadMockTest,
  loadMockTranscript,
  mockTestList,
  withTranscripts,
} from './registry'
import type { MockTestPair } from './registry'
import {
  countCorrect,
  formatCountdown,
  listeningBandScore,
  mapLabelPlaceholder,
  mockQuestionStatus,
  multiSelectScore,
  restoreTimeLeft,
  showOptionsBox,
  toggleMultiSelectValue,
  totalScorePoints,
} from './types'
import type { MockQuestion } from './types'
import { resolveMediaUrl } from '~/composables/useAudio'
import { useGoBack } from '~/composables/useGoBack'
import { useStudyTimer } from '~/composables/useStudyTimer'
import { confirmDialog } from '~/composables/useDialog'
import { collectMockMistakeEntries } from '~/utils/mockMistakes'
import { useMockMistakeSave } from '~/composables/useMockMistakeSave'
import ListeningTabs from '~/components/ListeningTabs.vue'

const partImageFailed = ref<Record<number, boolean>>({})
const mediaRoot = ref<HTMLElement | null>(null)

const { goBack } = useGoBack('/listening')
const studyTimer = useStudyTimer()

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
// M-P2-4：音频错误按 Part 记录，横幅只反映当前 Part；此前共用一个
// mediaError，另一 Part 加载成功会把坏 Part 的横幅误清。
const mediaErrors = ref<Record<number, string>>({})
const mediaError = computed(() => mediaErrors.value[activePart.value] ?? '')
function onAudioError(pi: number) {
  mediaErrors.value[pi] = '音频加载失败，请检查网络后重试'
}
function onAudioLoaded(pi: number) {
  delete mediaErrors.value[pi]
}
const audioEl = ref<HTMLAudioElement | null>(null)
const mapLabelHints = ref<Record<string, string>>({})
const zoomImage = ref<string | null>(null)
const transcriptError = ref(false)
const transcriptLoading = ref(false)
let loadSeq = 0
const examClock = useExamClock(
  timeLeft,
  () => {
    submit()
  },
  pauseAllAudio,
)
const pauseExam = examClock.pause
const startTimer = examClock.start
const recovery = useExamRecovery({
  kind: 'listening',
  testId,
  started,
  submitted,
  answers,
  timeLeft,
  pause: pauseExam,
  remaining: examClock.remaining,
  extra: () => ({ active: activePart.value }),
  onUnblocked: startTimer,
})

// 只重置当前 Part 的音频：4 个 Part 的 audio 都在 DOM 内（v-show 隐藏），
// 全量 load() 会把其他 Part 的播放进度一并清零。audioEl 在 v-for 里收成
// 数组，下标与 test.parts 顺序一致，即 activePart。阻断时横幅本身已 inert，
// 这里再守一道：阻断期间不重置任何音频。
function retryMedia() {
  if (recovery.blocked.value)
    return
  delete mediaErrors.value[activePart.value]
  const els = audioEl.value as unknown as
    | HTMLAudioElement
    | HTMLAudioElement[]
    | null
  const el = Array.isArray(els) ? els[activePart.value] : els
  el?.load()
}

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

const recordSaveFailed = ref(false)
const mistakeSave = useMockMistakeSave()
let resultsOwner: string | null = null
function retrySaveResult() {
  if (useAuth().currentUser.value !== resultsOwner) {
    recovery.error.value = '请先回到本次作答的原身份，再重试保存成绩。'
    return
  }
  submitted.value = false
  submit()
}
// 异步加载选中的套题（按需加载，不一次全载入）
// loadSeq 防止快速切换时旧的加载覆盖新的；try/finally 保证 loading 一定复位
async function loadTest() {
  if (started.value && !submitted.value) {
    const active = recovery.activeTestId()
    // Returning from a rejected route change must not reload the active paper.
    if (testId.value === active)
      return
    if (recovery.blocked.value || !recovery.saveFlush()) {
      await router.replace({ query: { ...route.query, test: active } })
      return
    }
  }
  studyTimer.pause()
  pauseExam()
  started.value = false
  // 非法 test id（如手写 URL / 过期书签）不再静默 fallback：把 URL 参数规范化为默认套题，
  // 与实际加载内容一致，书签也被修复；replace 不产生多余历史记录，随后 watcher 以新 id 重载
  if (!mockTestList.some(t => t.id === testId.value)) {
    router.replace({ query: { ...route.query, test: 'cam21-test1' } })
    return
  }
  const seq = ++loadSeq
  transcriptLoading.value = false
  transcriptError.value = false
  loading.value = true
  loadError.value = false
  pauseExam()
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
    partImageFailed.value = {}
    mediaErrors.value = {}
    mapLabelHints.value = {}
    zoomImage.value = null
    transcriptError.value = false
    recordSaveFailed.value = false
    // 切题不丢待重试的错题写入：失败记录已落本机存储，横幅留到重试成功。
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
type ExamDraft = NonNullable<typeof recovery.draft.value>
// 0 秒草稿的二选一弹窗还在等待时，再点“开始测试”不再叠出第二个弹窗
let expiredPromptOpen = false
function startTest() {
  if (recovery.mismatch())
    return
  if (!testPair.value || started.value || expiredPromptOpen)
    return
  // 已交卷的草稿不再续做：按全新测试开始
  const saved
    = recovery.draft.value && !recovery.draft.value.submitted
      ? recovery.draft.value
      : null
  // M-Opt-#4：0 秒草稿不再 1 秒后自动交卷，给二选一：直接交卷查看成绩，
  // 或放弃草稿、全新开始。
  if (saved && saved.timeLeft <= 0) {
    if (!recovery.begin(saved))
      return
    expiredPromptOpen = true
    const pair = testPair.value
    confirmDialog(
      '该草稿剩余时间已到（0 秒）。可以直接交卷查看成绩，或放弃草稿、全新开始。',
      { confirmText: '直接交卷', cancelText: '放弃草稿，重新开始' },
    ).then((submitNow) => {
      expiredPromptOpen = false
      // 弹窗期间换了套题、已经开考或换了账号：这次选择作废
      if (testPair.value !== pair || started.value || recovery.mismatch())
        return
      if (submitNow) {
        answers.value = saved.answers ?? {}
        activePart.value = saved.extra?.active ?? 0
        started.value = true
        submitted.value = false
        studyTimer.start()
        submit()
        return
      }
      if (recovery.clear())
        beginTest(null)
    })
    return
  }
  beginTest(saved)
}
function beginTest(saved: ExamDraft | null) {
  const pair = testPair.value
  if (!pair || !recovery.begin(saved))
    return
  timeLeft.value = restoreTimeLeft(
    saved?.timeLeft,
    pair.listening.timeLimit,
  )
  answers.value = saved?.answers ?? {}
  submitted.value = false
  activePart.value = saved?.extra?.active ?? 0
  started.value = true
  recovery.save()
  startTimer()
  studyTimer.start()
}

// 放弃当前草稿并重新开始：清掉本会话草稿后立刻全新开考，
// 避免清完仍留在开始屏、下次刷新又被其他页签快照顶回来。
async function discardDraftAndStart() {
  if (
    !(await confirmDialog(
      '放弃所选的这一次作答并重新开始？同一 attempt 的副本将退役，其他独立作答不受影响。',
      { danger: true, confirmText: '放弃并重新开始' },
    ))
  )
    return
  if (recovery.clear())
    startTest()
}

onMounted(loadTest)
watch(testId, loadTest)

// 切 Part 时停掉上一个 Part 的录音：v-show 只隐藏不暂停，
// 否则录音会在看不见的地方继续放、且无法暂停。
watch(activePart, () => pauseAllAudio())

onUnmounted(() => {
  pauseExam()
  studyTimer.pause()
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
    panBase = {
      x: t.clientX - zoomPos.value.x,
      y: t.clientY - zoomPos.value.y,
    }
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
const scoredTotal = computed(() => totalScorePoints(allQuestions.value))

const correctCount = computed(() =>
  countCorrect(allQuestions.value, answers.value, submitted.value),
)

const band = computed(() => listeningBandScore(correctCount.value, scoredTotal.value))

function setAnswer(qid: string, val: string) {
  if (recovery.mismatch())
    return
  if (!submitted.value)
    answers.value[qid] = val
}

// 听力 map-label 答案均为单个字母：maxlength=1 挡住多字符输入，
// 并把非字母/多余字符过滤掉且给出提示，避免“AB”之类误输入交卷后静默判错。
// 阅读侧不走这里（阅读标题题最长 viii 需保留 maxlength=4，见 reading-test.vue）。
function setMapLabelAnswer(qid: string, raw: string) {
  if (recovery.mismatch())
    return
  if (submitted.value)
    return
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '')
  if (!raw) {
    mapLabelHints.value[qid] = ''
    answers.value[qid] = ''
    return
  }
  if (!letters) {
    mapLabelHints.value[qid] = '只填一个字母（A–Z），请重新输入'
    answers.value[qid] = ''
    return
  }
  if (raw.trim().length > 1 || letters.length > 1)
    mapLabelHints.value[qid] = '只填一个字母，已取首个字母'
  else mapLabelHints.value[qid] = ''
  answers.value[qid] = letters[0]
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
async function onTestChange(e: Event) {
  const select = e.target as HTMLSelectElement
  const target = select.value
  if (started.value && !submitted.value && hasAnswers.value) {
    // 弹窗期间下拉框先显示回当前套题，确认后再跳转
    select.value = testId.value
    if (!(await confirmDialog('切换套题将暂停并保留当前作答草稿，确定吗？', { confirmText: '切换' })))
      return
    if (target === testId.value)
      return
  }

  router.push({ path: '/mock/listening-test', query: { test: target } })
}

function questionStatus(
  q: MockQuestion,
): 'correct' | 'wrong' | 'partial' | 'unanswered' {
  return mockQuestionStatus(q, answers.value[q.id] ?? '', submitted.value)
}
// 离开确认弹窗还开着时又发起导航（再点链接、按返回键）：共用同一个弹窗的结果
let leavePrompt: Promise<boolean> | null = null
onBeforeRouteLeave(async () => {
  if (!started.value || submitted.value)
    return true
  if (useAuth().currentUser.value === recovery.owner.value) {
    leavePrompt ??= confirmDialog(
      '尚未交卷，离开将暂停本页作答并保留草稿，其他页签独立作答不受影响，确定吗？',
      { confirmText: '离开', cancelText: '继续作答' },
    ).finally(() => {
      leavePrompt = null
    })
    if (!(await leavePrompt))
      return false
    // 弹窗期间时间到已自动交卷：直接放行
    if (!started.value || submitted.value)
      return true
  }
  return recovery.saveBeforeLeave()
})
watch([submitted, testPair], ([done, pair]) => {
  if (
    done
    && pair
    && !pair.listening.parts.some(p => p.transcript)
    && !transcriptLoading.value
  )
    fetchTranscript()
})
async function fetchTranscript() {
  // 交卷后录音脚本双路加载去重：watch 与 submit() 末尾可能并发各拉一次，
  // 入口守卫让第二次调用直接返回，只留第一次的请求在飞。
  if (transcriptLoading.value)
    return
  const sequence = loadSeq
  const id = testId.value
  transcriptLoading.value = true
  transcriptError.value = false
  try {
    const transcript = await loadMockTranscript(id)
    if (sequence !== loadSeq || testId.value !== id || !submitted.value)
      return
    if (!transcript)
      throw new Error('原文加载失败')
    testPair.value = {
      ...testPair.value!,
      listening: withTranscripts(testPair.value!.listening, transcript),
    }
  }
  catch {
    if (sequence === loadSeq && testId.value === id)
      transcriptError.value = true
  }
  finally {
    if (sequence === loadSeq && testId.value === id)
      transcriptLoading.value = false
  }
}
async function submit() {
  const qs = allQuestions.value
  const total = totalScorePoints(qs)
  const score = countCorrect(allQuestions.value, answers.value, true)
  const label = testPair.value?.label ?? testId.value
  // A-1: capture the attempt before submitResult (success clears the draft);
  // one attempt records its mistakes once, a retry only tops up the record.
  const attemptId = recovery.attemptId()
  const result = recovery.submitResult({
    id: testId.value,
    label,
    kind: 'listening',
    score,
    total,
    band: listeningBandScore(score, total),
  })
  if (!result)
    return
  studyTimer.pause()
  recordSaveFailed.value = !result.saved
  if (!result.saved)
    resultsOwner = recovery.owner.value
  // 错题本：交卷后写入（按账号隔离，走现有 mistake_parts 同步）
  const parts = test.value?.parts ?? []
  mistakeSave.save(attemptId, collectMockMistakeEntries({
    kind: 'listening',
    testId: testId.value,
    label,
    answers: answers.value,
    parts: parts.map((p, i) => ({
      part: `part${i + 1}`,
      questions: p.questions,
      audio: p.audio,
    })),
  }))
  // M-Opt1：交卷后才按需加载录音脚本，选加载不再顺带下载整套脚本；
  // 加载失败时脚本区保持隐藏（原有 v-if 分支），不阻塞交卷主流程。
  // M-Opt2 的音频保留见模板：交卷后 audio 不再 v-if 销毁，仍可边听边对脚本。
  await fetchTranscript()
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
  <p
    v-if="submitted && transcriptError"
    role="alert"
    class="m-4 text-amber-700"
  >
    录音脚本加载失败。<button
      class="underline"
      :disabled="transcriptLoading"
      @click="fetchTranscript"
    >
      重试加载
    </button>
  </p>
  <p v-if="mistakeSave.failed.value" role="alert" class="m-4 text-sm text-amber-700">
    部分错题保存失败。释放空间后可重试，已保存的题不会重复计数。
    <button class="underline" @click="mistakeSave.retry">
      重试写入错题
    </button>
  </p>
  <button
    v-if="recordSaveFailed"
    class="m-4 rounded bg-amber-100 p-2 text-amber-900"
    @click="retrySaveResult"
  >
    重试保存成绩
  </button>
  <div ref="mediaRoot" class="mx-auto max-w-5xl px-4 pt-6 2xl:px-0">
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
    <p
      v-if="mediaError"
      :inert="recovery.blocked.value ? true : undefined"
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
                snapshot.timeLeft == null
                  ? ""
                  : `· 剩余 ${formatCountdown(snapshot.timeLeft)}`
              }}
              {{ snapshot.timeLeft === 0 ? "（剩余 0 秒）" : "" }}
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
              :disabled="recovery.retired.value"
              :title="recovery.retired.value ? '退役态下交卷不可用，请用上方横幅按钮处理' : undefined"
              class="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50"
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
          <button
            type="button"
            class="mt-4 border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="router.push('/listening/intensive')"
          >
            🎧 去精听对照原文（精听页需再选本套题）
          </button>
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
            <!-- 交卷后音频不销毁：保留当前 Part 播放器，可边听边对脚本；
                 交卷时 submit() 已 pauseAllAudio，位置保留、不会自动续播 -->
            <audio
              ref="audioEl"
              controls
              :src="resolveMediaUrl(p.audio)"
              class="w-full"
              @error="onAudioError(pi)"
              @loadeddata="onAudioLoaded(pi)"
            />
            <details
              v-if="submitted && p.transcript"
              class="mt-4 text-sm text-gray-600 dark:text-gray-400"
            >
              <summary class="cursor-pointer font-bold">
                查看 {{ p.title }} 录音脚本
              </summary>
              <p class="whitespace-pre-line">
                {{ p.transcript }}
              </p>
            </details>
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
                  v-if="!partImageFailed[pi]"
                  :src="resolveMediaUrl(p.image)"
                  alt="题目示意图"
                  class="w-full cursor-zoom-in rounded-lg lg:max-h-[70vh] lg:object-contain"
                  @click="openZoom(resolveMediaUrl(p.image))"
                  @error="partImageFailed[pi] = true"
                >
                <p v-else class="p-3 text-sm text-gray-500">
                  示意图加载失败，请检查网络后刷新页面
                </p>
                <button
                  v-if="!partImageFailed[pi]"
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
                  v-for="(q, qi) in p.questions"
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
                          (answers[q.id] ?? "").split(",").includes(String(oi))
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
                    :value="answers[q.id] ?? ''"
                    placeholder="输入答案"
                    class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    @input="
                      setAnswer(q.id, ($event.target as HTMLInputElement).value)
                    "
                  >

                  <!-- 配对/标注题的选项框（如 Q21-25 的 A-G，印在卷面上，作答时可见）；
                       同一 Part 内连续且选项内容相同的题组只在首题出框（showOptionsBox） -->
                  <div
                    v-if="showOptionsBox(p.questions, qi)"
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
                    :placeholder="mapLabelPlaceholder(q)"
                    maxlength="1"
                    class="w-24 border border-gray-300 rounded-lg px-4 py-2 text-center text-sm uppercase dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    @input="
                      setMapLabelAnswer(
                        q.id,
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  >
                  <p
                    v-if="mapLabelHints[q.id]"
                    class="mt-1 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {{ mapLabelHints[q.id] }}
                  </p>

                  <p
                    v-if="submitted && questionStatus(q) !== 'correct'"
                    class="mt-2 text-sm text-gray-500 dark:text-gray-400"
                  >
                    <span
                      v-if="questionStatus(q) === 'partial'"
                      class="font-bold text-amber-700"
                    >部分正确（{{
                      multiSelectScore(q, answers[q.id] ?? "")
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
  <!-- 查看器在考试区 inert 子树之外：阻断时同样 inert，否则阻断前已打开的
       查看器在阻断期间仍可缩放/关闭。 -->
  <div
    v-if="zoomImage"
    :inert="recovery.blocked.value ? true : undefined"
    class="fixed inset-0 z-50 flex flex-col bg-black/95"
  >
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

<script setup lang="ts">
import { resolveMediaUrl } from '~/composables/useAudio'
import { useMockExam } from '~/composables/useMockExam'
import { loadMockTranscript, withTranscripts } from './registry'
import {
  listeningBandScore,
  mapLabelPlaceholder,
} from './types'

// 听力限时模考：考试流程（选题、草稿、计时、作答、交卷、保存）在 useMockExam 里和阅读共用；
// 这里只有听力特有的：每个 Part 的录音、地图题输入、交卷后加载原文、图片放大查看。
const partImageFailed = ref<Record<number, boolean>>({})
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

const {
  router,
  testId,
  testPair,
  test,
  loading,
  loadError,
  started,
  timeLeft,
  answers,
  submitted,
  recovery,
  recordSaveFailed,
  mistakeSave,
  retrySaveResult,
  loadTest,
  loadSeq,
  startTest,
  discardDraftAndStart,
  allQuestions,
  scoredTotal,
  correctCount,
  band,
  answeredCount,
  setAnswer,
  toggleMultiSelect,
  onTestChange,
  questionStatus,
  submit,
} = useMockExam({
  kind: 'listening',
  path: '/mock/listening-test',
  pick: pair => pair.listening,
  questions: t => t.parts.flatMap(p => p.questions),
  timeLimit: t => t.timeLimit,
  mistakeParts: t => t.parts.map((p, i) => ({
    part: `part${i + 1}`,
    questions: p.questions,
    audio: p.audio,
  })),
  bandScore: listeningBandScore,
  extra: () => ({ active: activePart.value }),
  restoreExtra: (extra) => {
    activePart.value = extra?.active ?? 0
  },
  pauseMedia: pauseAllAudio,
  onLoadStart: () => {
    transcriptLoading.value = false
    transcriptError.value = false
  },
  onLoaded: () => {
    partImageFailed.value = {}
    mediaErrors.value = {}
    mapLabelHints.value = {}
    zoomImage.value = null
    transcriptError.value = false
  },
  // M-Opt1：交卷后才按需加载录音脚本，选加载不再顺带下载整套脚本；
  // 加载失败时脚本区保持隐藏（原有 v-if 分支），不阻塞交卷主流程。
  // M-Opt2 的音频保留见模板：交卷后 audio 不再 v-if 销毁，仍可边听边对脚本。
  afterSubmit: () => fetchTranscript(),
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
  const el = Array.isArray(els)
    ? els[activePart.value]
    : els
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

// 切 Part 时停掉上一个 Part 的录音：v-show 只隐藏不暂停，
// 否则录音会在看不见的地方继续放、且无法暂停。
watch(activePart, () => pauseAllAudio())

onUnmounted(() => {
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
  adjustZoom(e.deltaY < 0
    ? 0.25
    : -0.25)
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

watch([submitted, testPair], ([done, pair]) => {
  if (
    done
    && pair
    && !pair.listening.parts.some(p => p.transcript)
    && !transcriptLoading.value
  ) {
    fetchTranscript()
  }
})
async function fetchTranscript() {
  // 交卷后录音脚本双路加载去重：watch 与 submit() 末尾可能并发各拉一次，
  // 入口守卫让第二次调用直接返回，只留第一次的请求在飞。
  if (transcriptLoading.value)
    return
  const sequence = loadSeq()
  const id = testId.value
  transcriptLoading.value = true
  transcriptError.value = false
  try {
    const transcript = await loadMockTranscript(id)
    if (sequence !== loadSeq() || testId.value !== id || !submitted.value)
      return
    if (!transcript)
      throw new Error('原文加载失败')
    testPair.value = {
      ...testPair.value!,
      listening: withTranscripts(testPair.value!.listening, transcript),
    }
  }
  catch {
    if (sequence === loadSeq() && testId.value === id)
      transcriptError.value = true
  }
  finally {
    if (sequence === loadSeq() && testId.value === id)
      transcriptLoading.value = false
  }
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
  <div class="mx-auto max-w-5xl px-4 pt-6 2xl:px-0">
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
        class="rounded-lg bg-blue-600 px-6 py-2 text-white font-bold hover:bg-blue-700"
        @click="loadTest"
      >
        🔄 重新加载
      </button>
    </div>
    <template v-else-if="test">
      <!-- 开始屏：点开始才计时 -->
      <MockStartScreen
        v-if="!started"
        :recovery="recovery"
        :test-id="testId"
        icon="🎧"
        :title="test.title"
        @change-test="onTestChange"
        @start="startTest"
        @discard="discardDraftAndStart"
      >
        <template #summary>
          共 {{ test.parts.length }} 个 Part · {{ allQuestions.length }} 道题 ·
          满分 {{ scoredTotal }} 分 · 限时
          {{ Math.round(test.timeLimit / 60) }} 分钟
        </template>
      </MockStartScreen>
      <div v-else :inert="recovery.blocked.value ? true : undefined">
        <MockTopBar
          :recovery="recovery"
          :test-id="testId"
          icon="🎧"
          :title="test.title"
          :time-left="timeLeft"
          :submitted="submitted"
          @change-test="onTestChange"
          @submit="submit"
        />

        <MockScoreCard
          v-if="submitted"
          :answered-count="answeredCount"
          :band="band"
          :correct-count="correctCount"
          :scored-total="scoredTotal"
        >
          <button
            type="button"
            class="mt-4 border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="router.push('/listening/intensive')"
          >
            🎧 去精听对照原文（精听页需再选本套题）
          </button>
        </MockScoreCard>

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
            <h3 class="mb-4 text-xl text-gray-900 font-bold dark:text-white">
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
                  class="mt-2 w-full rounded-lg bg-gray-100 py-2 text-sm text-gray-700 font-bold dark:bg-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600"
                  @click="openZoom(resolveMediaUrl(p.image))"
                >
                  🔍 点击放大查看
                </button>
              </div>
            </div>
            <div>
              <div class="space-y-4">
                <MockQuestionCard
                  v-for="(q, qi) in p.questions"
                  :key="q.id"
                  :q="q"
                  :questions="p.questions"
                  :index="qi"
                  :answer="answers[q.id]"
                  :status="questionStatus(q)"
                  :submitted="submitted"
                  @answer="setAnswer(q.id, $event)"
                  @toggle="toggleMultiSelect(q.id, $event)"
                >
                  <template #map-label>
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
                  </template>
                </MockQuestionCard>
              </div>
            </div>
          </div>
        </div>

        <div class="pb-12 text-center">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="router.push('/ielts')"
          >
            ← 返回雅思考试
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
          class="h-9 w-9 rounded-full bg-white/15 text-xl text-white font-bold active:bg-white/30"
          @click="adjustZoom(-0.5)"
        >
          −
        </button>
        <span class="w-14 text-center text-sm text-white/80">{{ Math.round(zoomScale * 100) }}%</span>
        <button
          class="h-9 w-9 rounded-full bg-white/15 text-xl text-white font-bold active:bg-white/30"
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

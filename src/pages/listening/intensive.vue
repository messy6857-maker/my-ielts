<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { speechLanguage } from '../../composables/useAudioGroup'
import { useAuth } from '../../composables/useAuth'
import { useMistakes } from '../../composables/useStudyData'
import { useStudyTimer } from '../../composables/useStudyTimer'
import { transcriptSentenceEntries } from '../../utils/text'
import { resolveMediaUrl } from '../../composables/useAudio'
import type { DiffToken } from '../../utils/dictationDiff'
import { diffDictation } from '../../utils/dictationDiff'
import {
  getDictationPartProgress,
  saveDictationPartProgress,
  summarizeDictationPart,
} from '../../utils/dictationProgress'
import type { SentenceTiming } from './timings/loadTimings'
import { loadTestTimings, prefersOriginalAudio, shouldUseTtsFallback } from './timings/loadTimings'

const mediaError = ref('')
// 点读 TTS 失败提示：与上方 mediaError 同款式；取消朗读触发的 onerror
// 因 sequence 已过期而跳过，不会误报。
const ttsError = ref('')
const mediaRoot = ref<HTMLElement | null>(null)
function retryMedia() {
  mediaError.value = ''
  mediaRoot.value?.querySelectorAll('audio').forEach(audio => audio.load())
}

// 16 套题的 transcript，按需导入
const transcriptModules: Record<string, () => Promise<any>> = {
  'cam18-test1': () => import('../mock/cam18-test1-listening-transcript'),
  'cam18-test2': () => import('../mock/cam18-test2-listening-transcript'),
  'cam18-test3': () => import('../mock/cam18-test3-listening-transcript'),
  'cam18-test4': () => import('../mock/cam18-test4-listening-transcript'),
  'cam19-test1': () => import('../mock/cam19-test1-listening-transcript'),
  'cam19-test2': () => import('../mock/cam19-test2-listening-transcript'),
  'cam19-test3': () => import('../mock/cam19-test3-listening-transcript'),
  'cam19-test4': () => import('../mock/cam19-test4-listening-transcript'),
  'cam20-test1': () => import('../mock/cam20-test1-listening-transcript'),
  'cam20-test2': () => import('../mock/cam20-test2-listening-transcript'),
  'cam20-test3': () => import('../mock/cam20-test3-listening-transcript'),
  'cam20-test4': () => import('../mock/cam20-test4-listening-transcript'),
  'cam21-test1': () => import('../mock/cam21-test1-listening-transcript'),
  'cam21-test2': () => import('../mock/cam21-test2-listening-transcript'),
  'cam21-test3': () => import('../mock/cam21-test3-listening-transcript'),
  'cam21-test4': () => import('../mock/cam21-test4-listening-transcript'),
}

const testOptions = [
  { id: 'cam18-test1', label: '剑18 Test 1' },
  { id: 'cam18-test2', label: '剑18 Test 2' },
  { id: 'cam18-test3', label: '剑18 Test 3' },
  { id: 'cam18-test4', label: '剑18 Test 4' },
  { id: 'cam19-test1', label: '剑19 Test 1' },
  { id: 'cam19-test2', label: '剑19 Test 2' },
  { id: 'cam19-test3', label: '剑19 Test 3' },
  { id: 'cam19-test4', label: '剑19 Test 4' },
  { id: 'cam20-test1', label: '剑20 Test 1' },
  { id: 'cam20-test2', label: '剑20 Test 2' },
  { id: 'cam20-test3', label: '剑20 Test 3' },
  { id: 'cam20-test4', label: '剑20 Test 4' },
  { id: 'cam21-test1', label: '剑21 Test 1' },
  { id: 'cam21-test2', label: '剑21 Test 2' },
  { id: 'cam21-test3', label: '剑21 Test 3' },
  { id: 'cam21-test4', label: '剑21 Test 4' },
]

const partOptions = [
  { id: 'part1', label: 'Part 1' },
  { id: 'part2', label: 'Part 2' },
  { id: 'part3', label: 'Part 3' },
  { id: 'part4', label: 'Part 4' },
]

const selectedTest = ref('cam18-test1')
const selectedPart = ref('part1')
const transcript = ref('')
const showTranscript = ref(false)
const loading = ref(false)
const loadError = ref(false)
const speakingIndex = ref(-1)
const partTimings = ref<SentenceTiming[] | null>(null)
// B-1: timings load in parallel with the transcript; while they load, the
// per-sentence status is unknown — never render it as 'tts' (that would
// mislabel original-audio sentences and actually play TTS).
const timingsLoading = ref(false)
// B-3: a failed dynamic import leaves partTimings null (TTS fallback for
// every sentence) with no hint and no retry; surface it.
const timingsError = ref(false)

type StudyMode = 'intensive' | 'dictation'
const mode = ref<StudyMode>('intensive')

const { currentUser } = useAuth()
const { addMistake } = useMistakes()
const timer = useStudyTimer()

const sentenceEntries = computed(() =>
  transcriptSentenceEntries(transcript.value),
)
const sentences = computed(() => sentenceEntries.value.map(x => x.display))
let playbackGeneration = 0
const audioEl = ref<HTMLAudioElement | null>(null)
const playbackRate = ref(1)
// 句级原音时间：[start, end, status]，status 为 ok/weak（播原音）、
// tts（无时间，走浏览器朗读并标注）、skip（无可播内容，不配按钮）
function sentenceTiming(idx: number): SentenceTiming | undefined {
  const arr = partTimings.value
  // 只有时间数组与当前显示的分句一一对应时才用原音；否则（如原文
  // 未按预期加载）一律走 TTS，绝不按序号播错句的音频
  if (!arr || arr.length !== sentenceEntries.value.length)
    return undefined
  return arr[idx]
}
function timingStatus(idx: number): string {
  if (timingsLoading.value)
    return 'loading'
  return sentenceTiming(idx)?.[2] ?? 'tts'
}

let timingsSequence = 0
async function loadTimingsForSelection() {
  const sequence = ++timingsSequence
  const test = selectedTest.value
  const part = selectedPart.value
  const isCurrent = () =>
    sequence === timingsSequence && test === selectedTest.value && part === selectedPart.value
  partTimings.value = null
  timingsLoading.value = true
  timingsError.value = false
  try {
    const parts = await loadTestTimings(test)
    if (isCurrent()) {
      partTimings.value = parts?.[part] ?? null
      timingsError.value = partTimings.value === null
    }
  }
  catch {
    if (isCurrent())
      timingsError.value = true
  }
  finally {
    if (isCurrent())
      timingsLoading.value = false
  }
}

const sentenceAudioEl = ref<HTMLAudioElement | null>(null)
let sentenceEndAt: number | null = null
let sentencePlayGeneration = 0
let sentenceStopRaf = 0
let seekController: AbortController | undefined

function stopSentenceAudio() {
  sentencePlayGeneration++
  seekController?.abort()
  seekController = undefined
  if (sentenceStopRaf) {
    cancelAnimationFrame(sentenceStopRaf)
    sentenceStopRaf = 0
  }
  sentenceAudioEl.value?.pause()
  sentenceEndAt = null
}

function whenAudioSeekable(el: HTMLAudioElement, signal: AbortSignal): Promise<boolean> {
  if (el.error || signal.aborted)
    return Promise.resolve(false)
  if (el.readyState >= HTMLMediaElement.HAVE_METADATA)
    return Promise.resolve(true)
  return new Promise((resolve) => {
    const timeout = setTimeout(onError, 8000)
    function finish(ready: boolean) {
      clearTimeout(timeout)
      el.removeEventListener('loadedmetadata', onReady)
      el.removeEventListener('error', onError)
      signal.removeEventListener('abort', onError)
      resolve(ready)
    }
    function onReady() {
      finish(true)
    }
    function onError() {
      finish(false)
    }
    el.addEventListener('loadedmetadata', onReady)
    el.addEventListener('error', onError)
    signal.addEventListener('abort', onError, { once: true })
  })
}

function armSentenceEndWatch(el: HTMLAudioElement, generation: number) {
  if (sentenceStopRaf) {
    cancelAnimationFrame(sentenceStopRaf)
    sentenceStopRaf = 0
  }
  // timeupdate 间隔较粗，用 rAF 在句尾更准时停，避免吞掉下一句开头。
  const tick = () => {
    if (generation !== sentencePlayGeneration) {
      sentenceStopRaf = 0
      return
    }
    if (sentenceEndAt != null && el.currentTime >= sentenceEndAt - 0.02) {
      el.pause()
      try {
        el.currentTime = sentenceEndAt
      }
      catch {
        /* ignore seek clamp */
      }
      sentenceEndAt = null
      speakingIndex.value = -1
      sentenceStopRaf = 0
      return
    }
    sentenceStopRaf = requestAnimationFrame(tick)
  }
  sentenceStopRaf = requestAnimationFrame(tick)
}

async function playOriginalSentence(idx: number, start: number, end: number) {
  const el = sentenceAudioEl.value
  // 已有原音时间戳时绝不回退 TTS：播放失败只提示重试媒体。
  if (!el) {
    mediaError.value = '原音播放器未就绪，请刷新后重试'
    return
  }
  audioEl.value?.pause()
  if (typeof speechSynthesis !== 'undefined')
    window.speechSynthesis?.cancel()
  stopSentenceAudio()
  const controller = new AbortController()
  seekController = controller
  ttsError.value = ''
  const generation = sentencePlayGeneration
  speakingIndex.value = idx
  sentenceEndAt = end
  el.playbackRate = playbackRate.value
  const ready = await whenAudioSeekable(el, controller.signal)
  if (generation !== sentencePlayGeneration || sentenceAudioEl.value !== el)
    return
  if (!ready) {
    sentenceEndAt = null
    speakingIndex.value = -1
    mediaError.value = '原音尚未加载完成，请稍候或点上方重试'
    return
  }
  try {
    el.currentTime = start
  }
  catch {
    sentenceEndAt = null
    speakingIndex.value = -1
    mediaError.value = '原音定位失败，请检查网络后重试'
    return
  }
  armSentenceEndWatch(el, generation)
  const p = el.play()
  if (p) {
    p.catch(() => {
      if (generation !== sentencePlayGeneration)
        return
      stopSentenceAudio()
      speakingIndex.value = -1
      mediaError.value = '原音播放失败，请检查网络后重试'
    })
  }
}

function onSentenceTimeUpdate() {
  const el = sentenceAudioEl.value
  if (el && sentenceEndAt != null && el.currentTime >= sentenceEndAt - 0.02) {
    el.pause()
    sentenceEndAt = null
    speakingIndex.value = -1
    if (sentenceStopRaf) {
      cancelAnimationFrame(sentenceStopRaf)
      sentenceStopRaf = 0
    }
  }
}

function playSentence(idx: number) {
  const s = sentences.value[idx]
  // B-1: while timings load, the sentence's true status is unknown; never
  // fall through to TTS for a sentence that may have original audio.
  if (!s || timingsLoading.value)
    return
  const timing = sentenceTiming(idx)
  // B-4:分流走 loadTimings.ts 的共用 helper，不再内联重复（闭集 ok/weak/
  // tts/skip 下与旧内联逻辑逐项一致；未知状态默认不播，fail-closed）。
  // ok/weak：一律原音。仅 status=tts（对齐确认音频中无此句）才朗读兜底。
  if (prefersOriginalAudio(timing)) {
    playOriginalSentence(idx, timing![0]!, timing![1]!)
    return
  }
  if (!shouldUseTtsFallback(timing))
    return
  playTtsSentence(idx)
}

function playTtsSentence(idx: number) {
  const s = sentences.value[idx]
  if (!s)
    return
  if (typeof speechSynthesis === 'undefined') {
    ttsError.value = '当前浏览器不支持语音朗读，点读暂不可用，可改用上方原录音对照原文。'
    return
  }
  ttsError.value = ''
  // 先暂停原录音，再朗读本句，避免两路叠加
  audioEl.value?.pause()
  stopSentenceAudio()
  playbackGeneration++
  window.speechSynthesis?.cancel()
  speakingIndex.value = idx
  // 去掉说话人标识再朗读
  const text = sentenceEntries.value[idx].text
  const sequence = ++playbackGeneration
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLanguage()
  u.onend = () => {
    if (sequence === playbackGeneration)
      speakingIndex.value = -1
  }
  u.onerror = () => {
    if (sequence === playbackGeneration) {
      speakingIndex.value = -1
      ttsError.value = '语音朗读失败（可能无可用语音包），点读暂不可用，可改用上方原录音对照原文。'
    }
  }
  speechSynthesis.speak(u)
}

function stopSentence() {
  playbackGeneration++
  window.speechSynthesis?.cancel()
  stopSentenceAudio()
  speakingIndex.value = -1
}

const audioSrc = computed(() => {
  // mock/cam18-test1-listening-part1.mp3
  const [cam, test] = selectedTest.value.split('-')
  return resolveMediaUrl(
    `mock/${cam}-${test}-listening-${selectedPart.value}.mp3`,
  )
})

const audioRelPath = computed(() => {
  const [cam, test] = selectedTest.value.split('-')
  return `mock/${cam}-${test}-listening-${selectedPart.value}.mp3`
})

let transcriptSequence = 0
async function loadTranscript() {
  const sequence = ++transcriptSequence
  const test = selectedTest.value
  const part = selectedPart.value
  loading.value = true
  loadError.value = false
  transcript.value = ''
  try {
    const mod = await transcriptModules[test]()
    // 导出名如 cam18Test1ListeningTranscript
    if (
      sequence !== transcriptSequence
      || test !== selectedTest.value
      || part !== selectedPart.value
    )
      return
    const key = Object.keys(mod).find(k => k.endsWith('ListeningTranscript'))
    if (key)
      transcript.value = mod[key][part] || ''
  }
  catch (e) {
    console.error('加载原文失败', e)
    if (sequence === transcriptSequence)
      loadError.value = true
  }
  if (sequence === transcriptSequence)
    loading.value = false
}

// —— 听写模式 ——
const dictationIndex = ref(0)
const dictationInput = ref('')
const dictationTokens = ref<DiffToken[] | null>(null)
const dictationChecked = ref(false)
const dictationPerfect = ref(false)
const dictationAccuracy = ref(0)
const dictationAddedMistake = ref(false)
const dictationMistakeError = ref(false)
const partSummary = ref({ attempted: 0, perfect: 0, accuracy: 0 })
// A-13: surfaced when a dictation progress save fails, so a lost write is
// visible instead of silent.
const dictationSaveFailed = ref(false)

const dictatableIndexes = computed(() =>
  sentenceEntries.value
    .map((_, i) => i)
    .filter((i) => {
      const status = timingStatus(i)
      // 听写优先原音句；无原音时间的句仍可听写（用 TTS 播）
      return status !== 'skip'
    }),
)

const currentDictationIdx = computed(() => {
  const pool = dictatableIndexes.value
  if (!pool.length)
    return -1
  const i = Math.min(Math.max(0, dictationIndex.value), pool.length - 1)
  return pool[i]
})

const currentDictationEntry = computed(() => {
  const i = currentDictationIdx.value
  return i >= 0 ? sentenceEntries.value[i] : null
})

function refreshPartSummary() {
  const progress = getDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
  )
  partSummary.value = summarizeDictationPart(progress)
}

function resetDictationUi(keepInput = false) {
  if (!keepInput)
    dictationInput.value = ''
  dictationTokens.value = null
  dictationChecked.value = false
  dictationPerfect.value = false
  dictationAccuracy.value = 0
  dictationAddedMistake.value = false
  dictationMistakeError.value = false
}

function loadDictationCursor() {
  const progress = getDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
  )
  const poolLen = dictatableIndexes.value.length
  dictationIndex.value
    = poolLen > 0 ? Math.min(progress.cursor, poolLen - 1) : 0
  refreshPartSummary()
  resetDictationUi()
}

function playCurrentDictation() {
  const i = currentDictationIdx.value
  if (i < 0)
    return
  playSentence(i)
}

function checkDictation() {
  const entry = currentDictationEntry.value
  // A-11: empty input must not count as a failed attempt. The button is
  // already disabled when empty; this guard closes the Ctrl+Enter path.
  if (!entry || timingsLoading.value || dictationChecked.value || !dictationInput.value.trim())
    return
  const expected = entry.text
  const result = diffDictation(expected, dictationInput.value)
  dictationTokens.value = result.tokens
  dictationChecked.value = true
  dictationPerfect.value = result.perfect
  dictationAccuracy.value = result.accuracy

  const progress = getDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
  )
  const sid = String(currentDictationIdx.value)
  const prev = progress.sentences[sid]
  progress.sentences[sid] = {
    attempts: (prev?.attempts ?? 0) + 1,
    perfect: (prev?.perfect ?? 0) + (result.perfect ? 1 : 0),
    lastAccuracy: result.accuracy,
    lastAt: Date.now(),
  }
  progress.cursor = dictationIndex.value
  // A-13: surface a save failure instead of silently dropping progress.
  dictationSaveFailed.value = !saveDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
    progress,
  )
  refreshPartSummary()
}

function addDictationMistake() {
  const entry = currentDictationEntry.value
  const i = currentDictationIdx.value
  if (!entry || i < 0 || dictationAddedMistake.value)
    return
  const testLabel
    = testOptions.find(t => t.id === selectedTest.value)?.label
      ?? selectedTest.value
  const partLabel
    = partOptions.find(p => p.id === selectedPart.value)?.label
      ?? selectedPart.value
  const timing = sentenceTiming(i)
  const hintParts = [
    `dictationmeta:${JSON.stringify({
      testId: selectedTest.value,
      part: selectedPart.value,
      sentence: i,
      audio: audioRelPath.value,
      start: timing?.[0] ?? null,
      end: timing?.[1] ?? null,
    })}`,
  ]
  const saved = addMistake('dictation', {
    key: `dictation:${selectedTest.value}:${selectedPart.value}:${i}`,
    title: entry.text,
    detail: [
      `${testLabel} · ${partLabel} · 第 ${i + 1} 句`,
      `你的作答：${dictationInput.value.trim() || '（空）'}`,
    ].join('\n'),
    hint: hintParts[0],
  })
  dictationAddedMistake.value = saved
  dictationMistakeError.value = !saved
}

function nextDictationSentence() {
  if (timingsLoading.value)
    return
  const pool = dictatableIndexes.value
  if (!pool.length)
    return
  if (dictationIndex.value < pool.length - 1)
    dictationIndex.value += 1
  else
    dictationIndex.value = 0
  const progress = getDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
  )
  progress.cursor = dictationIndex.value
  dictationSaveFailed.value = !saveDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
    progress,
  )
  resetDictationUi()
  stopSentence()
}

function prevDictationSentence() {
  if (timingsLoading.value)
    return
  const pool = dictatableIndexes.value
  if (!pool.length)
    return
  dictationIndex.value
    = dictationIndex.value > 0 ? dictationIndex.value - 1 : pool.length - 1
  const progress = getDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
  )
  progress.cursor = dictationIndex.value
  dictationSaveFailed.value = !saveDictationPartProgress(
    currentUser.value,
    selectedTest.value,
    selectedPart.value,
    progress,
  )
  resetDictationUi()
  stopSentence()
}

function tokenClass(mark: DiffToken['mark']) {
  if (mark === 'ok')
    return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
  if (mark === 'wrong')
    return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 line-through'
  if (mark === 'extra')
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 line-through'
  return 'bg-red-50 text-red-700 underline decoration-wavy dark:bg-red-900/30 dark:text-red-300'
}

watch(
  [selectedTest, selectedPart],
  () => {
    playbackGeneration++
    // 切篇/切 Part 先停掉旧朗读并复位高亮，避免旧句读完、新篇高亮错位
    window.speechSynthesis?.cancel()
    stopSentenceAudio()
    speakingIndex.value = -1
    showTranscript.value = false
    loadTranscript()
    loadTimingsForSelection()
  },
  { immediate: true },
)

watch(
  [mode, selectedTest, selectedPart, () => sentenceEntries.value.length, currentUser],
  () => {
    if (mode.value === 'dictation')
      loadDictationCursor()
  },
)

watch(dictatableIndexes, (indexes, previous) => {
  if (mode.value !== 'dictation' || timingsLoading.value || loading.value)
    return
  if (dictationInput.value || dictationChecked.value) {
    const index = indexes.indexOf(previous[dictationIndex.value])
    if (index >= 0) {
      dictationIndex.value = index
      return
    }
    // 当前句掉出听写池（如定时重试后被标为 skip）：已输入的答案保留，
    // 只清掉针对旧句的批改结果，光标移到最近的可听写句。
    dictationIndex.value = indexes.length > 0
      ? Math.min(dictationIndex.value, indexes.length - 1)
      : 0
    refreshPartSummary()
    resetDictationUi(true)
    return
  }
  loadDictationCursor()
})
watch(mode, stopSentence)

onMounted(() => {
  timer.start()
})

// 离页时停掉 TTS 与原录音，避免后台继续出声
onUnmounted(() => {
  transcriptSequence++
  timingsSequence++
  playbackGeneration++
  window.speechSynthesis?.cancel()
  audioEl.value?.pause()
  stopSentenceAudio()
  speakingIndex.value = -1
  timer.pause()
})

function setRate(r: number) {
  playbackRate.value = r
  if (audioEl.value)
    audioEl.value.playbackRate = r
  if (sentenceAudioEl.value)
    sentenceAudioEl.value.playbackRate = r
}

const testLabel = computed(
  () => testOptions.find(t => t.id === selectedTest.value)?.label ?? selectedTest.value,
)
</script>

<template>
  <div ref="mediaRoot" class="px-4 pt-6 2xl:px-0">
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
    <p
      v-if="ttsError"
      role="alert"
      class="my-3 border border-amber-300 rounded p-3 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ ttsError }}
    </p>
    <div class="mb-4">
      <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
        听力精听
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        剑 18–21 共 16 套真题原文；精听对照原文逐句点读，或切换听写模式遮住原文跟写
      </p>
    </div>

    <!-- 模式切换 -->
    <div class="mb-4 flex flex-wrap gap-2">
      <button
        :class="mode === 'intensive' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'"
        class="rounded-lg px-4 py-2 text-sm font-medium"
        @click="mode = 'intensive'"
      >
        精听对照
      </button>
      <button
        :class="mode === 'dictation' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'"
        class="rounded-lg px-4 py-2 text-sm font-medium"
        @click="mode = 'dictation'"
      >
        听写模式
      </button>
    </div>

    <!-- 选择器 -->
    <div class="mb-4 flex flex-wrap gap-3">
      <select
        v-model="selectedTest"
        class="border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option v-for="t in testOptions" :key="t.id" :value="t.id">
          {{ t.label }}
        </option>
      </select>
      <div class="flex gap-1">
        <button
          v-for="p in partOptions"
          :key="p.id"
          :class="
            selectedPart === p.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
          "
          class="rounded-lg px-4 py-2 text-sm font-medium"
          @click="selectedPart = p.id"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- 音频播放器（精听模式显示整段；听写模式隐藏整段控件，改用句级原音） -->
    <div
      v-if="mode === 'intensive'"
      class="mb-4 border border-gray-200 rounded-xl bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <audio
        ref="audioEl"
        :src="audioSrc"
        controls
        class="w-full"
        @error="mediaError = '音频加载失败，请检查网络后重试'"
        @loadeddata="mediaError = ''"
        @loadedmetadata="setRate(playbackRate)"
        @play="stopSentence()"
      />
      <!-- 点句原音用独立 audio，避免触发上方播放器的 @play 停句逻辑 -->
      <audio
        ref="sentenceAudioEl"
        :src="audioSrc"
        class="hidden"
        @timeupdate="onSentenceTimeUpdate"
        @ended="stopSentence"
      />
      <div class="mt-2 flex items-center gap-2">
        <span class="text-xs text-gray-500">语速：</span>
        <button
          v-for="r in [0.75, 1, 1.25, 1.5]"
          :key="r"
          :class="
            playbackRate === r
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
          "
          class="rounded px-2 py-1 text-xs"
          @click="setRate(r)"
        >
          {{ r }}x
        </button>
      </div>
    </div>
    <audio
      v-else
      ref="sentenceAudioEl"
      :src="audioSrc"
      class="hidden"
      @timeupdate="onSentenceTimeUpdate"
      @ended="stopSentence"
      @error="mediaError = '音频加载失败，请检查网络后重试'"
    />

    <!-- 听写模式 -->
    <div
      v-if="mode === 'dictation'"
      class="mb-4 border border-gray-200 rounded-xl bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ testLabel }} · {{ selectedPart.replace('part', 'Part ') }}
          · 第 {{ dictationIndex + 1 }} / {{ dictatableIndexes.length || 0 }} 句
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          本 Part 各句最近正确率平均
          {{ Math.round(partSummary.accuracy * 100) }}%
          （{{ partSummary.perfect }}/{{ partSummary.attempted || 0 }} 次全对）
        </p>
      </div>

      <p v-if="dictationSaveFailed" class="mb-2 text-xs text-red-600">
        进度保存失败，本次练习记录未落盘，请稍后重试
      </p>

      <div v-if="loading" class="text-sm text-gray-500">
        加载中…
      </div>
      <div v-else-if="currentDictationEntry" class="space-y-3">
        <p class="text-xs text-gray-400">
          原文已遮住。先听原声（可重播、调慢），再输入整句；比对忽略大小写与标点，数字写法可互通。
        </p>
        <div
          class="min-h-16 flex items-center justify-center rounded-lg bg-gray-100 px-3 py-6 text-sm text-gray-400 dark:bg-gray-900/50"
          aria-hidden="true"
        >
          ░░░░░ 原文已隐藏 ░░░░░
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            :disabled="timingsLoading"
            @click="speakingIndex === currentDictationIdx ? stopSentence() : playCurrentDictation()"
          >
            {{ timingsLoading ? '加载时间戳…' : speakingIndex === currentDictationIdx ? '停止' : prefersOriginalAudio(sentenceTiming(currentDictationIdx)) ? '播放原声' : '浏览器朗读' }}
          </button>
          <button
            class="rounded-lg bg-gray-200 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
            :disabled="timingsLoading"
            @click="playCurrentDictation()"
          >
            重播
          </button>
          <span class="text-xs text-gray-500">语速：</span>
          <button
            v-for="r in [0.75, 1, 1.25]"
            :key="r"
            :class="playbackRate === r ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'"
            class="rounded px-2 py-1 text-xs"
            @click="setRate(r)"
          >
            {{ r }}x
          </button>
        </div>
        <textarea
          v-model="dictationInput"
          rows="3"
          :disabled="dictationChecked || timingsLoading"
          placeholder="在此输入你听到的句子…"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          @keydown.ctrl.enter.prevent="checkDictation"
        />
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="dictationChecked || timingsLoading || !dictationInput.trim()"
            @click="checkDictation"
          >
            核对
          </button>
          <button
            class="rounded-lg bg-gray-200 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
            :disabled="timingsLoading"
            @click="prevDictationSentence"
          >
            上一句
          </button>
          <button
            class="rounded-lg bg-gray-200 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
            :disabled="timingsLoading"
            @click="nextDictationSentence"
          >
            下一句
          </button>
        </div>

        <div v-if="dictationChecked" class="border-t border-gray-100 pt-3 space-y-2 dark:border-gray-700">
          <p class="text-sm font-medium dark:text-white">
            {{ dictationPerfect ? '全对 ✓' : '有差异' }}
            · 本句正确率 {{ Math.round(dictationAccuracy * 100) }}%
          </p>
          <p class="text-xs text-gray-500">
            绿=正确 · 黄=替换 · 红删线=多写 · 红波浪=漏写
          </p>
          <p class="flex flex-wrap gap-1 text-sm leading-7">
            <span
              v-for="(tok, ti) in dictationTokens"
              :key="ti"
              class="rounded px-1"
              :class="tokenClass(tok.mark)"
            >
              <template v-if="tok.mark === 'ok'">{{ tok.actual }}</template>
              <template v-else-if="tok.mark === 'wrong'">{{ tok.actual }}→{{ tok.expected }}</template>
              <template v-else-if="tok.mark === 'extra'">+{{ tok.actual }}</template>
              <template v-else>⌫{{ tok.expected }}</template>
            </span>
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            原文：{{ currentDictationEntry.text }}
          </p>
          <button
            v-if="!dictationPerfect"
            class="border border-red-300 rounded-lg px-3 py-1.5 text-sm text-red-700 dark:border-red-800 dark:text-red-300 disabled:opacity-50"
            :disabled="dictationAddedMistake"
            @click="addDictationMistake"
          >
            {{ dictationAddedMistake ? '已加入错题本' : '加入错题本' }}
          </button>
          <p v-if="dictationMistakeError" role="alert" class="text-xs text-red-600">
            错题保存失败，请释放空间后重试
          </p>
        </div>
      </div>
      <div v-else-if="loadError" class="text-sm text-gray-500">
        原文加载失败
        <button class="ml-2 underline" @click="loadTranscript()">
          重试
        </button>
      </div>
      <div v-else class="text-sm text-gray-500">
        本 Part 暂无可听写句子
      </div>
    </div>

    <!-- 原文对照（精听模式） -->
    <div
      v-if="mode === 'intensive'"
      class="border border-gray-200 rounded-xl bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        class="w-full flex items-center justify-between p-4 text-left"
        @click="showTranscript = !showTranscript"
      >
        <span class="font-medium text-gray-900 dark:text-white">
          📄 {{ showTranscript ? "隐藏原文" : "查看原文对照" }}
        </span>
        <span class="text-gray-500">{{ showTranscript ? "▲" : "▼" }}</span>
      </button>
      <div
        v-if="showTranscript"
        class="border-t border-gray-200 p-4 dark:border-gray-700"
      >
        <div v-if="loading" class="text-sm text-gray-500">
          加载中…
        </div>
        <div v-else-if="sentences.length" class="space-y-1">
          <p class="px-2 pb-1 text-xs text-gray-400">
            🔊 点句播放原录音对应片段；仅个别原录音中找不到的句子会标 TTS 并用系统朗读；无按钮的句暂无可播内容。
          </p>
          <p v-if="timingsLoading" class="px-2 pb-1 text-xs text-gray-400">
            音频定位加载中，点读按钮稍后出现…
          </p>
          <p v-if="timingsError" class="px-2 pb-1 text-xs text-amber-600">
            音频定位加载失败，点读暂按系统朗读，可
            <button class="ml-1 underline" @click="loadTimingsForSelection()">
              重试
            </button>
          </p>
          <div
            v-for="(entry, i) in sentenceEntries"
            :key="i"
            :class="speakingIndex === i ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
            class="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <button
              v-if="(timingStatus(i) !== 'skip' && timingStatus(i) !== 'loading') || speakingIndex === i"
              class="mt-0.5 shrink-0 rounded-full p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900"
              :title="speakingIndex === i ? '停止' : (timingStatus(i) === 'tts' ? '系统朗读（暂无原音时间）' : '播放原音')"
              @click="speakingIndex === i ? stopSentence() : playSentence(i)"
            >
              <span
                v-if="speakingIndex === i"
                class="block h-4 w-4 text-blue-600"
              >⏹</span>
              <span v-else class="i-carbon-volume-up-filled block h-4 w-4" />
            </button>
            <span
              v-if="timingStatus(i) === 'tts'"
              class="mt-1 shrink-0 text-[10px] text-gray-400"
            >TTS</span>
            <p class="text-sm leading-7 text-gray-800 dark:text-gray-200">
              <span
                v-if="entry.speaker"
                class="mr-2 rounded bg-gray-100 px-1 text-xs font-bold text-gray-600 dark:bg-gray-700"
              >{{ entry.speaker }}</span>{{ entry.text }}
            </p>
          </div>
        </div>
        <div v-else-if="loadError" class="text-sm text-gray-500">
          原文加载失败，点击重试
          <button class="ml-2 underline" @click="loadTranscript()">
            重试
          </button>
        </div>
        <div v-else class="text-sm text-gray-500">
          暂无原文
        </div>
      </div>
    </div>

    <p class="mt-4 text-xs text-gray-400">
      建议用法：先盲听 1–2
      遍做题，再开原文逐句精听或切换听写模式跟写；点句优先播原录音片段，个别无时间戳的句子才用系统朗读。
    </p>
  </div>
</template>

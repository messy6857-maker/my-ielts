<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { speechLanguage } from '../../composables/useAudioGroup'

import { transcriptSentenceEntries } from '../../utils/text'
import { resolveMediaUrl } from '../../composables/useAudio'
import sentenceTimings from './sentence-timings.json'

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

const sentenceEntries = computed(() =>
  transcriptSentenceEntries(transcript.value),
)
const sentences = computed(() => sentenceEntries.value.map(x => x.display))
let playbackGeneration = 0
const audioEl = ref<HTMLAudioElement | null>(null)
const playbackRate = ref(1)
// 句级原音时间：[start, end, status]，status 为 ok/weak（播原音）、
// tts（无时间，走浏览器朗读并标注）、skip（无可播内容，不配按钮）
type SentenceTiming = [number | null, number | null, string]
const timingMap = sentenceTimings as unknown as Record<string, SentenceTiming[]>
function sentenceTiming(idx: number): SentenceTiming | undefined {
  const arr = timingMap[`${selectedTest.value}-${selectedPart.value}`]
  // 只有时间数组与当前显示的分句一一对应时才用原音；否则（如原文
  // 未按预期加载）一律走 TTS，绝不按序号播错句的音频
  if (!arr || arr.length !== sentenceEntries.value.length)
    return undefined
  return arr[idx]
}
function timingStatus(idx: number): string {
  return sentenceTiming(idx)?.[2] ?? 'tts'
}

const sentenceAudioEl = ref<HTMLAudioElement | null>(null)
let sentenceEndAt: number | null = null
let sentencePlayGeneration = 0

function stopSentenceAudio() {
  sentencePlayGeneration++
  sentenceAudioEl.value?.pause()
  sentenceEndAt = null
}

function whenAudioSeekable(el: HTMLAudioElement): Promise<boolean> {
  if (el.readyState >= HTMLMediaElement.HAVE_METADATA)
    return Promise.resolve(true)
  return new Promise((resolve) => {
    function cleanup() {
      el.removeEventListener('loadedmetadata', onReady)
      el.removeEventListener('error', onError)
    }
    function onReady() {
      cleanup()
      resolve(true)
    }
    function onError() {
      cleanup()
      resolve(false)
    }
    el.addEventListener('loadedmetadata', onReady)
    el.addEventListener('error', onError)
  })
}

async function playOriginalSentence(idx: number, start: number, end: number) {
  const el = sentenceAudioEl.value
  if (!el) {
    playTtsSentence(idx)
    return
  }
  audioEl.value?.pause()
  if (typeof speechSynthesis !== 'undefined')
    speechSynthesis.cancel()
  const generation = ++sentencePlayGeneration
  speakingIndex.value = idx
  sentenceEndAt = end
  el.playbackRate = playbackRate.value
  const ready = await whenAudioSeekable(el)
  if (generation !== sentencePlayGeneration || sentenceAudioEl.value !== el)
    return
  if (!ready) {
    sentenceEndAt = null
    speakingIndex.value = -1
    playTtsSentence(idx)
    return
  }
  try {
    el.currentTime = start
  }
  catch {
    sentenceEndAt = null
    speakingIndex.value = -1
    playTtsSentence(idx)
    return
  }
  const p = el.play()
  if (p) {
    p.catch(() => {
      if (generation !== sentencePlayGeneration)
        return
      sentenceEndAt = null
      speakingIndex.value = -1
      playTtsSentence(idx)
    })
  }
}

function onSentenceTimeUpdate() {
  const el = sentenceAudioEl.value
  if (el && sentenceEndAt != null && el.currentTime >= sentenceEndAt) {
    el.pause()
    sentenceEndAt = null
    speakingIndex.value = -1
  }
}

function playSentence(idx: number) {
  const s = sentences.value[idx]
  if (!s)
    return
  const timing = sentenceTiming(idx)
  if (timing && (timing[2] === 'ok' || timing[2] === 'weak') && timing[0] != null && timing[1] != null) {
    playOriginalSentence(idx, timing[0], timing[1])
    return
  }
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
  speechSynthesis.cancel()
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
  speechSynthesis.cancel()
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

watch(
  [selectedTest, selectedPart],
  () => {
    playbackGeneration++
    // 切篇/切 Part 先停掉旧朗读并复位高亮，避免旧句读完、新篇高亮错位
    speechSynthesis.cancel()
    stopSentenceAudio()
    speakingIndex.value = -1
    showTranscript.value = false
    loadTranscript()
  },
  { immediate: true },
)

// 离页时停掉 TTS 与原录音，避免后台继续出声
onUnmounted(() => {
  transcriptSequence++
  playbackGeneration++
  speechSynthesis.cancel()
  audioEl.value?.pause()
  stopSentenceAudio()
  speakingIndex.value = -1
})

function setRate(r: number) {
  playbackRate.value = r
  if (audioEl.value)
    audioEl.value.playbackRate = r
}
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
        剑 18–21 共 16 套真题原文，先盲听再对照原文精听
      </p>
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

    <!-- 音频播放器 -->
    <div
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

    <!-- 原文对照 -->
    <div
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
            🔊 点句播原录音对应片段；标 TTS 的句暂无原音时间，走浏览器朗读；无按钮的句暂无可播内容。
          </p>
          <div
            v-for="(entry, i) in sentenceEntries"
            :key="i"
            :class="speakingIndex === i ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
            class="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <button
              v-if="timingStatus(i) !== 'skip'"
              class="mt-0.5 shrink-0 rounded-full p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900"
              :title="speakingIndex === i ? '停止' : (timingStatus(i) === 'tts' ? '浏览器朗读（暂无原音时间）' : '播放原音')"
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
      遍做题，再开原文逐句精听，把没听出来的地方标出来，跟读浏览器朗读。
    </p>
  </div>
</template>

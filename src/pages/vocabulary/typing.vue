<script setup lang="ts">
import { useAudioGroup } from '../../composables/useAudioGroup'

import { resolveAudioUrl } from '../../composables/useAudio'
import vocabulary from './vocabulary'

const managedAudio = useAudioGroup()

const CHAPTER_KEY = 'vocabulary_typing_chapter'
const chapters = Object.keys(vocabulary)
const storedChapter = localStorage.getItem(CHAPTER_KEY)
const selectedChapter = ref(
  chapters.includes(storedChapter ?? '') ? storedChapter! : chapters[0],
)

const currentWordIndex = ref(0)
const userInput = ref('')
const ignoreCase = ref(
  localStorage.getItem('myielts_typing_ignore_case') === '1',
)
watch(ignoreCase, v =>
  localStorage.setItem('myielts_typing_ignore_case', v ? '1' : '0'),
)
const startTime = ref<number | null>(null)
const wpm = ref(0)
const accuracy = ref(100)
const isFinished = ref(false)
const wordHadError = ref(false)
const { addMistake } = useMistakes()
const { setProgress } = useProgress()
// 进词定时器：advancing 为真表示已完成待进词，窗口内输入不再处理
let advanceTimer: ReturnType<typeof setTimeout> | null = null
let advancing = false

const words = computed(() => {
  const chapter = (vocabulary as any)[selectedChapter.value]
  if (!chapter)
    return []
  // Flatten groups into a single list of words
  return chapter.words.flat()
})

const currentWordData = computed(() => words.value[currentWordIndex.value])
const currentWord = computed(() => currentWordData.value?.word[0] || '')

watch(selectedChapter, (newVal) => {
  localStorage.setItem(CHAPTER_KEY, newVal)
  reset()
})

function reset() {
  currentWordIndex.value = 0
  userInput.value = ''
  startTime.value = null
  wpm.value = 0
  accuracy.value = 100
  isFinished.value = false
  wordHadError.value = false
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  advancing = false
  setProgress('typing', 0, words.value.length)
  playAudio()
}

let audio = null as HTMLAudioElement | null
function playAudio() {
  const category = selectedChapter.value
  const word = currentWord.value
  const audioPath = resolveAudioUrl(`vocabulary/audio/${category}/${word}.mp3`)
  speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = managedAudio.play(audioPath, word)
}

// Normalize whitespace: replace non-breaking spaces and other unicode spaces with regular space
function normalizeInput(s: string) {
  return s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
}

function handleInput(e: Event) {
  if (!startTime.value)
    startTime.value = Date.now()

  const rawInput = (e.target as HTMLInputElement).value
  const input = normalizeInput(rawInput)
  // 已排进词定时器时（200ms 窗口内）忽略后续输入变化：多敲/删改都不再计错、
  // 也不重排定时器，避免一次完成连跳两词或正确词被误记错词本
  if (advancing)
    return
  // 输入变化先清掉待进词定时器（删改重输不再排两个定时器）
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  userInput.value = input
  // Sync normalized value back to DOM input
  if (rawInput !== input)
    (e.target as HTMLInputElement).value = input

  // Calculate Accuracy
  let correctChars = 0
  for (let i = 0; i < input.length; i++) {
    if (
      ignoreCase.value
        ? input[i]?.toLowerCase() === currentWord.value[i]?.toLowerCase()
        : input[i] === currentWord.value[i]
    ) {
      correctChars++
    }
    else if (!wordHadError.value) {
      // 出现过输错：这个词记入错词本候选
      wordHadError.value = true
    }
  }
  accuracy.value
    = input.length > 0 ? Math.round((correctChars / input.length) * 100) : 100

  // Calculate WPM (Words Per Minute)
  // Standard: 1 word = 5 characters
  const timeElapsed = (Date.now() - startTime.value) / 1000 / 60 // in minutes
  if (timeElapsed > 0)
    wpm.value = Math.round(input.length / 5 / timeElapsed)

  // Check if finished
  if (
    (ignoreCase.value
      ? input.toLowerCase() === currentWord.value.toLowerCase()
      : input === currentWord.value)
    && !advancing
  ) {
    advancing = true
    advanceTimer = setTimeout(nextWord, 200)
  }
}

function nextWord() {
  // 定时器已触发：清掉引用并解锁，下一词重新计时
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  advancing = false
  // 当前词若输错过，记入错词本
  if (wordHadError.value && currentWordData.value) {
    addMistake('typing', {
      key: `typing:${currentWord.value}`,
      title: currentWord.value,
      detail: `${currentWordData.value.pos} ${currentWordData.value.meaning}`,
      hint: currentWordData.value.example,
    })
  }
  wordHadError.value = false
  if (currentWordIndex.value < words.value.length - 1) {
    currentWordIndex.value++
    userInput.value = ''
    startTime.value = null
    setProgress('typing', currentWordIndex.value, words.value.length)
    playAudio()
  }
  else {
    setProgress('typing', words.value.length, words.value.length)
    isFinished.value = true
  }
}

onMounted(() => {
  reset()
})

// 离页时停掉 TTS 与音频，避免后台继续出声（与 KeywordFlashcard 的 onUnmounted 对齐；
// useAudioGroup 的 dispose 已有同类取消，此处显式兜底直接朗读的 TTS）
onUnmounted(() => {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
  advancing = false
  speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio = null
  }
})
</script>

<template>
  <label class="m-4 flex gap-2 text-sm"><input
    v-model="ignoreCase"
    type="checkbox"
  >忽略大小写（关闭时按原词拼写）</label>
  <div
    class="min-h-screen bg-gray-50 px-4 py-12 dark:bg-gray-900 lg:px-8 sm:px-6"
  >
    <div class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            单词打字练习
          </h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            照着背景单词输入，提升你的速度
          </p>
        </div>
        <select
          v-model="selectedChapter"
          class="block w-48 border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-blue-500"
        >
          <option v-for="c in chapters" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 mb-8 gap-2 sm:gap-4">
        <div
          class="border border-gray-200 rounded-xl bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs tracking-wider uppercase text-gray-500">
            准确率
          </div>
          <div
            class="text-2xl font-bold"
            :class="accuracy < 90 ? 'text-red-500' : 'text-green-500'"
          >
            {{ accuracy }}%
          </div>
        </div>
        <div
          class="border border-gray-200 rounded-xl bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs tracking-wider uppercase text-gray-500">
            WPM (速度)
          </div>
          <div class="text-2xl font-bold text-blue-500">
            {{ wpm }}
          </div>
        </div>
        <div
          class="border border-gray-200 rounded-xl bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="mb-1 text-xs tracking-wider uppercase text-gray-500">
            进度
          </div>
          <div class="text-2xl font-bold dark:text-white">
            {{ currentWordIndex + 1 }} / {{ words.length }}
          </div>
        </div>
      </div>

      <!-- Typing Area -->
      <div
        class="relative min-h-80 flex flex-col items-center justify-center overflow-hidden border border-gray-200 rounded-2xl bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <!-- Container for aligned layers -->
        <div
          class="relative mb-8 whitespace-pre-wrap break-all text-center text-4xl font-black tracking-tighter font-mono md:text-7xl sm:text-6xl"
        >
          <!-- Background Word (Grey) -->
          <div class="text-gray-100 dark:text-gray-700">
            {{ currentWord }}
          </div>

          <!-- Feedback Layer (Overlay) -->
          <div class="absolute inset-0 flex">
            <span
              v-for="(char, index) in currentWord"
              :key="index"
              class="inline-block"
              :class="{
                'text-green-500': userInput.charAt(Number(index)) === char,
                'text-red-500':
                  userInput.charAt(Number(index)) !== ''
                  && userInput.charAt(Number(index)) !== char,
                'text-transparent': userInput.charAt(Number(index)) === '',
              }"
            >
              {{ char }}
            </span>
          </div>
        </div>

        <!-- Invisible Input covering the whole area -->
        <input
          v-model="userInput"
          type="text"
          class="absolute inset-0 h-full w-full cursor-default caret-transparent opacity-0"
          autofocus
          autocapitalize="off"
          autocorrect="off"
          autocomplete="off"
          spellcheck="false"
          :disabled="isFinished"
          @input="handleInput"
        >

        <!-- Meaning & Example (Hint) -->
        <div
          class="w-full border-t border-gray-100 pt-6 text-center dark:border-gray-700"
        >
          <div
            class="mb-2 text-xl font-medium text-gray-800 dark:text-gray-200"
          >
            <span
              style="font-style: italic; font-family: times"
              class="mr-2 text-sm font-normal tracking-wide text-gray-400"
            >
              {{ currentWordData?.pos }}
            </span>
            {{ currentWordData?.meaning }}
          </div>
          <p
            class="mx-auto max-w-xl text-sm italic text-gray-500 sm:text-base dark:text-gray-400"
          >
            {{ currentWordData?.example }}
          </p>
        </div>

        <!-- Audio trigger hint -->
        <div class="absolute right-4 top-4">
          <button
            class="p-2 text-gray-400 transition-colors hover:text-blue-500"
            @click="playAudio"
          >
            <i class="i-ph-speaker-high-bold block text-xl" />
          </button>
        </div>
      </div>

      <!-- Finish Overlay -->
      <div
        v-if="isFinished"
        class="mt-8 animate-bounce rounded-2xl bg-blue-600 p-6 text-center text-white shadow-xl"
      >
        <h2 class="mb-2 text-2xl font-bold">
          太棒了！恭喜完成本章练习 🎉
        </h2>
        <button
          class="mt-4 rounded-full bg-white px-6 py-2 font-bold text-blue-600 transition-colors hover:bg-blue-50"
          @click="reset"
        >
          再练一次
        </button>
      </div>

      <!-- Instructions -->
      <div class="mt-8 text-center text-sm text-gray-400">
        提示：直接开始输入即可，输入正确后会自动进入下一个单词。
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure the input always has focus or can be focused easily */
.relative:focus-within {
  @apply ring-4 ring-blue-500/20 border-blue-500;
}
</style>

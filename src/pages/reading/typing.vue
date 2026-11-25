<script setup lang="ts">
import type { CheckedChar } from '../../utils/articleTyping'
import { speechLanguage } from '../../composables/useAudioGroup'
import { usePersistentBool } from '../../composables/usePersistentBool'
import { useTypingSound } from '../../composables/useTypingSound'
import { checkTyping, splitSentences, wordCount } from '../../utils/articleTyping'
import indexData from './daily/index.json'

// 文章逐句跟打 / 默写：把每日阅读的文章拆成句子，一句一句打。
// 跟打：看着原句打；默写：只听朗读（可以“看一眼原句”），打对的字母才显示出来。
// 打完一句自动进下一句；进度按文章记在这台设备上，下次接着打。
defineOptions({ name: 'ReadingTypingPage' })

interface Reading {
  title: string
  source?: string
  passage: string
}
interface DailyData {
  date: string
  newsReadings: Reading[]
}
const modules = import.meta.glob('./daily/[0-9]*.json') as Record<string, () => Promise<{ default: DailyData }>>
const dates = (indexData.dates as string[])
  .filter(d => modules[`./daily/${d}.json`])
  .sort()
  .reverse()

const route = useRoute()
const router = useRouter()
type Mode = 'copy' | 'dictation'
function queryString(v: unknown) {
  return typeof v === 'string'
    ? v
    : ''
}
const date = ref(dates.includes(queryString(route.query.date))
  ? queryString(route.query.date)
  : dates[0] ?? '')
const articleIndex = ref(Math.max(0, Math.floor(Number(route.query.a)) || 0))
const mode = ref<Mode>(route.query.mode === 'dictation'
  ? 'dictation'
  : 'copy')

const strict = usePersistentBool('myielts_article_typing_strict_v1', false)
const autoRead = usePersistentBool('myielts_article_typing_read_v1', true)
const { enabled: soundOn, play: playSound } = useTypingSound()

const daily = shallowRef<DailyData | null>(null)
const loading = ref(false)
const loadError = ref(false)
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const loader = modules[`./daily/${date.value}.json`]
  daily.value = null
  loadError.value = false
  if (!loader)
    return
  loading.value = true
  try {
    const data = (await loader()).default
    if (seq !== loadSeq)
      return
    daily.value = data
    if (articleIndex.value >= data.newsReadings.length)
      articleIndex.value = 0
    restart(savedPosition())
  }
  catch {
    if (seq === loadSeq)
      loadError.value = true
  }
  finally {
    if (seq === loadSeq)
      loading.value = false
  }
}
const article = computed(() => daily.value?.newsReadings[articleIndex.value] ?? null)
const sentences = computed(() => article.value
  ? splitSentences(article.value.passage)
  : [])

// —— 进度（设备级，按日期+篇记到第几句）——
const POSITION_KEY = 'myielts_article_typing_pos_v1'
function positionId() {
  return `${date.value}#${articleIndex.value}`
}
function readPositions(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(POSITION_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v)
      ? v
      : {}
  }
  catch {
    return {}
  }
}
function savedPosition() {
  const n = readPositions()[positionId()]
  return Number.isInteger(n) && n > 0
    ? n
    : 0
}
function savePosition(n: number) {
  try {
    const all = readPositions()
    if (n > 0)
      all[positionId()] = n
    else delete all[positionId()]
    localStorage.setItem(POSITION_KEY, JSON.stringify(all))
  }
  catch {
    /* 存不了进度不影响练习 */
  }
}

// —— 练习状态 ——
const index = ref(0)
const input = ref('')
const peek = ref(false)
const finished = ref(false)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const stats = reactive({
  keys: 0,
  wrong: 0,
  words: 0,
  sentences: 0,
  startedAt: 0,
  finishedAt: 0,
})
let lastErrors = 0
let lastLength = 0
let advanceTimer: ReturnType<typeof setTimeout> | null = null

const sentence = computed(() => sentences.value[index.value] ?? '')
const check = computed(() => sentence.value
  ? checkTyping(input.value, sentence.value, strict.value)
  : null)
/** 光标位置：第一个还没打的要求字符 */
const cursorAt = computed(() => check.value?.chars.findIndex(c => c.required && c.state === 'todo') ?? -1)

function clearAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}
function speak(text = sentence.value) {
  try {
    const synth = window.speechSynthesis
    if (!synth || !text)
      return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = speechLanguage()
    u.rate = 0.9
    synth.speak(u)
  }
  catch {
    /* 浏览器不支持朗读 */
  }
}
function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel()
  }
  catch {}
}
async function enterSentence() {
  clearAdvance()
  input.value = ''
  peek.value = false
  lastErrors = 0
  lastLength = 0
  await nextTick()
  inputEl.value?.focus()
  if (mode.value === 'dictation' || autoRead.value)
    speak()
}
function restart(from = 0) {
  clearAdvance()
  stopSpeaking()
  Object.assign(stats, {
    keys: 0,
    wrong: 0,
    words: 0,
    sentences: 0,
    startedAt: 0,
    finishedAt: 0,
  })
  finished.value = false
  index.value = Math.min(from, Math.max(0, sentences.value.length - 1))
  if (sentences.value.length)
    enterSentence()
}
function goTo(next: number) {
  if (next >= sentences.value.length) {
    stats.finishedAt = Date.now()
    finished.value = true
    savePosition(0)
    stopSpeaking()
    return
  }
  index.value = next
  savePosition(next)
  enterSentence()
}
function onInput() {
  const c = check.value
  if (!c || advanceTimer)
    return
  if (!stats.startedAt)
    stats.startedAt = Date.now()
  if (input.value.length > lastLength) {
    stats.keys++
    if (c.errors > lastErrors) {
      stats.wrong++
      playSound('wrong')
    }
    else {
      playSound('key')
    }
  }
  lastErrors = c.errors
  lastLength = input.value.length
  if (c.done) {
    playSound('done')
    stats.words += wordCount(sentence.value)
    stats.sentences++
    const at = index.value
    advanceTimer = setTimeout(() => {
      advanceTimer = null
      if (index.value === at && !finished.value)
        goTo(at + 1)
    }, 350)
  }
}
function skipSentence() {
  if (finished.value || !sentence.value)
    return
  goTo(index.value + 1)
}
function togglePeek() {
  if (mode.value === 'dictation')
    peek.value = !peek.value
}
function setMode(m: Mode) {
  if (mode.value === m)
    return
  mode.value = m
  router.replace({
    query: {
      ...route.query,
      mode: m === 'dictation'
        ? 'dictation'
        : undefined,
    },
  })
  restart(index.value)
}

// 快捷键：Tab 朗读这一句、Alt+K 看一眼原句（默写）、Alt+S 跳过这句；回车不换行
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || finished.value)
    return
  const inField = event.target === inputEl.value
  if (inField && event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    speak()
    return
  }
  if (inField && event.key === 'Enter') {
    event.preventDefault()
    return
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
    const action = ({ KeyK: togglePeek, KeyS: skipSentence } as Record<string, () => void>)[event.code]
    if (action) {
      event.preventDefault()
      action()
    }
  }
}

// —— 显示 ——
function shownChar(c: CheckedChar): string {
  if (mode.value === 'copy' || peek.value || !c.required)
    return c.char
  if (c.state === 'ok')
    return c.char
  if (c.state === 'bad') {
    return c.typed === ' '
      ? '·'
      : c.typed ?? '_'
  }
  // 默写时还没打到的字母用下划线占位，空格照常
  return /\s/.test(c.char)
    ? c.char
    : '_'
}
function charClass(c: CheckedChar, i: number) {
  const cursor = i === cursorAt.value
    ? ' border-b-2 border-blue-500'
    : ''
  if (c.state === 'ok')
    return `text-green-700 dark:text-green-400${cursor}`
  if (c.state === 'bad')
    return `rounded-sm bg-red-100 text-red-700 underline dark:bg-red-900/40 dark:text-red-300${cursor}`
  if (c.state === 'passed')
    return `text-gray-700 dark:text-gray-200${cursor}`
  return `text-gray-400 dark:text-gray-500${cursor}`
}
const progressPercent = computed(() => sentences.value.length
  ? Math.round((index.value / sentences.value.length) * 100)
  : 0)
const previous = computed(() => sentences.value.slice(Math.max(0, index.value - 2), index.value))
const minutes = computed(() => Math.max(1 / 60, ((stats.finishedAt || Date.now()) - (stats.startedAt || Date.now())) / 60000))
const speed = computed(() => Math.round(stats.words / minutes.value))
const accuracy = computed(() => stats.keys
  ? Math.max(0, Math.round((1 - stats.wrong / stats.keys) * 100))
  : 100)
function duration() {
  const sec = Math.round(minutes.value * 60)
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
}

watch([date, articleIndex], () => {
  router.replace({
    query: {
      ...route.query,
      date: date.value,
      a: String(articleIndex.value),
    },
  })
})
watch(date, () => {
  articleIndex.value = 0
  load()
})
watch(articleIndex, () => {
  if (daily.value)
    restart(savedPosition())
})
watch(strict, () => {
  lastErrors = check.value?.errors ?? 0
})
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearAdvance()
  stopSpeaking()
})
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="mx-auto max-w-3xl text-gray-900 dark:text-white">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <StudyBack to="/reading/daily" label="每日阅读" />
        <div>
          <h3 class="text-xl font-bold">
            文章跟打 / 默写
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            一句一句打，打完自动进下一句。进度记在这台设备上。
          </p>
        </div>
      </div>

      <div class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800" data-typing-setup>
        <div class="mb-3 flex flex-wrap gap-2">
          <select v-model="date" aria-label="日期" class="border border-gray-300 rounded-lg bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option v-for="d in dates" :key="d" :value="d">
              {{ d }}
            </option>
          </select>
          <select v-if="daily" v-model.number="articleIndex" aria-label="文章" class="min-w-0 flex-1 border border-gray-300 rounded-lg bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option v-for="(r, i) in daily.newsReadings" :key="i" :value="i">
              {{ r.title }}
            </option>
          </select>
        </div>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div class="inline-flex overflow-hidden border border-gray-300 rounded-lg dark:border-gray-600" role="group" aria-label="练法">
            <button
              v-for="m in (['copy', 'dictation'] as const)"
              :key="m"
              type="button"
              :data-typing-mode="m"
              :aria-pressed="mode === m"
              class="px-3 py-1.5"
              :class="mode === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200'"
              @click="setMode(m)"
            >
              {{ m === 'copy' ? '跟打' : '默写' }}
            </button>
          </div>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="strict" type="checkbox" data-strict-toggle>
            标点也要打
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="autoRead" type="checkbox">
            跟打时每句自动朗读
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="soundOn" type="checkbox">
            打字音效
          </label>
        </div>
      </div>

      <p v-if="loadError" class="text-amber-700" role="alert">
        文章加载失败。<button class="underline" @click="load">
          重试
        </button>
      </p>
      <p v-else-if="loading" role="status">
        加载中…
      </p>
      <p v-else-if="!article || !sentences.length" class="text-gray-600 dark:text-gray-300">
        这一天没有可以练的文章。
      </p>

      <!-- 打完了 -->
      <div v-else-if="finished" class="border border-gray-200 rounded-2xl bg-white p-6 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800" data-typing-done>
        <h4 class="text-2xl font-bold">
          这篇{{ mode === 'copy' ? '跟打' : '默写' }}完了
        </h4>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ article.title }}
        </p>
        <div class="grid grid-cols-2 mx-auto mt-4 max-w-md gap-3 sm:grid-cols-4">
          <div>
            <div class="text-2xl font-bold">
              {{ stats.sentences }}
            </div><div class="text-xs text-gray-500">
              句
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold">
              {{ duration() }}
            </div><div class="text-xs text-gray-500">
              用时
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold" data-speed>
              {{ speed }}
            </div><div class="text-xs text-gray-500">
              词/分钟
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold" data-accuracy>
              {{ accuracy }}%
            </div><div class="text-xs text-gray-500">
              准确率
            </div>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap justify-center gap-3">
          <button class="rounded-lg bg-blue-600 px-5 py-2 text-white" @click="restart(0)">
            再来一遍
          </button>
          <button class="border border-gray-300 rounded-lg px-5 py-2 dark:border-gray-600" @click="setMode(mode === 'copy' ? 'dictation' : 'copy'); restart(0)">
            换成{{ mode === 'copy' ? '默写' : '跟打' }}
          </button>
        </div>
      </div>

      <!-- 练习 -->
      <div v-else data-typing>
        <div class="mb-2 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span class="truncate pr-3 font-medium">{{ article.title }}</span>
          <span class="shrink-0" data-typing-progress>第 {{ index + 1 }} / {{ sentences.length }} 句</span>
        </div>
        <div class="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div class="h-full bg-blue-600 transition-all" :style="{ width: `${progressPercent}%` }" />
        </div>

        <p v-for="(s, i) in previous" :key="`${index}-${i}`" class="mb-1 text-sm text-gray-400 dark:text-gray-500">
          {{ s }}
        </p>

        <div class="border border-gray-200 rounded-2xl bg-white p-5 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <p class="mb-4 whitespace-pre-wrap break-words text-xl leading-relaxed font-mono" data-sentence aria-hidden="true">
            <span v-for="(c, i) in check?.chars ?? []" :key="i" :class="charClass(c, i)">{{ shownChar(c) }}</span>
          </p>
          <p class="sr-only">
            {{ mode === 'copy' || peek ? sentence : '默写：听朗读后输入这一句' }}
          </p>
          <textarea
            ref="inputEl"
            v-model="input"
            rows="2"
            aria-label="输入这一句"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            class="block w-full resize-none border border-gray-300 rounded-lg bg-white p-3 text-lg dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            data-typing-input
            @input="onInput"
          />
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="border border-gray-300 rounded-lg px-3 py-1.5 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" title="Tab" @click="speak()">
                🔊 朗读这一句
              </button>
              <button v-if="mode === 'dictation'" type="button" data-peek class="border border-gray-300 rounded-lg px-3 py-1.5 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" title="Alt+K" @click="togglePeek">
                {{ peek ? '藏起原句' : '看一眼原句' }}
              </button>
              <button type="button" data-skip-sentence class="border border-gray-300 rounded-lg px-3 py-1.5 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" title="Alt+S" @click="skipSentence">
                跳过这句
              </button>
            </div>
            <span class="text-gray-500 dark:text-gray-400">
              错 {{ check?.errors ?? 0 }} 处
              <button v-if="index > 0" type="button" class="ml-2 underline" @click="restart(0)">从头开始</button>
            </span>
          </div>
        </div>
        <p class="mt-3 hidden text-center text-xs text-gray-400 sm:block">
          快捷键：Tab 朗读这一句 · Alt(⌥)+K 看一眼原句（默写） · Alt+S 跳过这句{{ strict ? '' : ' · 不用打标点，连字符可以打成空格' }}
        </p>
      </div>
    </div>
  </div>
</template>

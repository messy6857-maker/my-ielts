<script setup lang="ts">
import { speechLanguage } from '../../composables/useAudioGroup'

import TextHighlights from '../../components/TextHighlights.vue'
import { useAuth } from '../../composables/useAuth'
import { getToken } from '../../composables/syncClient'
import { SYNC_API_BASE } from '../../sync-config'
import { wordPhonetics } from '../vocabulary/wordPhonetics'
import { lookupVocabularyMeaning } from '../vocabulary/loadVocabulary'
import { translateWithAI } from '../../composables/useAISettings'
import { stopAllAudio } from '../../composables/useSingleAudio'
import indexData from './daily/index.json'

const { currentUser } = useAuth()

interface WordNote {
  word: string
  pos: string
  meaning: string
}

interface Question {
  q: string
  options: string[]
  answer: number
}

interface Reading {
  title: string
  source?: string
  basedOn?: string[]
  passage: string
  notes: WordNote[]
  questions: Question[]
}

interface DailyData {
  date: string
  newsReadings: Reading[]
}

// 加载所有日期数据（构建时打包）
const modules = import.meta.glob('./daily/[0-9]*.json', {
  eager: false,
}) as Record<string, () => Promise<{ default: DailyData }>>

const dates = computed(() => {
  const list = (indexData.dates as string[]).filter(
    d => modules[`./daily/${d}.json`],
  )
  return [...list].sort().reverse()
})

const selectedDate = ref(dates.value[0] ?? '')
const daily = ref<DailyData | null>(null)
const dailyLoading = ref(false)
const dailyLoadError = ref(false)
let dailySequence = 0
async function loadDaily() {
  const sequence = ++dailySequence
  daily.value = null
  dailyLoading.value = true
  dailyLoadError.value = false
  try {
    const data = await modules[`./daily/${selectedDate.value}.json`]?.()
    if (sequence === dailySequence)
      daily.value = data?.default ?? null
  }
  catch {
    if (sequence === dailySequence)
      dailyLoadError.value = true
  }
  finally {
    if (sequence === dailySequence)
      dailyLoading.value = false
  }
}
watch(selectedDate, loadDaily, { immediate: true })

// 当前账号的词汇阅读：从后端按 JWT 取，只能拿到自己的
const myVocabReading = ref<Reading | null>(null)
const vocabLoading = ref(false)
const vocabError = ref(false)
// 请求序号：快速切日期时，旧日期的慢响应不覆盖新日期
let vocabReqSeq = 0
let vocabController: AbortController | null = null
async function loadMyVocabReading() {
  const seq = ++vocabReqSeq
  vocabController?.abort()
  vocabController = new AbortController()
  myVocabReading.value = null
  vocabError.value = false
  vocabLoading.value = false
  const owner = currentUser.value
  const t = getToken(owner)
  if (!currentUser.value || !t || !selectedDate.value)
    return
  vocabLoading.value = true
  try {
    const resp = await fetch(
      `${SYNC_API_BASE}/daily-reading?date=${selectedDate.value}`,
      {
        headers: { Authorization: `Bearer ${t}` },
        signal: vocabController.signal,
      },
    )
    if (
      seq !== vocabReqSeq
      || owner !== currentUser.value
      || t !== getToken(owner)
    )
      return
    if (!resp.ok)
      throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    if (
      seq !== vocabReqSeq
      || owner !== currentUser.value
      || t !== getToken(owner)
    )
      return
    if (
      data.ok
      && data.reading
      && typeof data.reading.title === 'string'
      && typeof data.reading.passage === 'string'
      && Array.isArray(data.reading.notes)
      && Array.isArray(data.reading.questions)
      && data.reading.notes.every(
        (n: WordNote) =>
          n
          && typeof n.word === 'string'
          && typeof n.meaning === 'string'
          && typeof n.pos === 'string',
      )
      && data.reading.questions.every(
        (q: Question) =>
          q
          && typeof q.q === 'string'
          && Array.isArray(q.options)
          && q.options.every(o => typeof o === 'string')
          && Number.isInteger(q.answer)
          && q.answer >= 0
          && q.answer < q.options.length,
      )
    )
      myVocabReading.value = data.reading
    // 校验失败不是“无阅读”：后端结构损坏时与 HTTP 失败同态，走加载失败分支；
    // 只有 ok:true 且 reading:null 才是真正无阅读，仍落入“暂无”分支。
    else if (seq === vocabReqSeq && !(data.ok && data.reading === null))
      vocabError.value = true
  }
  catch {
    // 只有最新请求才置失败态，旧请求的失败不干扰新日期
    if (seq === vocabReqSeq)
      vocabError.value = true
  }
  finally {
    if (seq === vocabReqSeq)
      vocabLoading.value = false
  }
}
watch([selectedDate, currentUser], loadMyVocabReading, { immediate: true })
onUnmounted(() => {
  vocabReqSeq++
  vocabController?.abort()
})

// 生词注释：点击展开/收起中文（复用自测卡片的彩色样式）
const dotColors = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
]
const textColors = [
  'text-blue-600 dark:text-blue-400',
  'text-purple-600 dark:text-purple-400',
  'text-pink-600 dark:text-pink-400',
  'text-orange-600 dark:text-orange-400',
  'text-teal-600 dark:text-teal-400',
  'text-indigo-600 dark:text-indigo-400',
]
const expandedNotes = ref(new Set<string>())
function toggleNote(key: string) {
  if (expandedNotes.value.has(key))
    expandedNotes.value.delete(key)
  else expandedNotes.value.add(key)
}

// 选择题：记录每题所选选项
const answers = ref<Record<string, number>>({})
function selectOption(key: string, idx: number) {
  // 已作答后不允许更改
  if (key in answers.value)
    return
  answers.value[key] = idx
}
function optionClass(
  articleKey: string,
  qIdx: number,
  optIdx: number,
  correctIdx: number,
) {
  const key = `${articleKey}-${qIdx}`
  const chosen = answers.value[key]
  const base
    = 'block w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors '
  if (chosen === undefined) {
    return `${
      base
    }border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20`
  }
  if (optIdx === correctIdx) {
    return `${
      base
    }border-green-500 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300`
  }
  if (optIdx === chosen) {
    return `${
      base
    }border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300`
  }
  return `${
    base
  }border-gray-200 bg-white opacity-60 dark:border-gray-700 dark:bg-gray-800`
}

watch(selectedDate, () => {
  expandedNotes.value = new Set()
  answers.value = {}
})
watch(currentUser, () => {
  // Public news answers remain valid. Private reading changes with owner.
  const privatePrefix = `${selectedDate.value}-vocab-`
  answers.value = Object.fromEntries(
    Object.entries(answers.value).filter(([key]) => !key.startsWith(privatePrefix)),
  )
  expandedNotes.value = new Set(
    [...expandedNotes.value].filter(key => !key.startsWith(privatePrefix)),
  )
}, { flush: 'sync' })

// 右下角阅读索引：点击直接跳到对应文章（词汇阅读 + 热点阅读按顺序编号）
const readingIndex = computed(() => {
  const items: { id: string; label: string }[] = []
  if (myVocabReading.value)
    items.push({ id: 'reading-vocab', label: '阅读1' })
  const n = daily.value?.newsReadings.length ?? 0
  for (let i = 0; i < n; i++)
    items.push({ id: `reading-news-${i}`, label: `阅读${items.length + 1}` })
  return items
})
function jumpTo(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: 'instant', block: 'start' })
}

// 词汇注释：音标 + 朗读
function phoneticOf(word: string): string {
  return wordPhonetics[word.toLowerCase().trim()] ?? ''
}
function speak(word: string) {
  try {
    stopAllAudio()
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = speechLanguage()
    u.rate = 0.85
    synth.speak(u)
  }
  catch {
    // 不支持的浏览器静默忽略
  }
}

// 点词查义 / 选中翻译：底部翻译弹窗
interface TranslatePopupState {
  source: string
  kind: 'word' | 'selection'
  phonetic: string
  pos: string
  meaning: string
  loading: boolean
  error: string
  showTranslateButton: boolean
}
const translatePopup = ref<TranslatePopupState | null>(null)
let translateSeq = 0
let translateAbort: AbortController | null = null

function closeTranslatePopup() {
  translateSeq++
  translateAbort?.abort()
  translateAbort = null
  translatePopup.value = null
  const sel = window.getSelection()
  if (sel)
    sel.removeAllRanges()
}

/** “翻译成中文”按钮：走 AI，失败时留按钮可重试（选中句子和单词 AI 重试共用）。 */
async function runAITranslate() {
  const popup = translatePopup.value
  if (!popup)
    return
  const seq = ++translateSeq
  translateAbort?.abort()
  translateAbort = new AbortController()
  popup.loading = true
  popup.error = ''
  popup.showTranslateButton = false
  try {
    const result = await translateWithAI(popup.source, translateAbort.signal)
    if (seq !== translateSeq)
      return
    popup.meaning = result
    popup.loading = false
  }
  catch (e) {
    if (seq !== translateSeq)
      return
    popup.loading = false
    popup.error = e instanceof Error ? e.message : '翻译失败，请重试'
    popup.showTranslateButton = true
  }
}

/** 点词查义：文章注释 → 本站词库 → AI（自动走，不用再点）。 */
async function openWordPopup(word: string, notes: WordNote[]) {
  const seq = ++translateSeq
  translateAbort?.abort()
  translateAbort = new AbortController()
  const lower = word.toLowerCase()
  const popup: TranslatePopupState = {
    source: word,
    kind: 'word',
    phonetic: phoneticOf(word),
    pos: '',
    meaning: '',
    loading: true,
    error: '',
    showTranslateButton: false,
  }
  translatePopup.value = popup
  // 1. 文章注释（最贴合本文）
  const note = notes.find(n => n.word.toLowerCase().trim() === lower)
  if (note) {
    if (seq !== translateSeq)
      return
    popup.pos = note.pos
    popup.meaning = note.meaning
    popup.loading = false
    return
  }
  // 2. 本站词库（免费、即时；首次查词时懒加载全部章节建索引）
  try {
    const vocab = await lookupVocabularyMeaning(word)
    if (seq !== translateSeq)
      return
    if (vocab) {
      popup.pos = vocab.pos
      popup.meaning = vocab.meaning
      popup.loading = false
      return
    }
  }
  catch {
    // 词库加载失败不阻塞，继续走 AI
  }
  // 3. AI 翻译（词库没有的词）
  if (seq !== translateSeq)
    return
  try {
    const result = await translateWithAI(word, translateAbort.signal)
    if (seq !== translateSeq)
      return
    popup.meaning = result
    popup.loading = false
  }
  catch (e) {
    if (seq !== translateSeq)
      return
    popup.loading = false
    popup.error = e instanceof Error ? e.message : '翻译失败，请重试'
    popup.showTranslateButton = true
  }
}

function openSelectionPopup(text: string) {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed)
    return
  translateSeq++
  translateAbort?.abort()
  translateAbort = null
  translatePopup.value = {
    source: trimmed.length > 2000 ? trimmed.slice(0, 2000) : trimmed,
    kind: 'selection',
    phonetic: '',
    pos: '',
    meaning: '',
    loading: false,
    error: '',
    showTranslateButton: true,
  }
}

/** 点中单词：用点击坐标找所在单词（不改 TextHighlights，不影响模考阅读页）。 */
function wordAtPoint(x: number, y: number): string | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const range = doc.caretRangeFromPoint?.(x, y)
  if (!range)
    return null
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE)
    return null
  const text = node.textContent ?? ''
  const offset = range.startOffset
  const isLetter = (i: number) => i >= 0 && i < text.length && /[A-Za-z]/.test(text[i])
  // 点在字母上才算点中单词（点在空格/标点上不触发）
  if (!isLetter(offset) && !isLetter(offset - 1))
    return null
  let start = offset
  while (start > 0 && /[A-Za-z']/.test(text[start - 1])) start--
  let end = offset
  while (end < text.length && /[A-Za-z']/.test(text[end])) end++
  const word = text.slice(start, end).replace(/^'+|'+$/g, '')
  return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(word) ? word : null
}

function onPassageClick(e: MouseEvent, notes: WordNote[]) {
  // 有选区时不处理点词（选区走翻译分支）
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed)
    return
  const word = wordAtPoint(e.clientX, e.clientY)
  if (!word)
    return
  openWordPopup(word, notes)
}

/** 选区所在文章的注释（双击选词时也要先查文章注释）。 */
function articleNotesForNode(node: Node | null): WordNote[] {
  const el = node instanceof Element ? node : node?.parentElement
  const container = el?.closest?.('[data-article]')
  const key = container?.getAttribute('data-article') ?? ''
  if (key === 'vocab')
    return myVocabReading.value?.notes ?? []
  if (key.startsWith('news-')) {
    const idx = Number(key.slice(5))
    return daily.value?.newsReadings[idx]?.notes ?? []
  }
  return []
}

let selectionTimer: ReturnType<typeof setTimeout> | null = null
function onSelectionChange() {
  if (selectionTimer)
    clearTimeout(selectionTimer)
  selectionTimer = setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed)
      return
    const text = sel.toString().trim()
    if (text.length < 2 || text.length > 2000)
      return
    // 只处理正文选区（不含注释列表/题目）
    const anchor = sel.anchorNode
    if (!anchor)
      return
    const el = anchor instanceof Element ? anchor : anchor.parentElement
    if (!el?.closest?.('.passage-text'))
      return
    // 单词选区（双击）直接给释义，不用再点翻译
    if (/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(text)) {
      openWordPopup(text, articleNotesForNode(anchor))
      return
    }
    openSelectionPopup(text)
  }, 400)
}

onMounted(() => {
  document.addEventListener('selectionchange', onSelectionChange)
})
onUnmounted(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  if (selectionTimer)
    clearTimeout(selectionTimer)
  translateSeq++
  translateAbort?.abort()
})

function paragraphs(passage: string): string[] {
  return passage
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean)
}
</script>

<template>
  <p v-if="dailyLoadError" class="m-4 text-amber-700" role="alert">
    文章加载失败。<button @click="loadDaily">
      重试
    </button>
  </p>
  <p v-if="dailyLoading" class="m-4" role="status">
    正在加载文章…
  </p>
  <div class="mx-auto max-w-3xl px-4 pt-6 2xl:px-0">
    <ReadingTabs />
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        📅 每日阅读
      </h2>
      <button
        type="button"
        class="border border-gray-300 rounded-lg px-4 py-1.5 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        @click="$router.push('/reading')"
      >
        ← 返回
      </button>
    </div>

    <!-- 无数据 -->
    <div
      v-if="dates.length === 0"
      class="border border-gray-200 rounded-2xl bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="mb-4 text-4xl">
        🌙
      </p>
      <p class="text-lg text-gray-600 dark:text-gray-300">
        暂无每日阅读，明早8点见
      </p>
    </div>

    <template v-else>
      <!-- 日期选择 -->
      <div class="mb-6">
        <label
          class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400"
        >选择日期</label>
        <select
          v-model="selectedDate"
          class="border border-gray-300 rounded-lg bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option v-for="d in dates" :key="d" :value="d">
            {{ d }}
          </option>
        </select>
      </div>

      <template v-if="daily">
        <!-- 第一部分：词汇阅读（按账号个性化；游客不显示） -->
        <section v-if="myVocabReading" class="mb-8">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            📖 词汇阅读
            <span
              class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"
            >基于你昨天学过的单词</span>
          </h3>
          <article
            id="reading-vocab"
            class="scroll-mt-20 border border-gray-200 rounded-2xl bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <h4 class="mb-3 text-xl font-bold text-gray-900 dark:text-white">
              {{ myVocabReading.title }}
            </h4>
            <p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
              💡 点单词查中文意思，选中一句话可以翻译
            </p>
            <div
              v-if="myVocabReading.basedOn?.length"
              class="mb-4 flex flex-wrap gap-2"
            >
              <span
                v-for="w in myVocabReading.basedOn"
                :key="w"
                class="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              >
                {{ w }}
              </span>
            </div>
            <div
              class="passage-text mb-4 leading-relaxed text-gray-700 space-y-4 dark:text-gray-300"
              data-article="vocab"
              @click="onPassageClick($event, myVocabReading.notes)"
            >
              <p v-for="(p, i) in paragraphs(myVocabReading.passage)" :key="i">
                <TextHighlights
                  :text="p"
                  :words="myVocabReading.notes.map((n) => n.word)"
                  :colors="textColors"
                />
              </p>
            </div>

            <!-- 生词注释 -->
            <div
              v-if="myVocabReading.notes.length"
              class="mb-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50"
            >
              <p
                class="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300"
              >
                生词注释
                <span class="font-normal text-gray-400">（点击单词查看中文）</span>
              </p>
              <ul class="space-y-1.5">
                <li
                  v-for="(n, i) in myVocabReading.notes"
                  :key="i"
                  class="text-sm"
                >
                  <span
                    class="mr-1.5 inline-block h-2 w-2 rounded-full"
                    :class="dotColors[i % dotColors.length]"
                  />
                  <button
                    class="font-bold underline underline-offset-2 decoration-dotted"
                    :class="textColors[i % textColors.length]"
                    @click="toggleNote(`${selectedDate}-vocab-${i}`)"
                  >
                    {{ n.word }}
                  </button>
                  <span
                    v-if="phoneticOf(n.word)"
                    class="ml-1.5 text-xs text-gray-400 dark:text-gray-500"
                  >{{ phoneticOf(n.word) }}</span>
                  <button
                    type="button"
                    class="ml-1.5 text-xs opacity-70 hover:opacity-100"
                    title="朗读发音"
                    @click="speak(n.word)"
                  >
                    🔊
                  </button>
                  <span
                    v-if="n.pos"
                    class="ml-1 italic text-gray-500 dark:text-gray-400"
                    style="font-family: times"
                  >{{ n.pos }}</span>
                  <span
                    v-if="expandedNotes.has(`${selectedDate}-vocab-${i}`)"
                    class="ml-2 text-gray-600 dark:text-gray-400"
                  >{{ n.meaning }}</span>
                </li>
              </ul>
            </div>

            <!-- 选择题 -->
            <div v-if="myVocabReading.questions.length" class="space-y-4">
              <div
                v-for="(qs, qi) in myVocabReading.questions"
                :key="qi"
                class="border border-gray-100 rounded-xl p-4 dark:border-gray-700"
              >
                <p
                  class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200"
                >
                  {{ qi + 1 }}. {{ qs.q }}
                </p>
                <div class="space-y-2">
                  <button
                    v-for="(opt, oi) in qs.options"
                    :key="oi"
                    :class="
                      optionClass(`${selectedDate}-vocab`, qi, oi, qs.answer)
                    "
                    @click="selectOption(`${selectedDate}-vocab-${qi}`, oi)"
                  >
                    {{ opt }}
                  </button>
                </div>
                <p
                  v-if="`${selectedDate}-vocab-${qi}` in answers"
                  class="mt-2 text-sm"
                  :class="
                    answers[`${selectedDate}-vocab-${qi}`] === qs.answer
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  "
                >
                  {{
                    answers[`${selectedDate}-vocab-${qi}`] === qs.answer
                      ? "✓ 回答正确"
                      : `✗ 答错了，正确答案是 ${qs.options[qs.answer]}`
                  }}
                </p>
              </div>
            </div>
          </article>
        </section>
        <!-- 词汇阅读加载态 -->
        <section v-else-if="currentUser && vocabLoading" class="mb-8">
          <div
            class="border border-gray-200 rounded-2xl bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
          >
            <p class="text-sm text-gray-500 dark:text-gray-400">
              📖 词汇阅读加载中…
            </p>
          </div>
        </section>
        <!-- 词汇阅读加载失败 -->
        <section v-else-if="currentUser && vocabError" class="mb-8">
          <div
            class="border border-gray-200 rounded-2xl bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
          >
            <p class="text-sm text-gray-500 dark:text-gray-400">
              📖 词汇阅读加载失败，请稍后重试
            </p>
          </div>
        </section>
        <!-- 登录用户本日暂无词汇阅读 -->
        <section v-else-if="currentUser" class="mb-8">
          <div
            class="border border-gray-300 rounded-2xl border-dashed bg-gray-50 p-6 text-center dark:border-gray-600 dark:bg-gray-800/50"
          >
            <p class="text-sm text-gray-500 dark:text-gray-400">
              📖 本日暂无词汇阅读
            </p>
          </div>
        </section>
        <!-- 游客提示：登录后可看个性化词汇阅读 -->
        <section v-else-if="!currentUser" class="mb-8">
          <div
            class="border border-gray-300 rounded-2xl border-dashed bg-gray-50 p-6 text-center dark:border-gray-600 dark:bg-gray-800/50"
          >
            <p class="text-sm text-gray-500 dark:text-gray-400">
              📖 词汇阅读是按你的学词记录个性化生成的，
              <router-link
                to="/login"
                class="text-blue-600 underline underline-offset-2 dark:text-blue-400"
              >
                登录
              </router-link>
              后可见
            </p>
          </div>
        </section>

        <!-- 第二部分：热点阅读 -->
        <section v-if="daily.newsReadings.length" class="mb-8">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            📰 热点阅读
            <span
              class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"
            >{{ daily.newsReadings.length }} 篇</span>
          </h3>
          <article
            v-for="(art, ai) in daily.newsReadings"
            :id="`reading-news-${ai}`"
            :key="ai"
            class="mb-6 scroll-mt-20 border border-gray-200 rounded-2xl bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <h4 class="mb-1 text-xl font-bold text-gray-900 dark:text-white">
              {{ art.title }}
            </h4>
            <p v-if="art.source" class="mb-3 text-xs text-gray-400">
              来源：{{ art.source }}
            </p>
            <p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
              💡 点单词查中文意思，选中一句话可以翻译
            </p>
            <div
              class="passage-text mb-4 leading-relaxed text-gray-700 space-y-4 dark:text-gray-300"
              :data-article="`news-${ai}`"
              @click="onPassageClick($event, art.notes)"
            >
              <p v-for="(p, i) in paragraphs(art.passage)" :key="i">
                <TextHighlights
                  :text="p"
                  :words="art.notes.map((n) => n.word)"
                  :colors="textColors"
                />
              </p>
            </div>

            <!-- 生词注释 -->
            <div
              v-if="art.notes.length"
              class="mb-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50"
            >
              <p
                class="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300"
              >
                生词注释
                <span class="font-normal text-gray-400">（点击单词查看中文）</span>
              </p>
              <ul class="space-y-1.5">
                <li v-for="(n, i) in art.notes" :key="i" class="text-sm">
                  <span
                    class="mr-1.5 inline-block h-2 w-2 rounded-full"
                    :class="dotColors[i % dotColors.length]"
                  />
                  <button
                    class="font-bold underline underline-offset-2 decoration-dotted"
                    :class="textColors[i % textColors.length]"
                    @click="toggleNote(`${selectedDate}-news${ai}-${i}`)"
                  >
                    {{ n.word }}
                  </button>
                  <span
                    v-if="n.pos"
                    class="ml-1 italic text-gray-500 dark:text-gray-400"
                    style="font-family: times"
                  >{{ n.pos }}</span>
                  <span
                    v-if="expandedNotes.has(`${selectedDate}-news${ai}-${i}`)"
                    class="ml-2 text-gray-600 dark:text-gray-400"
                  >{{ n.meaning }}</span>
                </li>
              </ul>
            </div>

            <!-- 选择题 -->
            <div v-if="art.questions.length" class="space-y-4">
              <div
                v-for="(qs, qi) in art.questions"
                :key="qi"
                class="border border-gray-100 rounded-xl p-4 dark:border-gray-700"
              >
                <p
                  class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200"
                >
                  {{ qi + 1 }}. {{ qs.q }}
                </p>
                <div class="space-y-2">
                  <button
                    v-for="(opt, oi) in qs.options"
                    :key="oi"
                    :class="
                      optionClass(
                        `${selectedDate}-news${ai}`,
                        qi,
                        oi,
                        qs.answer,
                      )
                    "
                    @click="selectOption(`${selectedDate}-news${ai}-${qi}`, oi)"
                  >
                    {{ opt }}
                  </button>
                </div>
                <p
                  v-if="`${selectedDate}-news${ai}-${qi}` in answers"
                  class="mt-2 text-sm"
                  :class="
                    answers[`${selectedDate}-news${ai}-${qi}`] === qs.answer
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  "
                >
                  {{
                    answers[`${selectedDate}-news${ai}-${qi}`] === qs.answer
                      ? "✓ 回答正确"
                      : `✗ 答错了，正确答案是 ${qs.options[qs.answer]}`
                  }}
                </p>
              </div>
            </div>
          </article>
        </section>
      </template>
    </template>

    <!-- 右下角阅读索引：快速跳转 -->
    <nav
      v-if="readingIndex.length > 1"
      class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2"
      aria-label="阅读目录"
    >
      <button
        v-for="item in readingIndex"
        :key="item.id"
        type="button"
        class="border border-gray-200 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-medium text-gray-600 shadow-md backdrop-blur transition-colors dark:border-gray-600 hover:border-blue-400 dark:bg-gray-800/90 hover:bg-blue-50 dark:text-gray-300 hover:text-blue-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
        @click="jumpTo(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <!-- 点词查义 / 选中翻译：底部弹窗 -->
    <div
      v-if="translatePopup"
      class="fixed inset-0 z-50"
      role="dialog"
      aria-label="翻译"
    >
      <div class="absolute inset-0 bg-black/40" @click="closeTranslatePopup" />
      <div
        class="absolute inset-x-0 bottom-0 mx-auto max-h-[70vh] max-w-3xl w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="break-words text-lg font-bold text-gray-900 dark:text-white">
              {{ translatePopup.source }}
            </p>
            <p v-if="translatePopup.phonetic || translatePopup.pos" class="mt-0.5 text-sm text-gray-400">
              {{ translatePopup.phonetic }}
              <span v-if="translatePopup.pos" class="ml-1 italic" style="font-family: times">{{ translatePopup.pos }}</span>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-full px-2 py-1 text-lg leading-none text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="关闭"
            @click="closeTranslatePopup"
          >
            ×
          </button>
        </div>
        <div v-if="translatePopup.loading" class="text-sm text-gray-500 dark:text-gray-400" role="status">
          翻译中…
        </div>
        <p v-else-if="translatePopup.meaning" class="text-base leading-relaxed text-gray-800 dark:text-gray-200">
          {{ translatePopup.meaning }}
        </p>
        <div v-else-if="translatePopup.error" class="text-sm text-red-600 dark:text-red-400" role="alert">
          {{ translatePopup.error }}
          <router-link
            v-if="translatePopup.error.includes('设置页')"
            to="/settings"
            class="ml-1 underline underline-offset-2"
          >
            去设置
          </router-link>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-if="translatePopup.kind === 'word'"
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="speak(translatePopup.source)"
          >
            🔊 朗读
          </button>
          <button
            v-if="translatePopup.showTranslateButton"
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="translatePopup.loading"
            @click="runAITranslate"
          >
            {{ translatePopup.kind === 'selection' ? '翻译成中文' : 'AI 翻译' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

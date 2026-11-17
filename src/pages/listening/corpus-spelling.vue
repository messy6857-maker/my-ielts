<script setup lang="ts">
import type { CorpusChapter, CorpusWord, DiffChar } from '../../utils/corpusSpelling'
import { resolveAudioUrl } from '../../composables/useAudio'
import { useAudioGroup } from '../../composables/useAudioGroup'
import { nsKey, useMistakes } from '../../composables/useStudyData'
import {
  buildCorpusWords,
  closestSpelling,
  CORPUS_CHAPTER_LABEL,
  markMissed,
  matchSpelling,
  pickRound,
} from '../../utils/corpusSpelling'
import { readValue, saveValue } from '../../utils/storage'
import corpusData from './spelling_convention'

// 听力语料库拼写练习：听发音、看释义，把词拼出来。英式、美式拼写都算对。
// 拼错记进错词本（和语料库自测卡片共用 corpus:<id> 这条记录），本轮最后再考一次。
defineOptions({ name: 'CorpusSpellingPage' })

const managedAudio = useAudioGroup()
const { addMistake } = useMistakes()
const { currentUser } = useAuth()

const allWords = buildCorpusWords(corpusData as any)
const CHAPTERS: CorpusChapter[] = ['ch2', 'ch3', 'ch4']
const SIZES = [10, 20, 0] as const
const SETTINGS_KEY = 'corpus_spelling_v1'
interface Settings { chapters: CorpusChapter[], size: number }
function readSettings(): Settings {
  const saved = readValue<Partial<Settings> | null>(nsKey(SETTINGS_KEY), null)
  const chapters = Array.isArray(saved?.chapters)
    ? saved.chapters.filter(c => CHAPTERS.includes(c))
    : []
  return {
    chapters: chapters.length
      ? chapters
      : [...CHAPTERS],
    size: SIZES.includes(saved?.size as any)
      ? saved!.size!
      : 20,
  }
}
const settings = ref<Settings>(readSettings())
const chosen = computed(() => allWords.filter(w => settings.value.chapters.includes(w.chapter)))
function countOf(chapter: CorpusChapter) {
  return allWords.filter(w => w.chapter === chapter).length
}
function toggleChapter(chapter: CorpusChapter) {
  const list = settings.value.chapters
  settings.value.chapters = list.includes(chapter)
    ? list.filter(c => c !== chapter)
    : [...list, chapter]
}

type Stage = 'setup' | 'playing' | 'done'
const stage = ref<Stage>('setup')
/** 本轮的题目队列；拼错的词会在队尾再出现一次 */
const queue = ref<CorpusWord[]>([])
const index = ref(0)
/** 本轮的词数（不含重考） */
const roundSize = ref(0)
/** 第一次就拼对的词 */
const firstTry = ref(0)
/** 本轮拼错过的词（按顺序，不重复） */
const missed = ref<CorpusWord[]>([])
const retried = new Set<string>()
const input = ref('')
const result = ref<null | 'right' | 'wrong'>(null)
const matched = ref<string | null>(null)
const diff = ref<DiffChar[]>([])
const hintShown = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)

const current = computed<CorpusWord | undefined>(() => queue.value[index.value])
const isRetry = computed(() => index.value >= roundSize.value)
const hint = computed(() => {
  const w = current.value
  if (!w)
    return ''
  return w.chapter === 'ch3' && w.note
    ? `注意：${w.note}`
    : `首字母 ${w.word[0]}，共 ${w.word.length} 个字母`
})

function play() {
  const w = current.value
  if (w)
    managedAudio.play(resolveAudioUrl(`179_audios/${w.word}.mp3`), w.word)
}
async function enter() {
  input.value = ''
  result.value = null
  matched.value = null
  diff.value = []
  hintShown.value = false
  await nextTick()
  inputEl.value?.focus()
  play()
}
function start(words: CorpusWord[]) {
  if (!words.length)
    return
  queue.value = words
  roundSize.value = words.length
  index.value = 0
  firstTry.value = 0
  missed.value = []
  retried.clear()
  stage.value = 'playing'
  enter()
}
function startRound() {
  saveValue(nsKey(SETTINGS_KEY), settings.value)
  start(pickRound(chosen.value, settings.value.size || undefined))
}
function retryMissed() {
  start(pickRound(missed.value))
}
function submit() {
  const w = current.value
  if (!w || result.value !== null || !input.value.trim())
    return
  const hit = matchSpelling(input.value, w)
  if (hit) {
    result.value = 'right'
    matched.value = hit
    if (!isRetry.value && !missed.value.includes(w))
      firstTry.value++
  }
  else {
    result.value = 'wrong'
    diff.value = markMissed(input.value, closestSpelling(input.value, w))
    if (!missed.value.includes(w)) {
      missed.value.push(w)
      addMistake('corpus', {
        key: `corpus:${w.id}`,
        title: w.word,
        detail: `${w.pos} ${w.meaning}`.trim(),
        hint: w.note || w.accepted.join(' / '),
      })
    }
    // 本轮最后再考一次（每个词只重考一次）
    if (!retried.has(w.id)) {
      retried.add(w.id)
      queue.value = [...queue.value, w]
    }
  }
  nextTick(() => nextButton.value?.focus())
}
function next() {
  if (result.value === null)
    return
  if (index.value + 1 >= queue.value.length) {
    managedAudio.dispose()
    stage.value = 'done'
    return
  }
  index.value++
  enter()
}
function onKeydown(event: KeyboardEvent) {
  if (stage.value === 'playing' && result.value !== null && event.key === 'Enter' && !event.repeat) {
    event.preventDefault()
    next()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
watch(currentUser, () => {
  settings.value = readSettings()
  stage.value = 'setup'
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-900 lg:px-8 sm:px-6">
    <div class="mx-auto max-w-2xl text-gray-900 dark:text-white">
      <div class="mb-4 flex items-center gap-3">
        <StudyBack to="/study/spell" label="练拼写" />
        <div>
          <h1 class="text-2xl font-extrabold">
            听力王语料库拼写练习
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            听发音、看释义，把词拼出来；英式、美式拼写都算对
          </p>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <!-- 设置 -->
        <div v-if="stage === 'setup'">
          <h4 class="mb-2 font-bold">
            练哪些
          </h4>
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-for="chapter in CHAPTERS"
              :key="chapter"
              :data-chapter="chapter"
              :aria-pressed="settings.chapters.includes(chapter)"
              class="border rounded-full px-3 py-1 text-sm"
              :class="settings.chapters.includes(chapter)
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 dark:border-gray-600'"
              @click="toggleChapter(chapter)"
            >
              {{ CORPUS_CHAPTER_LABEL[chapter] }}（{{ countOf(chapter) }}）
            </button>
          </div>
          <h4 class="mb-2 font-bold">
            每轮几个
          </h4>
          <div class="mb-5 flex flex-wrap gap-2">
            <button
              v-for="size in SIZES"
              :key="size"
              :data-size="size"
              :aria-pressed="settings.size === size"
              class="border rounded-full px-3 py-1 text-sm"
              :class="settings.size === size
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 dark:border-gray-600'"
              @click="settings.size = size"
            >
              {{ size ? `${size} 个` : '全部' }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <button
              class="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-bold disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="chosen.length === 0"
              @click="startRound"
            >
              开始
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-300">
              {{ chosen.length ? `共 ${chosen.length} 个词` : '还没有选章节' }}
            </span>
          </div>
        </div>

        <!-- 练习 -->
        <div v-else-if="stage === 'playing' && current">
          <div class="mb-3 flex justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              {{ isRetry ? `重考 ${index - roundSize + 1} / ${queue.length - roundSize}` : `${index + 1} / ${roundSize}` }}
              · {{ CORPUS_CHAPTER_LABEL[current.chapter] }}
            </span>
            <span>一次拼对 {{ firstTry }}</span>
          </div>
          <form class="text-center" @submit.prevent="submit">
            <p class="mb-3 text-lg">
              <span v-if="current.pos" class="text-sm text-gray-500 italic dark:text-gray-400">{{ current.pos }}</span>
              {{ current.meaning }}
              <button type="button" class="ml-2 border border-gray-300 rounded-lg px-3 py-1 text-sm dark:border-gray-600" @click="play">
                🔊 听发音
              </button>
            </p>
            <p v-if="hintShown && result === null" class="mb-2 text-sm text-gray-600 dark:text-gray-300" data-hint>
              {{ hint }}
            </p>
            <input
              ref="inputEl"
              v-model="input"
              aria-label="拼写"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :disabled="result !== null"
              class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-center text-lg sm:w-80 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
            <div v-if="result === null" class="mt-3 flex justify-center gap-3">
              <button type="submit" class="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50" :disabled="!input.trim()">
                提交
              </button>
              <button v-if="!hintShown" type="button" class="border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600" @click="hintShown = true">
                提示
              </button>
            </div>
          </form>

          <div v-if="result !== null" class="mt-4 text-center" data-result>
            <p v-if="result === 'right'" class="text-green-600 font-bold dark:text-green-400">
              正确！
              <span v-if="current.accepted.length > 1" class="block text-sm text-gray-600 font-normal dark:text-gray-300">
                {{ current.accepted.filter(s => s !== matched).join(' / ') }} 也算对
              </span>
            </p>
            <div v-else>
              <p class="text-red-600 font-bold dark:text-red-400">
                拼错了，已记进错词本，本轮最后再考一次
              </p>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                你写的：<span class="line-through">{{ input }}</span>
              </p>
              <p class="mt-1 text-2xl tracking-wide" aria-label="正确拼写" data-answer>
                <span
                  v-for="(c, i) in diff"
                  :key="i"
                  :class="c.ok ? '' : 'text-red-600 font-bold underline dark:text-red-400'"
                >{{ c.char }}</span>
              </p>
              <p v-if="current.accepted.length > 1" class="text-sm text-gray-600 dark:text-gray-300">
                这些写法都算对：{{ current.accepted.join(' / ') }}
              </p>
            </div>
            <p v-if="current.note" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ current.chapter === 'ch3' ? `注意：${current.note}` : current.note }}
            </p>
            <button ref="nextButton" class="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-white" @click="next">
              {{ index + 1 >= queue.length ? '查看结果' : '下一个' }}
            </button>
            <span class="ml-2 text-xs text-gray-400">回车</span>
          </div>
        </div>

        <!-- 结果 -->
        <div v-else class="text-center">
          <h4 class="text-lg font-bold">
            本轮完成
          </h4>
          <p class="mt-2">
            一次拼对 {{ firstTry }} / {{ roundSize }}
          </p>
          <div v-if="missed.length" class="mx-auto mt-4 max-w-md text-left text-sm">
            <p class="mb-1 text-gray-600 dark:text-gray-300">
              拼错过的词（已记进错词本）：
            </p>
            <ul class="list-disc pl-5">
              <li v-for="w in missed" :key="w.id">
                {{ w.accepted.join(' / ') }} <span class="text-gray-500 dark:text-gray-400">{{ w.meaning }}</span>
              </li>
            </ul>
          </div>
          <div class="mt-5 flex flex-wrap justify-center gap-3">
            <button v-if="missed.length" class="rounded-lg bg-orange-500 px-5 py-2 text-white" @click="retryMissed">
              再练拼错的 {{ missed.length }} 个
            </button>
            <button class="rounded-lg bg-blue-600 px-5 py-2 text-white" @click="startRound">
              再来一轮
            </button>
            <button class="border border-gray-300 rounded-lg px-5 py-2 dark:border-gray-600" @click="stage = 'setup'">
              换章节
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

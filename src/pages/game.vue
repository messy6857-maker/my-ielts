<script setup lang="ts">
import type { DungeonSelection, DungeonWord, Monster, QuestionKind } from '../utils/dungeon'
import { resolveAudioUrl } from '../composables/useAudio'
import { useAudioGroup } from '../composables/useAudioGroup'
import { gradeSchedule, useWordSchedule } from '../composables/useSpacedRepetition'
import { recordAttempt } from '../composables/useStats'
import { nsKey, useMistakes } from '../composables/useStudyData'
import {
  buildPool,
  buildRun,
  checkSpelling,
  flattenVocabulary,
  MONSTER_ICON,
  MONSTER_LABEL,
  phaseScore,
  ROOMS_PER_RUN,
  sourceWords,
  START_HEARTS,
} from '../utils/dungeon'
import { readValue, saveValue } from '../utils/storage'
import { getVocabularyChapterMeta, listVocabularyChapters, loadAllVocabulary } from './vocabulary/loadVocabulary'

// 单词地牢：把选中的词变成怪物，一局最多 10 个房间。
// 答对算一次复习（只更新已经学过的词的复习进度，没学过的词仍算新词），答错记进错词本。
const managedAudio = useAudioGroup()
const { mistakes, addMistake } = useMistakes()
const scheduleStore = useWordSchedule()
const { currentUser } = useAuth()

const allWords = shallowRef<DungeonWord[]>([])
const loading = ref(true)
const loadError = ref(false)
async function loadWords() {
  loading.value = true
  loadError.value = false
  try {
    allWords.value = flattenVocabulary(await loadAllVocabulary())
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
loadWords()

// ---------- 进门前：选词源 ----------
const SELECTION_KEY = 'dungeon_selection_v1'
const BEST_KEY = 'dungeon_best_v1'
const chapters = listVocabularyChapters()
function readSelection(): DungeonSelection {
  const saved = readValue<Partial<DungeonSelection> | null>(nsKey(SELECTION_KEY), null)
  return {
    today: saved?.today ?? true,
    mistakes: saved?.mistakes ?? false,
    due: saved?.due ?? false,
    chapters: Array.isArray(saved?.chapters)
      ? saved.chapters.filter(c => chapters.includes(c))
      : [],
  }
}
const selection = ref<DungeonSelection>(readSelection())
interface Best { score: number, combo: number }
function readBest(): Best {
  const saved = readValue<Partial<Best> | null>(nsKey(BEST_KEY), null)
  return { score: Number(saved?.score) || 0, combo: Number(saved?.combo) || 0 }
}
const best = ref<Best>(readBest())

/** 进入页面（或回到选词页）时的时间：到期、今天学的都按它算 */
const now = ref(Date.now())
const context = computed(() => ({
  schedules: scheduleStore.schedules.value,
  mistakes: mistakes.value,
  now: now.value,
}))
const sources = computed(() => sourceWords(allWords.value, context.value))
const pool = computed(() => buildPool(allWords.value, selection.value, context.value))
function toggleChapter(chapter: string) {
  const list = selection.value.chapters
  selection.value.chapters = list.includes(chapter)
    ? list.filter(c => c !== chapter)
    : [...list, chapter]
}
function chapterLabel(chapter: string) {
  return getVocabularyChapterMeta(chapter)?.label || chapter.replace(/^\d+_/, '')
}

// ---------- 游戏中 ----------
type Stage = 'setup' | 'playing' | 'won' | 'lost'
const stage = ref<Stage>('setup')
// 换账号：回到选词页，用新账号的选择和最高分
watch(currentUser, () => {
  selection.value = readSelection()
  best.value = readBest()
  stage.value = 'setup'
})
const monsters = ref<Monster[]>([])
const room = ref(0)
const phase = ref(0)
const hearts = ref(START_HEARTS)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const defeated = ref(0)
/** 当前题目的结果：null 还没答 */
const result = ref<null | 'right' | 'wrong'>(null)
const picked = ref<DungeonWord | null>(null)
const spelling = ref('')
const hintShown = ref(false)
/** 这只怪物身上是否用过提示 / 答错过（决定这个词记成认识、模糊还是不认识） */
let monsterHinted = false
const missed = ref<Monster[]>([])
const newRecord = ref(false)
const spellInput = ref<HTMLInputElement | null>(null)
const continueButton = ref<HTMLButtonElement | null>(null)

const monster = computed<Monster | undefined>(() => monsters.value[room.value])
const question = computed<QuestionKind | undefined>(() => monster.value?.phases[phase.value])

function playWord() {
  const m = monster.value
  if (!m)
    return
  managedAudio.play(resolveAudioUrl(`vocabulary/audio/${m.word.chapter}/${m.word.word}.mp3`), m.word.word)
}
async function enterQuestion() {
  result.value = null
  picked.value = null
  spelling.value = ''
  hintShown.value = false
  await nextTick()
  if (question.value === 'spell') {
    playWord()
    spellInput.value?.focus()
  }
}
function start() {
  now.value = Date.now()
  const run = buildRun(pool.value, allWords.value, context.value)
  if (!run.length)
    return
  saveValue(nsKey(SELECTION_KEY), selection.value)
  monsters.value = run
  room.value = 0
  phase.value = 0
  hearts.value = START_HEARTS
  score.value = 0
  combo.value = 0
  maxCombo.value = 0
  defeated.value = 0
  missed.value = []
  newRecord.value = false
  monsterHinted = false
  stage.value = 'playing'
  enterQuestion()
}

/** 一只怪物打完（击败或答错放跑）：记一次复习结果 */
function recordWord(m: Monster, wrongKind: QuestionKind | null) {
  const grade = wrongKind
    ? 0
    : (monsterHinted ? 3 : 5)
  // 只更新已经在自测里学过的词；没学过的词不建复习记录，在单词自测里仍算新词
  const previous = scheduleStore.get(m.word.id)
  if (previous)
    scheduleStore.set(m.word.id, gradeSchedule(previous, grade))
  recordAttempt('vocabulary', grade)
  if (!wrongKind)
    return
  const detail = `${m.word.pos} ${m.word.meaning}`.trim()
  // 认错释义记到“单词自测”，拼错记到“打字练习”，和那两处的错题合并计数
  if (wrongKind === 'choice')
    addMistake('flashcard', { key: `flashcard:${m.word.id}`, title: m.word.word, detail, hint: `${m.word.word}: ${m.word.meaning}` })
  else
    addMistake('typing', { key: `typing:${m.word.word}`, title: m.word.word, detail, hint: `${m.word.word}: ${m.word.meaning}` })
}

function finish(next: 'won' | 'lost') {
  managedAudio.dispose()
  if (score.value > best.value.score || maxCombo.value > best.value.combo) {
    newRecord.value = score.value > best.value.score
    best.value = { score: Math.max(best.value.score, score.value), combo: Math.max(best.value.combo, maxCombo.value) }
    saveValue(nsKey(BEST_KEY), best.value)
  }
  stage.value = next
}
/** 进下一题 / 下一个房间 / 结算 */
function advance() {
  const m = monster.value
  if (!m || result.value === null)
    return
  if (result.value === 'right' && phase.value + 1 < m.phases.length) {
    phase.value++
    enterQuestion()
    return
  }
  if (hearts.value <= 0) {
    finish('lost')
    return
  }
  if (room.value + 1 >= monsters.value.length) {
    finish('won')
    return
  }
  room.value++
  phase.value = 0
  monsterHinted = false
  enterQuestion()
}
function answer(correct: boolean) {
  const m = monster.value
  const kind = question.value
  if (!m || !kind || result.value !== null)
    return
  if (correct) {
    result.value = 'right'
    combo.value++
    maxCombo.value = Math.max(maxCombo.value, combo.value)
    score.value += phaseScore(combo.value, m.kind)
    if (phase.value + 1 >= m.phases.length) {
      defeated.value++
      recordWord(m, null)
    }
  }
  else {
    result.value = 'wrong'
    combo.value = 0
    hearts.value--
    missed.value.push(m)
    recordWord(m, kind)
  }
  nextTick(() => continueButton.value?.focus())
}
function choose(option: DungeonWord) {
  if (result.value !== null)
    return
  picked.value = option
  answer(option === monster.value?.word)
}
function submitSpelling() {
  const m = monster.value
  if (!m || result.value !== null || !spelling.value.trim())
    return
  answer(checkSpelling(spelling.value, m.word))
}
function showHint() {
  if (hintShown.value || result.value !== null)
    return
  hintShown.value = true
  monsterHinted = true
  combo.value = 0
  spellInput.value?.focus()
}
function backToSetup() {
  now.value = Date.now()
  stage.value = 'setup'
}

// 键盘：选择题按 1-4；出结果后按回车继续
function onKeydown(event: KeyboardEvent) {
  if (stage.value !== 'playing' || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
    return
  if (result.value !== null) {
    if (event.key === 'Enter') {
      event.preventDefault()
      advance()
    }
    return
  }
  if (question.value === 'choice' && /^[1-4]$/.test(event.key)) {
    const option = monster.value?.options[Number(event.key) - 1]
    if (option) {
      event.preventDefault()
      choose(option)
    }
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function optionClass(option: DungeonWord) {
  if (result.value === null)
    return 'border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
  if (option === monster.value?.word)
    return 'border-green-500 bg-green-50 dark:bg-green-900'
  if (option === picked.value)
    return 'border-red-500 bg-red-50 dark:bg-red-900'
  return 'border-gray-200 opacity-60 dark:border-gray-700'
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mx-auto max-w-3xl border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
    >
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-xl text-gray-900 font-bold dark:text-white">
          单词地牢
        </h3>
        <span v-if="best.score > 0" class="text-sm text-gray-500 dark:text-gray-400">
          最高分 {{ best.score }} · 最长连击 {{ best.combo }}
        </span>
      </div>

      <p v-if="loading" class="py-10 text-center text-gray-500 dark:text-gray-400">
        正在加载词库…
      </p>
      <div v-else-if="loadError" class="py-10 text-center text-gray-700 dark:text-gray-200">
        <p class="mb-3">
          词库加载失败，请检查网络后重试。
        </p>
        <button class="rounded-lg bg-blue-600 px-4 py-2 text-white" @click="loadWords">
          重试
        </button>
      </div>

      <!-- 选词源 -->
      <div v-else-if="stage === 'setup'" class="text-gray-900 dark:text-white">
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
          选好要打的词，它们会变成怪物：一局最多 {{ ROOMS_PER_RUN }} 个房间，{{ START_HEARTS }} 颗心，答错扣一颗。答对算一次复习，答错记进错词本。
        </p>
        <h4 class="mb-2 font-bold">
          打哪些词（可以多选）
        </h4>
        <div class="mb-4 flex flex-col gap-2">
          <label class="flex items-center gap-2">
            <input v-model="selection.today" type="checkbox" data-source="today">
            今天学的词（{{ sources.today.length }}）
            <span class="text-xs text-gray-500 dark:text-gray-400">今天在单词自测里学过或记进错词本的词</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="selection.mistakes" type="checkbox" data-source="mistakes">
            错词（{{ sources.mistakes.length }}）
          </label>
          <label class="flex items-center gap-2">
            <input v-model="selection.due" type="checkbox" data-source="due">
            到期复习（{{ sources.due.length }}）
          </label>
        </div>
        <div class="mb-2 flex flex-wrap items-center gap-3">
          <h4 class="font-bold">
            按章节选
          </h4>
          <button class="text-sm text-blue-600 underline dark:text-blue-400" @click="selection.chapters = [...chapters]">
            全选
          </button>
          <button class="text-sm text-blue-600 underline dark:text-blue-400" @click="selection.chapters = []">
            清空
          </button>
        </div>
        <div class="mb-5 flex flex-wrap gap-2">
          <button
            v-for="chapter in chapters"
            :key="chapter"
            :aria-pressed="selection.chapters.includes(chapter)"
            class="border rounded-full px-3 py-1 text-sm"
            :class="selection.chapters.includes(chapter)
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-600'"
            @click="toggleChapter(chapter)"
          >
            {{ chapterLabel(chapter) }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <button
            class="rounded-lg bg-blue-600 px-6 py-2.5 text-white font-bold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pool.length === 0"
            @click="start"
          >
            进入地牢
          </button>
          <span class="text-sm text-gray-600 dark:text-gray-300">
            <template v-if="pool.length === 0">还没有选中任何词</template>
            <template v-else-if="pool.length < ROOMS_PER_RUN">选中 {{ pool.length }} 个词，这局 {{ pool.length }} 个房间</template>
            <template v-else>选中 {{ pool.length }} 个词，每局随机抽 {{ ROOMS_PER_RUN }} 个，错得多的更容易遇到</template>
          </span>
        </div>
      </div>

      <!-- 战斗 -->
      <div v-else-if="stage === 'playing' && monster" class="text-gray-900 dark:text-white">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>房间 {{ room + 1 }} / {{ monsters.length }}</span>
          <span :aria-label="`剩余 ${hearts} 颗心`">
            <span v-for="i in START_HEARTS" :key="i">{{ i <= hearts ? '❤️' : '🖤' }}</span>
          </span>
          <span>得分 {{ score }}</span>
          <span :class="combo >= 3 ? 'text-orange-500 font-bold' : ''">连击 {{ combo }}</span>
        </div>
        <div class="mb-4 border border-gray-200 rounded-lg p-4 text-center dark:border-gray-700">
          <div class="text-5xl" aria-hidden="true">
            {{ MONSTER_ICON[monster.kind] }}
          </div>
          <div class="mt-1 font-bold">
            {{ MONSTER_LABEL[monster.kind] }}
            <span v-if="monster.wrongCount > 0" class="text-xs text-gray-500 font-normal dark:text-gray-400">错过 {{ monster.wrongCount }} 次</span>
          </div>
          <div class="mt-1 text-sm" :aria-label="`还要答对 ${monster.phases.length - phase - (result === 'right' ? 1 : 0)} 题`">
            <span v-for="(p, i) in monster.phases" :key="i">{{ i < phase || (i === phase && result === 'right') ? '▫️' : '🟥' }}</span>
          </div>
        </div>

        <!-- 选择题：看释义选单词 -->
        <div v-if="question === 'choice'">
          <p class="mb-3 text-center text-lg">
            <span class="text-sm text-gray-500 italic dark:text-gray-400">{{ monster.word.pos }}</span>
            {{ monster.word.meaning }}
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="(option, i) in monster.options"
              :key="option.word"
              class="border rounded-lg px-4 py-3 text-left"
              :class="optionClass(option)"
              :disabled="result !== null"
              @click="choose(option)"
            >
              <span class="mr-2 text-xs text-gray-400">{{ i + 1 }}</span>{{ option.word }}
            </button>
          </div>
        </div>
        <!-- 拼写题：听发音拼出来 -->
        <form v-else class="text-center" @submit.prevent="submitSpelling">
          <p class="mb-3">
            听发音，把这个词拼出来
            <button type="button" class="ml-2 border border-gray-300 rounded-lg px-3 py-1 text-sm dark:border-gray-600" @click="playWord">
              🔊 再听一次
            </button>
          </p>
          <p v-if="hintShown" class="mb-3 text-sm text-gray-600 dark:text-gray-300">
            提示：{{ monster.word.pos }} {{ monster.word.meaning }}，首字母 {{ monster.word.word[0] }}
          </p>
          <input
            ref="spellInput"
            v-model="spelling"
            aria-label="拼写"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="result !== null"
            class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-center text-lg sm:w-80 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <div v-if="result === null" class="mt-3 flex justify-center gap-3">
            <button type="submit" class="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50" :disabled="!spelling.trim()">
              攻击
            </button>
            <button v-if="!hintShown" type="button" class="border border-gray-300 rounded-lg px-4 py-2 text-sm dark:border-gray-600" @click="showHint">
              提示（连击清零）
            </button>
          </div>
        </form>

        <div v-if="result !== null" class="mt-4 text-center" role="status">
          <p v-if="result === 'right'" class="text-green-600 font-bold dark:text-green-400">
            {{ phase + 1 >= monster.phases.length ? '击败！' : '命中！还差一击' }}
          </p>
          <p v-else class="text-red-600 dark:text-red-400">
            <span class="font-bold">答错了，怪物逃走了。</span>
            正确答案：{{ monster.word.word }}（{{ monster.word.pos }} {{ monster.word.meaning }}）
          </p>
          <button ref="continueButton" class="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-white" @click="advance">
            {{ hearts <= 0 ? '查看结果' : '继续' }}
          </button>
          <span class="ml-2 text-xs text-gray-400">回车</span>
        </div>
      </div>

      <!-- 结算 -->
      <div v-else class="text-center text-gray-900 dark:text-white">
        <div class="text-5xl" aria-hidden="true">
          {{ stage === 'won' ? '🏆' : '💀' }}
        </div>
        <h4 class="mt-2 text-lg font-bold">
          {{ stage === 'won' ? '通关！' : '倒在了地牢里' }}
        </h4>
        <p class="mt-2">
          得分 {{ score }} · 击败 {{ defeated }} / {{ monsters.length }} · 最长连击 {{ maxCombo }}
        </p>
        <p v-if="newRecord" class="mt-1 text-orange-500 font-bold">
          新的最高分！
        </p>
        <div v-if="missed.length" class="mx-auto mt-4 max-w-md text-left text-sm">
          <p class="mb-1 text-gray-600 dark:text-gray-300">
            这些词已记进错词本：
          </p>
          <ul class="list-disc pl-5">
            <li v-for="m in missed" :key="m.word.word">
              {{ m.word.word }} <span class="text-gray-500 dark:text-gray-400">{{ m.word.pos }} {{ m.word.meaning }}</span>
            </li>
          </ul>
        </div>
        <div class="mt-5 flex flex-wrap justify-center gap-3">
          <button class="rounded-lg bg-blue-600 px-5 py-2 text-white" @click="start">
            再来一局
          </button>
          <button class="border border-gray-300 rounded-lg px-5 py-2 dark:border-gray-600" @click="backToSetup">
            重新选词
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

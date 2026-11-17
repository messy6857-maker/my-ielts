<script setup lang="ts">
import type { StudyPlan } from '../../components/StudyCardSession.vue'
import type { DeckId, StudyCard } from '../../utils/studyDeck'
import { planQueue } from '../../composables/useDeckStore'
import { confirmDialog } from '../../composables/useDialog'
import { useStudyDeck } from '../../composables/useStudyDeck'
import { readChapterPreference, writeChapterPreference } from '../../utils/chapterPreference'
import { loadDeckCards } from '../../utils/loadStudyCards'
import { DECK_IDS, DECK_META } from '../../utils/studyDeck'
import { listVocabularyChapters } from '../vocabulary/loadVocabulary'

// 学新词：选词库（词汇表再选章节），用统一的卡片自测学今天的新词，顺带复习这个词库里少量到期的词。
// 每个词库的每日新词目标、复习进度各自独立，沿用原来的记录。
defineOptions({ name: 'StudyLearnPage' })

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const { setProgress, clearChapterProgress } = useProgress()

// 地址里没指定词库时，回到上次学的那个词库
const DECK_KEY = 'study_learn_deck'
function parseDeck(value: unknown): DeckId {
  return DECK_IDS.includes(value as DeckId)
    ? value as DeckId
    : readChapterPreference(DECK_KEY, [...DECK_IDS], currentUser.value, 'vocabulary') as DeckId
}
const deck = ref<DeckId>(parseDeck(route.query.deck))
// 进来先选，点“开始”才出卡片；卡片页的返回键回到这个选择页
const started = ref(false)
watch(() => route.query.deck, (value) => {
  deck.value = parseDeck(value)
})
watch(deck, (value) => {
  writeChapterPreference(DECK_KEY, value, currentUser.value)
  if (route.query.deck !== value) {
    router.replace({
      query: { ...route.query, deck: value },
    })
  }
}, { immediate: true })
const stores = Object.fromEntries(DECK_IDS.map(d => [
  d,
  useStudyDeck(d),
])) as Record<DeckId, ReturnType<typeof useStudyDeck>>
const store = computed(() => stores[deck.value])

// 词汇表的章节（和原单词自测记同一个偏好）
const CHAPTER_KEY = 'vocabulary_flashcard_chapter'
const chapters = listVocabularyChapters()
const category = ref(readChapterPreference(CHAPTER_KEY, chapters, currentUser.value))

const cards = shallowRef<StudyCard[]>([])
const ready = ref(false)
const loadError = ref(false)
const version = ref(0)
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  ready.value = false
  loadError.value = false
  const which = deck.value
  try {
    const list = await loadDeckCards(which, which === 'vocabulary' ? category.value : undefined)
    if (seq !== loadSeq)
      return
    cards.value = list
    ready.value = true
    version.value++
  }
  catch {
    if (seq === loadSeq)
      loadError.value = true
  }
}
watch([deck, category], () => {
  if (deck.value === 'vocabulary')
    writeChapterPreference(CHAPTER_KEY, category.value, currentUser.value)
  load()
}, { immediate: true })
watch(currentUser, (user) => {
  started.value = false
  deck.value = readChapterPreference(DECK_KEY, [...DECK_IDS], user, deck.value) as DeckId
  const next = readChapterPreference(CHAPTER_KEY, chapters, user)
  if (category.value !== next)
    category.value = next
  else load()
})

// 一轮：今日剩余新词名额 + 这个词库里到期的词（复习配额为每日目标的 3 倍，到期优先）
function build(): StudyPlan {
  const s = store.value
  const plan = planQueue(cards.value, id => s.getSchedule(id), s.goal(), s.remaining())
  return {
    items: [
      ...plan.reviews.map(card => ({ card, isNew: false })),
      ...plan.newWords.map(card => ({ card, isNew: true })),
    ],
    reviewCount: plan.reviews.length,
    dueCount: plan.dueCount,
    newCount: plan.newWords.length,
  }
}
function onFinished({ known, total }: { known: number, total: number }) {
  if (deck.value === 'vocabulary')
    setProgress(`flashcard:${category.value}`, known, total)
  else setProgress(DECK_META[deck.value].progressModule, known, total)
}

const goal = computed({
  get: () => store.value.goal(),
  set: (v: string | number) => store.value.setGoal(Number(v)),
})
const preview = computed(() => {
  void version.value
  return ready.value
    ? build()
    : null
})
function start() {
  if (ready.value)
    started.value = true
}
// 重置记忆：二次确认后清空这个词库的复习进度、自测进度和今日新词计数（错词本、打卡、统计不受影响）
async function resetMemory() {
  const name = DECK_META[deck.value].name
  const ok = await confirmDialog(
    `确定要重置“${name}”的记忆吗？此操作不可撤销。\n\n将清除：\n- ${name}全部单词的记忆曲线（所有词回到新词）\n- ${name}的自测进度\n- 今日已学新词计数\n\n不受影响：错词本、打卡、模考记录、学习统计历史`,
    { danger: true, confirmText: '重置' },
  )
  if (!ok)
    return
  const s = store.value
  s.clear()
  if (deck.value === 'vocabulary') {
    clearChapterProgress()
    setProgress('flashcard', 0, 0)
  }
  else {
    setProgress(DECK_META[deck.value].progressModule, 0, 0)
  }
  s.resetDaily()
}

const SUBTITLE: Record<DeckId, string> = {
  vocabulary: '看到单词先凭感觉自评，再看例句、巧记和拓展词',
  reading538: '看到单词先凭感觉自评，重点记同义替换',
  listening179: '看到单词先凭感觉自评，重点记同义替换',
  corpus: '看到单词先凭感觉自评，再看拼写要点',
}
</script>

<template>
  <StudyCardSession
    v-if="started"
    :title="`学新词 · ${DECK_META[deck].name}`"
    :subtitle="SUBTITLE[deck]"
    :ready="ready"
    :version="version"
    :build="build"
    back-label="选择"
    @finished="onFinished"
    @exit="started = false"
  >
    <template #plan>
      ｜ {{ DECK_META[deck].name }}今日新词 {{ store.dailyCount() }} / {{ store.goal() }}
    </template>
  </StudyCardSession>
  <div v-else class="px-4 pt-6 2xl:px-0" data-setup>
    <div class="mx-auto max-w-2xl">
      <div class="mb-4 flex items-center gap-3">
        <StudyBack to="/study" label="背单词" />
        <div>
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            学新词
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            选好再开始，下次进来默认是这次的选择。
          </p>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
          词库
        </div>
        <div class="grid grid-cols-2 mb-2 gap-2 sm:grid-cols-4">
          <button
            v-for="d in DECK_IDS"
            :key="d"
            :data-deck-choice="d"
            :aria-pressed="deck === d"
            class="border rounded-lg px-3 py-2 text-sm font-medium"
            :class="deck === d ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
            @click="deck = d"
          >
            {{ DECK_META[d].name }}
          </button>
        </div>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {{ SUBTITLE[deck] }}
        </p>

        <div v-if="deck === 'vocabulary'" class="mb-4">
          <label class="mb-2 block text-sm text-gray-700 font-bold dark:text-gray-200" for="learn-chapter">章节</label>
          <select id="learn-chapter" v-model="category" aria-label="章节" class="block w-full border border-gray-300 rounded-lg bg-white p-2.5 text-sm sm:w-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option v-for="c in chapters" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </div>

        <div class="mb-4">
          <label class="mb-2 block text-sm text-gray-700 font-bold dark:text-gray-200" for="learn-goal">这个词库每天学几个新词</label>
          <input
            id="learn-goal"
            v-model.lazy="goal"
            type="number"
            min="1"
            max="500"
            aria-label="每日新词目标"
            class="block w-24 border border-gray-300 rounded-lg bg-white p-2.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
        </div>

        <p v-if="loadError" class="mb-3 text-sm text-amber-700" role="alert">
          词表加载失败。<button class="underline" @click="load">
            重试
          </button>
        </p>
        <p v-else class="mb-4 text-sm text-gray-600 dark:text-gray-300" data-preview>
          <template v-if="preview">
            这一轮：复习 {{ preview.reviewCount }} 个到期的词，新词 {{ preview.newCount }} 个。今日新词 {{ store.dailyCount() }} / {{ store.goal() }}。
          </template>
          <template v-else>
            词表加载中…
          </template>
        </p>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <button
            data-start
            class="rounded-lg bg-blue-600 px-8 py-2.5 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            :disabled="!ready"
            @click="start"
          >
            开始
          </button>
          <button
            title="重置记忆：这个词库全部单词回到新词，从 0 开始"
            class="border border-red-300 rounded-lg bg-white px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-gray-800 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            @click="resetMemory"
          >
            🔄 重置这个词库的记忆
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StudyPlan } from '../../components/StudyCardSession.vue'
import type { DeckId, StudyCard } from '../../utils/studyDeck'
import { planQueue } from '../../composables/useDeckStore'
import { confirmDialog } from '../../composables/useDialog'
import { useStudyDeck } from '../../composables/useStudyDeck'
import { readChapterPreference, writeChapterPreference } from '../../utils/chapterPreference'
import { corpusCards, DECK_IDS, DECK_META, listeningCards, readingCards, vocabularyCards } from '../../utils/studyDeck'
import { listVocabularyChapters, loadVocabularyChapter } from '../vocabulary/loadVocabulary'
import { WORD_CHAPTER_INDEX } from '../vocabulary/vocabularyMeta'

// 学新词：选词库（词汇表再选章节），用统一的卡片自测学今天的新词，顺带复习这个词库里少量到期的词。
// 每个词库的每日新词目标、复习进度各自独立，沿用原来的记录。
defineOptions({ name: 'StudyLearnPage' })

const route = useRoute()
const router = useRouter()
const { currentUser } = useAuth()
const { setProgress, clearChapterProgress } = useProgress()

function parseDeck(value: unknown): DeckId {
  return DECK_IDS.includes(value as DeckId)
    ? value as DeckId
    : 'vocabulary'
}
const deck = ref<DeckId>(parseDeck(route.query.deck))
watch(() => route.query.deck, (value) => {
  deck.value = parseDeck(value)
})
watch(deck, (value) => {
  if (route.query.deck !== value)
    router.replace({ query: { ...route.query, deck: value } })
})
const stores = Object.fromEntries(DECK_IDS.map(d => [d, useStudyDeck(d)])) as Record<DeckId, ReturnType<typeof useStudyDeck>>
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
    let list: StudyCard[]
    if (which === 'vocabulary') {
      const chapter = category.value
      list = vocabularyCards({ [chapter]: await loadVocabularyChapter(chapter) }, id => (WORD_CHAPTER_INDEX as Record<string, string>)[String(id)])
    }
    else if (which === 'reading538') {
      list = readingCards((await import('../reading/reading538words')).default as any)
    }
    else if (which === 'listening179') {
      list = listeningCards((await import('../listening/listening179.json')).default as any)
    }
    else {
      list = corpusCards((await import('../listening/spelling_convention')).default as any)
    }
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
const session = ref<{ restart: () => void } | null>(null)
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
  session.value?.restart()
}

const SUBTITLE: Record<DeckId, string> = {
  vocabulary: '看到单词先凭感觉自评，再看例句、巧记和拓展词',
  reading538: '看到单词先凭感觉自评，重点记同义替换',
  listening179: '看到单词先凭感觉自评，重点记同义替换',
  corpus: '看到单词先凭感觉自评，再看拼写要点',
}
</script>

<template>
  <div>
    <p v-if="loadError" class="mx-4 mt-4 text-sm text-amber-700" role="alert">
      词表加载失败。<button class="underline" @click="load">
        重试
      </button>
    </p>
    <StudyCardSession
      ref="session"
      :title="`学新词 · ${DECK_META[deck].name}`"
      :subtitle="SUBTITLE[deck]"
      :ready="ready"
      :version="version"
      :build="build"
      @finished="onFinished"
    >
      <template #controls>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="deck" aria-label="词库" class="block border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option v-for="d in DECK_IDS" :key="d" :value="d">
              {{ DECK_META[d].name }}
            </option>
          </select>
          <select v-if="deck === 'vocabulary'" v-model="category" aria-label="章节" class="block w-36 border border-gray-300 rounded-lg bg-white p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option v-for="c in chapters" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
          <input
            v-model.lazy="goal"
            type="number"
            min="1"
            max="500"
            aria-label="每日新词目标"
            title="这个词库每天学几个新词（下轮生效）"
            class="block w-20 border border-gray-300 rounded-lg bg-white p-2.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <span class="text-sm text-gray-500 dark:text-gray-400">个/天</span>
          <button
            title="重置记忆：这个词库全部单词回到新词，从 0 开始"
            class="shrink-0 border border-red-300 rounded-lg bg-white px-3 py-2.5 text-sm text-red-600 dark:border-red-800 dark:bg-gray-800 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            @click="resetMemory"
          >
            🔄 重置记忆
          </button>
        </div>
      </template>
      <template #plan>
        ｜ {{ DECK_META[deck].name }}今日新词 {{ store.dailyCount() }} / {{ store.goal() }}
      </template>
    </StudyCardSession>
  </div>
</template>

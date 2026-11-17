<script setup lang="ts">
import type { StudyPlan } from '../../components/StudyCardSession.vue'
import type { DeckId, StudyCard } from '../../utils/studyDeck'
import { useStudyDeck } from '../../composables/useStudyDeck'
import { readChapterPreference, writeChapterPreference } from '../../utils/chapterPreference'
import { loadDeckCards } from '../../utils/loadStudyCards'
import { accountKey } from '../../utils/storage'
import { DECK_IDS, DECK_META } from '../../utils/studyDeck'

// 复习到期的词：所有词库到期的词放在一起，按到期时间从早到晚复习。
// 进来先选要复习哪些词库、这一轮复习多少个，点“开始”才出卡片。进度写回各词库原来的记录。
defineOptions({ name: 'StudyReviewPage' })

const { currentUser } = useAuth()
const stores = Object.fromEntries(DECK_IDS.map(d => [d, useStudyDeck(d)])) as Record<DeckId, ReturnType<typeof useStudyDeck>>

const cards = shallowRef<Record<DeckId, StudyCard[]> | null>(null)
const loadError = ref(false)
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loadError.value = false
  try {
    const lists = await Promise.all(DECK_IDS.map(d => loadDeckCards(d)))
    if (seq !== loadSeq)
      return
    cards.value = Object.fromEntries(DECK_IDS.map((d, i) => [d, lists[i]])) as Record<DeckId, StudyCard[]>
  }
  catch {
    if (seq === loadSeq)
      loadError.value = true
  }
}

const normalize = (word: string) => word.toLowerCase().trim()
// 同一个词在词汇表多章出现：复习时只出一张卡，评分时各章的进度一起更新
const vocabularyAliases = computed(() => {
  const map = new Map<string, Array<string | number>>()
  for (const c of cards.value?.vocabulary ?? []) {
    const key = normalize(c.word)
    map.set(key, [...(map.get(key) ?? []), c.id])
  }
  return map
})
function aliasIds(card: StudyCard) {
  return vocabularyAliases.value.get(normalize(card.word)) ?? [card.id]
}

// 到期按“现在”算：进页面、从卡片返回时刷新
const now = ref(Date.now())
interface DueCard { card: StudyCard, dueAt: number }
const dueByDeck = computed(() => {
  const out = {} as Record<DeckId, DueCard[]>
  for (const deck of DECK_IDS) {
    const store = stores[deck]
    let due: DueCard[] = []
    for (const card of cards.value?.[deck] ?? []) {
      const dueAt = store.getSchedule(card.id)?.dueAt
      if (typeof dueAt === 'number' && Number.isFinite(dueAt) && dueAt <= now.value)
        due.push({ card, dueAt })
    }
    if (deck === 'vocabulary') {
      const byWord = new Map<string, DueCard>()
      for (const d of due) {
        const key = normalize(d.card.word)
        const prev = byWord.get(key)
        if (!prev || d.dueAt < prev.dueAt)
          byWord.set(key, d)
      }
      due = [...byWord.values()]
    }
    out[deck] = due
  }
  return out
})

// 要复习哪些词库：默认勾上有到期词的
const selected = ref<DeckId[]>([])
let selectionReady = false
watch(dueByDeck, (due) => {
  if (selectionReady || !cards.value)
    return
  selectionReady = true
  selected.value = DECK_IDS.filter(d => due[d].length > 0)
})

// 这一轮复习多少个：20 / 50 / 全部 / 自定义数量（记住上次的选择）
type CountMode = '20' | '50' | 'all' | 'custom'
const COUNT_MODES: Array<{ id: CountMode, label: string }> = [
  { id: '20', label: '20 个' },
  { id: '50', label: '50 个' },
  { id: 'all', label: '全部' },
  { id: 'custom', label: '自定义数量' },
]
const MODE_KEY = 'study_review_count'
const CUSTOM_KEY = 'study_review_custom'
const modeIds = COUNT_MODES.map(m => m.id)
function readCustom(user: string | null) {
  const n = Number(localStorage.getItem(accountKey(CUSTOM_KEY, user)) ?? '30')
  return Number.isFinite(n) && n >= 1 ? Math.min(500, Math.round(n)) : 30
}
const countMode = ref(readChapterPreference(MODE_KEY, modeIds, currentUser.value, '20') as CountMode)
const customCount = ref(readCustom(currentUser.value))
watch(countMode, value => writeChapterPreference(MODE_KEY, value, currentUser.value))
function setCustom(value: string | number) {
  const n = Math.round(Number(value))
  customCount.value = Number.isFinite(n) && n >= 1 ? Math.min(500, n) : 30
  writeChapterPreference(CUSTOM_KEY, String(customCount.value), currentUser.value)
}
const limit = computed(() => countMode.value === 'all'
  ? Number.POSITIVE_INFINITY
  : countMode.value === 'custom'
    ? customCount.value
    : Number(countMode.value))

const selectedDue = computed(() => selected.value
  .flatMap(d => dueByDeck.value[d])
  .sort((a, b) => a.dueAt - b.dueAt))
const roundSize = computed(() => Math.min(selectedDue.value.length, limit.value))
const totalDue = computed(() => DECK_IDS.reduce((n, d) => n + dueByDeck.value[d].length, 0))

function build(): StudyPlan {
  now.value = Date.now()
  const items = selectedDue.value.slice(0, limit.value).map(d => ({ card: d.card, isNew: false }))
  return { items, reviewCount: items.length, dueCount: items.length, newCount: 0 }
}

const started = ref(false)
function start() {
  if (cards.value && roundSize.value > 0)
    started.value = true
}
function backToSetup() {
  started.value = false
  now.value = Date.now()
}
watch(currentUser, (user) => {
  started.value = false
  selectionReady = false
  countMode.value = readChapterPreference(MODE_KEY, modeIds, user, '20') as CountMode
  customCount.value = readCustom(user)
  now.value = Date.now()
  // 换了账号：按新账号的到期词重新默认勾选
  if (cards.value) {
    selectionReady = true
    selected.value = DECK_IDS.filter(d => dueByDeck.value[d].length > 0)
  }
})
onMounted(load)
</script>

<template>
  <StudyCardSession
    v-if="started"
    title="复习到期的词"
    subtitle="各词库到期的词放在一起，按到期时间从早到晚"
    :ready="true"
    :version="0"
    :build="build"
    :alias-ids="aliasIds"
    show-deck
    back-label="选择"
    empty-text="选中的词库里没有到期的词了"
    @exit="backToSetup"
  />
  <div v-else class="px-4 pt-6 2xl:px-0" data-setup>
    <div class="mx-auto max-w-2xl">
      <div class="mb-4 flex items-center gap-3">
        <StudyBack to="/study" label="背单词" />
        <div>
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            复习到期的词
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            选好再开始。每个词会注明来自哪个词库。
          </p>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <p v-if="loadError" class="text-sm text-amber-700" role="alert">
          词表加载失败。<button class="underline" @click="load">
            重试
          </button>
        </p>
        <p v-else-if="!cards" class="text-sm text-gray-600 dark:text-gray-300">
          词表加载中…
        </p>
        <template v-else>
          <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
            复习哪些词库
          </div>
          <div class="grid mb-4 gap-2 sm:grid-cols-2">
            <label
              v-for="d in DECK_IDS"
              :key="d"
              class="flex cursor-pointer items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              :class="dueByDeck[d].length === 0 ? 'opacity-60' : ''"
            >
              <input v-model="selected" type="checkbox" :value="d" :data-review-deck="d" :disabled="dueByDeck[d].length === 0">
              <span class="text-gray-900 dark:text-white">{{ DECK_META[d].name }}</span>
              <span class="ml-auto" :class="dueByDeck[d].length > 0 ? 'text-orange-600 font-bold dark:text-orange-400' : 'text-gray-400'">{{ dueByDeck[d].length }} 个到期</span>
            </label>
          </div>

          <div class="mb-2 text-sm text-gray-700 font-bold dark:text-gray-200">
            这一轮复习多少个
          </div>
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <button
              v-for="m in COUNT_MODES"
              :key="m.id"
              :data-count="m.id"
              :aria-pressed="countMode === m.id"
              class="border rounded-lg px-3 py-2 text-sm font-medium"
              :class="countMode === m.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'"
              @click="countMode = m.id"
            >
              {{ m.label }}
            </button>
            <input
              v-if="countMode === 'custom'"
              :value="customCount"
              type="number"
              min="1"
              max="500"
              aria-label="自定义数量"
              class="block w-24 border border-gray-300 rounded-lg bg-white p-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              @change="setCustom(($event.target as HTMLInputElement).value)"
            >
          </div>

          <p class="mb-4 text-sm text-gray-600 dark:text-gray-300" data-preview>
            <template v-if="totalDue === 0">
              今天没有到期要复习的词，可以去学点新词。
            </template>
            <template v-else-if="roundSize === 0">
              先勾上要复习的词库。
            </template>
            <template v-else>
              这一轮复习 {{ roundSize }} 个<template v-if="selectedDue.length > roundSize">，选中的词库一共 {{ selectedDue.length }} 个到期，剩下的可以再来一轮</template>。
            </template>
          </p>

          <button
            data-start
            class="rounded-lg bg-blue-600 px-8 py-2.5 text-white font-bold disabled:opacity-50 hover:bg-blue-700"
            :disabled="roundSize === 0"
            @click="start"
          >
            开始
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

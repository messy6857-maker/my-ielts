<script setup lang="ts">
import indexData from './daily/index.json'
import { useAuth } from '../../composables/useAuth'
import { getToken } from '../../composables/syncClient'
import { SYNC_API_BASE } from '../../sync-config'

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
const modules = import.meta.glob('./daily/[0-9]*.json', { eager: true }) as Record<string, { default: DailyData }>

const dates = computed(() => {
  const list = (indexData.dates as string[]).filter(d => modules[`./daily/${d}.json`])
  return [...list].sort().reverse()
})

const selectedDate = ref(dates.value[0] ?? '')
const daily = computed<DailyData | null>(() => {
  if (!selectedDate.value)
    return null
  return modules[`./daily/${selectedDate.value}.json`]?.default ?? null
})

// 当前账号的词汇阅读：从后端按 JWT 取，只能拿到自己的
const myVocabReading = ref<Reading | null>(null)
const vocabLoading = ref(false)
async function loadMyVocabReading() {
  myVocabReading.value = null
  const t = getToken()
  if (!currentUser.value || !t || !selectedDate.value)
    return
  vocabLoading.value = true
  try {
    const resp = await fetch(`${SYNC_API_BASE}/daily-reading?date=${selectedDate.value}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    const data = await resp.json()
    if (data.ok && data.reading)
      myVocabReading.value = data.reading
  }
  catch {
    // 忽略网络错误
  }
  finally {
    vocabLoading.value = false
  }
}
watch([selectedDate, currentUser], loadMyVocabReading, { immediate: true })

// 生词注释：点击展开/收起中文（复用自测卡片的彩色样式）
const dotColors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500']
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
  else
    expandedNotes.value.add(key)
}

// 选择题：记录每题所选选项
const answers = ref<Record<string, number>>({})
function selectOption(key: string, idx: number) {
  // 已作答后不允许更改
  if (key in answers.value)
    return
  answers.value[key] = idx
}
function optionClass(articleKey: string, qIdx: number, optIdx: number, correctIdx: number) {
  const key = `${articleKey}-${qIdx}`
  const chosen = answers.value[key]
  const base = 'block w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors '
  if (chosen === undefined)
    return base + 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-900/20'
  if (optIdx === correctIdx)
    return base + 'border-green-500 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300'
  if (optIdx === chosen)
    return base + 'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300'
  return base + 'border-gray-200 bg-white opacity-60 dark:border-gray-700 dark:bg-gray-800'
}

watch(selectedDate, () => {
  expandedNotes.value = new Set()
  answers.value = {}
})

function paragraphs(passage: string): string[] {
  return passage.split('\n\n').map(p => p.trim()).filter(Boolean)
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 2xl:px-0">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        📅 每日阅读
      </h2>
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="$router.push('/reading')"
      >
        ← 返回
      </button>
    </div>

    <!-- 无数据 -->
    <div
      v-if="dates.length === 0"
      class="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="text-4xl mb-4">
        🌙
      </p>
      <p class="text-lg text-gray-600 dark:text-gray-300">
        暂无每日阅读，明早8点见
      </p>
    </div>

    <template v-else>
      <!-- 日期选择 -->
      <div class="mb-6">
        <label class="mb-2 block text-sm font-medium text-gray-600 dark:text-gray-400">选择日期</label>
        <select
          v-model="selectedDate"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
            <span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">基于你前天学过的单词</span>
          </h3>
          <article class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h4 class="mb-3 text-xl font-bold text-gray-900 dark:text-white">
              {{ myVocabReading.title }}
            </h4>
            <div v-if="myVocabReading.basedOn?.length" class="mb-4 flex flex-wrap gap-2">
              <span
                v-for="w in myVocabReading.basedOn"
                :key="w"
                class="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              >
                {{ w }}
              </span>
            </div>
            <div class="mb-4 space-y-4 text-gray-700 leading-relaxed dark:text-gray-300">
              <p v-for="(p, i) in paragraphs(myVocabReading.passage)" :key="i">
                {{ p }}
              </p>
            </div>

            <!-- 生词注释 -->
            <div v-if="myVocabReading.notes.length" class="mb-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
              <p class="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                生词注释 <span class="font-normal text-gray-400">（点击单词查看中文）</span>
              </p>
              <ul class="space-y-1.5">
                <li v-for="(n, i) in myVocabReading.notes" :key="i" class="text-sm">
                  <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dotColors[i % dotColors.length]" />
                  <button
                    class="font-bold underline decoration-dotted underline-offset-2"
                    :class="textColors[i % textColors.length]"
                    @click="toggleNote(`${selectedDate}-vocab-${i}`)"
                  >
                    {{ n.word }}
                  </button>
                  <span v-if="n.pos" class="ml-1 italic text-gray-500 dark:text-gray-400" style="font-family: times;">{{ n.pos }}</span>
                  <span v-if="expandedNotes.has(`${selectedDate}-vocab-${i}`)" class="ml-2 text-gray-600 dark:text-gray-400">{{ n.meaning }}</span>
                </li>
              </ul>
            </div>

            <!-- 选择题 -->
            <div v-if="myVocabReading.questions.length" class="space-y-4">
              <div v-for="(qs, qi) in myVocabReading.questions" :key="qi" class="rounded-xl border border-gray-100 p-4 dark:border-gray-700">
                <p class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {{ qi + 1 }}. {{ qs.q }}
                </p>
                <div class="space-y-2">
                  <button
                    v-for="(opt, oi) in qs.options"
                    :key="oi"
                    :class="optionClass(`${selectedDate}-vocab`, qi, oi, qs.answer)"
                    @click="selectOption(`${selectedDate}-vocab-${qi}`, oi)"
                  >
                    {{ opt }}
                  </button>
                </div>
                <p v-if="`${selectedDate}-vocab-${qi}` in answers" class="mt-2 text-sm" :class="answers[`${selectedDate}-vocab-${qi}`] === qs.answer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                  {{ answers[`${selectedDate}-vocab-${qi}`] === qs.answer ? '✓ 回答正确' : `✗ 答错了，正确答案是 ${qs.options[qs.answer]}` }}
                </p>
              </div>
            </div>
          </article>
        </section>
        <!-- 游客提示：登录后可看个性化词汇阅读 -->
        <section v-else-if="!currentUser" class="mb-8">
          <div class="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-600 dark:bg-gray-800/50">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              📖 词汇阅读是按你的学词记录个性化生成的，
              <router-link to="/login" class="text-blue-600 underline underline-offset-2 dark:text-blue-400">登录</router-link>
              后可见
            </p>
          </div>
        </section>

        <!-- 第二部分：热点阅读 -->
        <section v-if="daily.newsReadings.length" class="mb-8">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-white">
            📰 热点阅读
            <span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{{ daily.newsReadings.length }} 篇</span>
          </h3>
          <article
            v-for="(art, ai) in daily.newsReadings"
            :key="ai"
            class="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <h4 class="mb-1 text-xl font-bold text-gray-900 dark:text-white">
              {{ art.title }}
            </h4>
            <p v-if="art.source" class="mb-3 text-xs text-gray-400">
              来源：{{ art.source }}
            </p>
            <div class="mb-4 space-y-4 text-gray-700 leading-relaxed dark:text-gray-300">
              <p v-for="(p, i) in paragraphs(art.passage)" :key="i">
                {{ p }}
              </p>
            </div>

            <!-- 生词注释 -->
            <div v-if="art.notes.length" class="mb-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
              <p class="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                生词注释 <span class="font-normal text-gray-400">（点击单词查看中文）</span>
              </p>
              <ul class="space-y-1.5">
                <li v-for="(n, i) in art.notes" :key="i" class="text-sm">
                  <span class="mr-1.5 inline-block h-2 w-2 rounded-full" :class="dotColors[i % dotColors.length]" />
                  <button
                    class="font-bold underline decoration-dotted underline-offset-2"
                    :class="textColors[i % textColors.length]"
                    @click="toggleNote(`${selectedDate}-news${ai}-${i}`)"
                  >
                    {{ n.word }}
                  </button>
                  <span v-if="n.pos" class="ml-1 italic text-gray-500 dark:text-gray-400" style="font-family: times;">{{ n.pos }}</span>
                  <span v-if="expandedNotes.has(`${selectedDate}-news${ai}-${i}`)" class="ml-2 text-gray-600 dark:text-gray-400">{{ n.meaning }}</span>
                </li>
              </ul>
            </div>

            <!-- 选择题 -->
            <div v-if="art.questions.length" class="space-y-4">
              <div v-for="(qs, qi) in art.questions" :key="qi" class="rounded-xl border border-gray-100 p-4 dark:border-gray-700">
                <p class="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {{ qi + 1 }}. {{ qs.q }}
                </p>
                <div class="space-y-2">
                  <button
                    v-for="(opt, oi) in qs.options"
                    :key="oi"
                    :class="optionClass(`${selectedDate}-news${ai}`, qi, oi, qs.answer)"
                    @click="selectOption(`${selectedDate}-news${ai}-${qi}`, oi)"
                  >
                    {{ opt }}
                  </button>
                </div>
                <p v-if="`${selectedDate}-news${ai}-${qi}` in answers" class="mt-2 text-sm" :class="answers[`${selectedDate}-news${ai}-${qi}`] === qs.answer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                  {{ answers[`${selectedDate}-news${ai}-${qi}`] === qs.answer ? '✓ 回答正确' : `✗ 答错了，正确答案是 ${qs.options[qs.answer]}` }}
                </p>
              </div>
            </div>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>

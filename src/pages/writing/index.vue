<script setup>
import sentences from './100sentences'
import TaskOne from './task1/TaskOne.vue'

const { isMastered, toggleMastered, masteredCount } = useMastered('writing_mastered_v1')
const { setProgress } = useProgress()
const { mistakes, addMistake, removeMistake } = useMistakes()
const totalSentences = computed(() => sentences.filter(s => s.no != null).length)
watch(masteredCount, () => setProgress('writing', masteredCount.value, totalSentences.value), { immediate: true })

// 从参考译文中提取关键词（去掉停用词），用于提示
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall', 'it', 'its', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her', 'their',
  'one', 'ones', 's', 't', 'not', 'no', 'so', 'such', 'than', 'then', 'too', 'very', 'just', 'also',
  'more', 'most', 'much', 'many', 'some', 'any', 'all', 'both', 'each', 'every', 'other', 'into',
  'over', 'under', 'between', 'through', 'during', 'about', 'against', 'among', 'up', 'out', 'off',
])
function extractKeywords(translation) {
  const words = (translation || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []
  const seen = new Set()
  const result = []
  for (const w of words) {
    if (w.length < 4 || STOPWORDS.has(w) || seen.has(w))
      continue
    seen.add(w)
    result.push(w)
    if (result.length >= 6)
      break
  }
  return result
}

// 页签：修复旧版 href="/#/writing" 丢掉 /my-ielts/ 基址导致的 404
const activeTab = ref('sentences')
const TABS = [
  { key: 'sentences', label: '100 句翻译练习' },
  { key: 'essay-big', label: '[WIP]雅思大作文' },
  { key: 'essay-small', label: '雅思小作文' },
]

// ---------- 100句翻译练习 · 练习模式 ----------
const practicing = ref(false)
const practiceScope = ref('all') // all | unmastered | mistakes
const practiceOrder = ref('seq') // seq | random
const practiceQueue = ref([])
const practiceIndex = ref(0)
const userAnswer = ref('')
const revealed = ref(false)
const graded = ref(null) // null | true | false
const practiceStats = ref({ correct: 0, wrong: 0 })
const practiceFinished = ref(false)
const practiceEmptyMsg = ref('')
const hintKeywords = ref([]) // 已揭示的关键词

const currentPractice = computed(() => practiceQueue.value[practiceIndex.value] ?? null)
const allKeywords = computed(() => currentPractice.value ? extractKeywords(currentPractice.value.translationFromBook) : [])

function startPractice() {
  const all = sentences.filter(s => s.no != null)
  let queue
  if (practiceScope.value === 'unmastered') {
    queue = all.filter(s => !isMastered(s.no))
    practiceEmptyMsg.value = '全部句子都已掌握，太棒了！'
  }
  else if (practiceScope.value === 'mistakes') {
    const mistakeNos = new Set(
      mistakes.value
        .filter(m => m.module === 'writing')
        .map(m => Number(String(m.key).split(':')[1]))
        .filter(n => !Number.isNaN(n)),
    )
    queue = all.filter(s => mistakeNos.has(s.no))
    practiceEmptyMsg.value = '错词本里还没有写作错题，先去练几句吧'
  }
  else {
    queue = [...all]
    practiceEmptyMsg.value = ''
  }
  if (practiceOrder.value === 'random') {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[queue[i], queue[j]] = [queue[j], queue[i]]
    }
  }
  practiceQueue.value = queue
  practiceIndex.value = 0
  practiceStats.value = { correct: 0, wrong: 0 }
  practiceFinished.value = queue.length === 0
  practicing.value = true
  resetPracticeCard()
}

function resetPracticeCard() {
  userAnswer.value = ''
  revealed.value = false
  graded.value = null
  hintKeywords.value = []
}

function showHint() {
  const kws = allKeywords.value
  if (hintKeywords.value.length < kws.length)
    hintKeywords.value = kws.slice(0, hintKeywords.value.length + 1)
}

function exitPractice() {
  practicing.value = false
}

function gradePractice(ok) {
  const item = currentPractice.value
  if (!item || graded.value !== null)
    return
  graded.value = ok
  if (ok) {
    practiceStats.value.correct++
    if (!isMastered(item.no))
      toggleMastered(item.no)
    // 错题重练时答对，从错词本移除
    if (practiceScope.value === 'mistakes')
      removeMistake(`writing:${item.no}`)
  }
  else {
    practiceStats.value.wrong++
    addMistake('writing', {
      key: `writing:${item.no}`,
      title: item.sentence,
      detail: item.translationFromBook,
      hint: item.remark || item.chatgpt,
    })
  }
}

function nextPractice() {
  if (practiceIndex.value + 1 >= practiceQueue.value.length) {
    practiceFinished.value = true
  }
  else {
    practiceIndex.value++
    resetPracticeCard()
  }
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div
      class="mb-4 border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <!-- 页签 -->
      <ul
        class="mb-4 text-sm font-medium text-center text-gray-500 rounded-lg shadow sm:flex dark:divide-gray-700 dark:text-gray-400">
        <li v-for="(tab, i) in TABS" :key="tab.key" class="w-full">
          <button
            :class="[
              'inline-block w-full p-4 border-r border-gray-200 dark:border-gray-700 focus:ring-4 focus:ring-blue-300 focus:outline-none',
              i === 0 ? 'rounded-s-lg' : '',
              i === TABS.length - 1 ? 'rounded-e-lg' : '',
              activeTab === tab.key
                ? 'text-gray-900 bg-gray-100 dark:bg-gray-700 dark:text-white'
                : 'bg-white hover:text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:hover:text-white dark:hover:bg-gray-700',
            ]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </li>
      </ul>

      <!-- ============ 100 句翻译练习 ============ -->
      <div v-if="activeTab === 'sentences'">
        <!-- 练习模式 -->
        <div v-if="practicing" class="max-w-2xl mx-auto">
          <!-- 完成总结 -->
          <div v-if="practiceFinished" class="text-center py-8">
            <h3 class="text-2xl font-bold mb-4 dark:text-white">
              {{ practiceStats.correct + practiceStats.wrong === 0 ? '没有可练的句子' : '本轮练习完成 🎉' }}
            </h3>
            <div v-if="practiceStats.correct + practiceStats.wrong > 0" class="flex justify-center gap-6 mb-6 text-sm">
              <span class="text-green-600 font-bold">写对 {{ practiceStats.correct }}</span>
              <span class="text-red-600 font-bold">没写对 {{ practiceStats.wrong }}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {{ practiceStats.correct + practiceStats.wrong === 0 ? practiceEmptyMsg : (practiceScope === 'mistakes' ? '答对的已从错词本移除，答错的留在错词本里' : '没写对的已记入错词本，写对的已标记为掌握') }}
            </p>
            <div class="flex justify-center gap-3">
              <button
                class="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
                @click="startPractice"
              >
                再来一轮
              </button>
              <button
                class="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                @click="exitPractice"
              >
                返回列表
              </button>
            </div>
          </div>

          <!-- 练习卡片 -->
          <div v-else-if="currentPractice">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm text-gray-500 dark:text-gray-400">
                第 {{ practiceIndex + 1 }} / {{ practiceQueue.length }} 句
              </span>
              <button
                class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                @click="exitPractice"
              >
                退出练习
              </button>
            </div>
            <div class="mb-4 h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-2 rounded-full bg-blue-600 transition-all"
                :style="{ width: `${((practiceIndex) / practiceQueue.length) * 100}%` }"
              />
            </div>

            <div class="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
              <p class="text-xs text-gray-400 mb-2">把下面这句翻译成英文：</p>
              <p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {{ currentPractice.sentence }}
              </p>

              <textarea
                v-model="userAnswer"
                rows="4"
                placeholder="在这里写下你的英文翻译…"
                class="mb-3 block w-full rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />

              <!-- 关键词提示：不会写时点，一个一个揭示 -->
              <div v-if="!revealed && allKeywords.length > 0" class="mb-4 flex flex-wrap items-center gap-2">
                <button
                  v-if="hintKeywords.length < allKeywords.length"
                  class="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
                  @click="showHint"
                >
                  💡 提示关键词（{{ hintKeywords.length }}/{{ allKeywords.length }}）
                </button>
                <span
                  v-for="kw in hintKeywords"
                  :key="kw"
                  class="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
                >
                  {{ kw }}
                </span>
              </div>

              <!-- 对照答案 -->
              <div v-if="!revealed">
                <button
                  class="w-full rounded-xl bg-blue-600 py-3 text-white text-sm font-bold hover:bg-blue-700"
                  @click="revealed = true"
                >
                  对照答案
                </button>
              </div>

              <div v-else class="space-y-4">
                <div class="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm">
                  <p class="mb-1 text-xs text-gray-400">📖 书上标准答案</p>
                  <p class="text-gray-800 dark:text-gray-200">{{ currentPractice.translationFromBook }}</p>
                </div>
                <div v-if="currentPractice.chatgpt" class="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm">
                  <p class="mb-1 text-xs text-gray-400">🤖 ChatGPT 优化版</p>
                  <p class="text-gray-800 dark:text-gray-200">{{ currentPractice.chatgpt }}</p>
                </div>
                <div v-if="currentPractice.remark" class="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
                  <p class="mb-1 text-xs text-amber-600 dark:text-amber-400">💡 备注</p>
                  <p class="text-amber-800 dark:text-amber-200 whitespace-pre-line">{{ currentPractice.remark }}</p>
                </div>

                <!-- 自评 -->
                <div v-if="graded === null" class="grid grid-cols-2 gap-3">
                  <button
                    class="rounded-xl bg-green-50 border border-green-200 py-3 text-green-700 font-bold hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                    @click="gradePractice(true)"
                  >
                    ✓ 我写对了
                  </button>
                  <button
                    class="rounded-xl bg-red-50 border border-red-200 py-3 text-red-700 font-bold hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
                    @click="gradePractice(false)"
                  >
                    ✗ 没写对
                  </button>
                </div>
                <div v-else>
                  <p class="mb-3 text-center text-sm" :class="graded ? 'text-green-600' : 'text-red-600'">
                    {{ graded ? '太棒了，已标记为掌握 ✓' : '没关系，已记入错词本，多练几次 ✓' }}
                  </p>
                  <button
                    class="w-full rounded-xl bg-blue-600 py-3 text-white text-sm font-bold hover:bg-blue-700"
                    @click="nextPractice"
                  >
                    {{ practiceIndex + 1 >= practiceQueue.length ? '查看结果' : '下一句 →' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 列表模式 -->
        <div v-else>
          <div class="items-center justify-between lg:flex">
            <div class="mb-4 lg:mb-0">
              <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                100 句翻译练习
              </h3>
              <span class="text-base font-normal text-gray-500 dark:text-gray-400">能够写出 error-free 的句子</span>
              <span class="ml-4 text-sm font-medium text-green-600 dark:text-green-400">已掌握 {{ masteredCount }} / {{ totalSentences }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-sm text-gray-500 dark:text-gray-400">练习范围</label>
              <select
                v-model="practiceScope"
                class="rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">全部句子</option>
                <option value="unmastered">只练未掌握</option>
                <option value="mistakes">只练错题本</option>
              </select>
              <label class="text-sm text-gray-500 dark:text-gray-400">顺序</label>
              <select
                v-model="practiceOrder"
                class="rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="seq">顺序练习</option>
                <option value="random">随机练习</option>
              </select>
              <button
                class="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
                @click="startPractice"
              >
                开始练习
              </button>
            </div>
          </div>
          <!-- Table -->
          <div class="mt-6 flex flex-col">
            <div class="overflow-x-auto rounded-lg">
              <div class="inline-block min-w-full align-middle">
                <div class="overflow-hidden shadow sm:rounded-lg">
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <tbody class="bg-white dark:bg-gray-800 border-b-1">
                      <template v-for="item of sentences" :key="item.no" class="text-sm text-gray-900 dark:text-white">
                        <template v-if="item.no == null">
                          <tr class="border-t-1 border-x-1">
                            <td colspan="5" class="p-4 font-bold text-xl">{{ item.title }}</td>
                          </tr>
                        </template>
                        <template v-else>
                          <tr class="border-t-1">
                            <td class="p-4 border-x-1" rowspan="2">
                              {{ item.no }}
                            </td>
                            <td class="p-4 border-r-1" rowspan="2">
                              <div class="flex items-start justify-between gap-2">
                                <span>{{ item.sentence }}</span>
                                <button
                                  :title="isMastered(item.no) ? '已掌握，点击取消' : '标记为已掌握'"
                                  class="flex-shrink-0 rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  @click="toggleMastered(item.no)"
                                >
                                  <i :class="isMastered(item.no) ? 'i-carbon-checkmark-filled block text-green-600' : 'i-carbon-checkmark block text-gray-300 dark:text-gray-600'" />
                                </button>
                              </div>
                            </td>
                            <td class="p-4 border-b-1 flex items-center">
                              <div class="mr-4" title="来自书上标准答案"><i class="i-carbon-book block"></i></div>
                              <div>{{ item.translationFromBook }}</div>
                            </td>
                            <td class="p-4 border-x-1 w-30% whitespace-pre-line" rowspan="2">
                              {{ item.remark }}
                            </td>
                          </tr>
                          <tr>
                            <td class="p-4 flex items-center">
                              <div class="mr-4" title="来自 ChatGPT"><i class="i-simple-icons-openai block"></i></div>
                              <div>{{ item.chatgpt }}</div>
                            </td>
                          </tr>
                        </template>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 雅思大作文（WIP） ============ -->
      <div v-else-if="activeTab === 'essay-big'" class="text-center py-16">
        <div class="text-5xl mb-4">🚧</div>
        <h3 class="text-xl font-bold mb-2 dark:text-white">雅思大作文</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Task 2 写作模块建设中，敬请期待</p>
      </div>

      <!-- ============ 雅思小作文（Task 1） ============ -->
      <div v-else-if="activeTab === 'essay-small'">
        <TaskOne />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MockQuestion } from './types'
import { resolveMediaUrl } from '~/composables/useAudio'
import { useGoBack } from '~/composables/useGoBack'
import { useMockExam } from '~/composables/useMockExam'
import ImageViewer from '../../components/ImageViewer.vue'
import TextHighlights from '../../components/TextHighlights.vue'
import { selectionInOneParagraph } from '../../utils/text'
import {
  isRomanLabel,
  mapLabelPlaceholder,
  readingBandScore,
} from './types'

// 阅读限时模考：考试流程（选题、草稿、计时、作答、交卷、保存）在 useMockExam 里和听力共用；
// 这里只有阅读特有的：划词高亮、配对题输入、Passage 切换和配图查看。
const activePassage = ref(0)

const showPassageModal = ref(false)
const enlargedImage = ref<string | null>(null)
// 阅读配图加载失败状态（与听力页 partImageFailed 同款，按 passage 下标计）
const passageImageFailed = ref<Record<number, boolean>>({})
// 划词高亮：passageIndex -> 高亮词组列表
const highlights = ref<Map<number, string[]>>(new Map())
const selectionHint = ref('')
const mapInputHint = ref('')
const selPopup = ref<{ x: number, y: number, text: string } | null>(null)

const {
  router,
  testId,
  test,
  loading,
  loadError,
  started,
  timeLeft,
  answers,
  submitted,
  recovery,
  recordSaveFailed,
  mistakeSave,
  retrySaveResult,
  loadTest,
  startTest,
  discardDraftAndStart,
  allQuestions,
  scoredTotal,
  correctCount,
  band,
  answeredCount,
  setAnswer,
  toggleMultiSelect,
  onTestChange,
  questionStatus,
  submit,
  testPair,
  examClock,
} = useMockExam({
  kind: 'reading',
  path: '/mock/reading-test',
  pick: pair => pair.reading,
  questions: t => t.passages.flatMap(p => p.questions),
  timeLimit: t => t.timeLimit,
  mistakeParts: t => t.passages.map((p, i) => ({
    part: `passage${i + 1}`,
    questions: p.questions,
  })),
  bandScore: readingBandScore,
  extra: () => ({
    active: activePassage.value,
    highlights: [
      ...highlights.value.entries(),
    ],
  }),
  restoreExtra: (extra) => {
    activePassage.value = extra?.active ?? 0
    highlights.value = new Map(extra?.highlights ?? [])
    selPopup.value = null
  },
  beforeLoad: () => {
    mapInputHint.value = ''
    enlargedImage.value = null
    passageImageFailed.value = {}
    selectionHint.value = ''
    showPassageModal.value = false
  },
  afterSubmit: () => {
    selPopup.value = null
  },
})

// 页面里用不到，对外可读：测试靠它们检查套题是否已载入、计时器是否已停
defineExpose({ testPair, examClock })

const { goBack } = useGoBack('/ielts')
// 考试中点返回先确认未交卷；开始屏/已交卷直接返回

function handleBack() {
  goBack()
}
function leaveForHistory() {
  router.push('/mock/history')
}

// 划词高亮
function handleSelect(pi: number) {
  // 延迟一帧，确保浏览器完成选中
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      selPopup.value = null
      return
    }
    if (!selectionInOneParagraph(sel)) {
      selectionHint.value
        = '请在同一个段落内选择词组后高亮，跨段选择不会保存。'
      selPopup.value = null
      return
    }
    selectionHint.value = ''
    const text = sel.toString().trim()
    // 只处理文章区内的选中
    const anchorEl = sel.anchorNode?.parentElement
    if (!anchorEl?.closest('[data-passage]')) {
      selPopup.value = null
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    selPopup.value = {
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      text,
    };
    // 记住当前 passage
    (selPopup.value as any).pi = pi
  }, 10)
}

function addHighlight() {
  if (!selPopup.value)
    return
  const pi = (selPopup.value as any).pi as number
  const text = selPopup.value.text
  if (
    !test.value?.passages[pi]?.passage
      .split(/\n\n/)
      .some(p => p.includes(text))
  ) {
    selectionHint.value = '所选词组不在单一段落内，请重新选择。'
    selPopup.value = null
    return
  }
  const list = highlights.value.get(pi) ?? []
  if (!list.includes(text)) {
    list.push(text)
    highlights.value.set(pi, list)
  }
  selPopup.value = null
  window.getSelection()?.removeAllRanges()
}

function clearSelection() {
  selPopup.value = null
}

// 点击已高亮的词取消高亮：只删点击所在的 Passage 的该文本，不动其他 Passage 的同文本
function handleMarkClick(e: MouseEvent, pi: number) {
  const target = e.target as HTMLElement
  if (target.classList?.contains('user-mark')) {
    const text = target.textContent ?? ''
    const list = highlights.value.get(pi) ?? []
    const idx = list.indexOf(text)
    if (idx >= 0) {
      list.splice(idx, 1)
      highlights.value.set(pi, [...list])
    }
  }
}
function setMapLabel(q: MockQuestion, event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value.trim()
  if (isRomanLabel(q)) {
    mapInputHint.value
      = value && !/^[ivxlcdm]{1,4}$/i.test(value)
        ? '标题配对请填写罗马数字（如 i、iv、ix）'
        : ''
    value = value
      .toLowerCase()
      .replace(/[^ivxlcdm]/g, '')
      .slice(0, 4)
  }
  else {
    const letters = value.toUpperCase().replace(/[^A-Z]/g, '')
    mapInputHint.value
      = value && (!letters || letters.length > 1)
        ? '配对题只填一个字母（A–Z）'
        : ''
    value = letters.slice(0, 1)
  }
  input.value = value
  setAnswer(q.id, value)
}
function switchPassage(index: number) {
  activePassage.value = index
  selPopup.value = null
  mapInputHint.value = ''
  selectionHint.value = ''
  enlargedImage.value = null
  showPassageModal.value = false
}
</script>

<template>
  <p
    v-if="recovery.retired.value"
    role="alert"
    class="mx-auto max-w-4xl rounded bg-amber-50 p-3 text-amber-900"
  >
    {{ recovery.retiredMessage.value }}
    <button class="ml-2 underline" @click="recovery.continueRecovered">
      保留答案，继续为独立作答
    </button>
    <button class="ml-2 underline" @click="recovery.leaveRetired">
      保留副本，回到开始页
    </button>
  </p>
  <ImageViewer
    v-if="enlargedImage"
    :src="enlargedImage"
    :disabled="recovery.blocked.value"
    @close="enlargedImage = null"
  />
  <p v-if="mistakeSave.failed.value" role="alert" class="m-4 text-sm text-amber-700">
    部分错题保存失败。释放空间后可重试，已保存的题不会重复计数。
    <button class="underline" @click="mistakeSave.retry">
      重试写入错题
    </button>
  </p>
  <button
    v-if="recordSaveFailed"
    class="m-4 rounded bg-amber-100 p-2 text-amber-900"
    @click="retrySaveResult"
  >
    重试保存成绩
  </button>
  <div class="mx-auto max-w-7xl px-4 pt-6 2xl:px-0">
    <p v-if="mapInputHint" role="status" class="my-2 text-amber-700">
      {{ mapInputHint }}
    </p>
    <p
      v-if="selectionHint"
      role="status"
      class="my-3 text-sm text-amber-700 dark:text-amber-300"
    >
      {{ selectionHint }}
    </p>
    <p
      v-if="recovery.error.value"
      :inert="recovery.blocked.value ? true : undefined"
      role="alert"
      class="my-3 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
    >
      {{ recovery.error.value }}
      <button
        type="button"
        class="ml-2 underline"
        @click="recovery.dismissNotice()"
      >
        知道了
      </button>
    </p>
    <div v-if="loading" class="py-20 text-center text-gray-500">
      加载中…
    </div>
    <div v-else-if="loadError" class="py-20 text-center">
      <p class="mb-4 text-4xl">
        😢
      </p>
      <p class="mb-4 text-gray-500 dark:text-gray-400">
        题目加载失败，可能是网络抖动
      </p>
      <button
        class="rounded-lg bg-blue-600 px-6 py-2 text-white font-bold hover:bg-blue-700"
        @click="loadTest"
      >
        🔄 重新加载
      </button>
    </div>
    <template v-else-if="test">
      <!-- 开始屏：点开始才计时 -->
      <MockStartScreen
        v-if="!started"
        :recovery="recovery"
        :test-id="testId"
        icon="📖"
        :title="test.title"
        @change-test="onTestChange"
        @start="startTest"
        @discard="discardDraftAndStart"
      >
        <template #summary>
          共 {{ test.passages.length }} 篇文章 · {{ allQuestions.length }} 道题
          · 满分 {{ scoredTotal }} 分 · 限时
          {{ Math.round(test.timeLimit / 60) }} 分钟
        </template>
      </MockStartScreen>
      <div v-else :inert="recovery.blocked.value ? true : undefined">
        <!-- 顶栏：标题 + 计时器 -->
        <MockTopBar
          :recovery="recovery"
          :test-id="testId"
          icon="📖"
          :title="test.title"
          :time-left="timeLeft"
          :submitted="submitted"
          @change-test="onTestChange"
          @submit="submit"
        >
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="handleBack"
          >
            ← 返回
          </button>
        </MockTopBar>

        <!-- 成绩单 -->
        <MockScoreCard
          v-if="submitted"
          :answered-count="answeredCount"
          :band="band"
          :correct-count="correctCount"
          :scored-total="scoredTotal"
        />

        <!-- Passage 切换 -->
        <div v-if="!submitted" class="mb-6 flex gap-2">
          <button
            v-for="(_, i) in test.passages"
            :key="i"
            class="rounded-lg px-4 py-2 text-sm font-bold"
            :class="
              activePassage === i
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            "
            @click="switchPassage(i)"
          >
            Passage {{ i + 1 }}
          </button>
        </div>

        <!-- 题目区：桌面端左右分栏各自独立滚动，手机端上下堆叠 -->
        <div
          v-for="(p, pi) in test.passages"
          v-show="submitted || activePassage === pi"
          :key="pi"
          class="mb-8"
        >
          <div class="grid gap-6 lg:grid-cols-2 lg:h-[calc(100vh-12rem)]">
            <!-- 左：文章（独立滚动，支持划词高亮） -->
            <!-- M-Opt5：桌面端标题列表置顶对照。article 在 lg 下改为 flex 列，
                 headings 块仅在 lg 下 order-first + 吸顶；移动端 DOM 顺序与
                 手机原文弹窗均不动。 -->
            <article
              data-passage
              class="select-text border border-gray-200 rounded-2xl bg-white p-6 shadow-sm lg:min-h-0 lg:flex lg:flex-col lg:overflow-y-auto dark:border-gray-700 dark:bg-gray-800"
              @mouseup="handleSelect(pi)"
              @touchend="handleSelect(pi)"
            >
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-xl text-gray-900 font-bold dark:text-white">
                  Passage {{ pi + 1 }}：{{ p.title }}
                </h3>
                <button
                  v-if="(highlights.get(pi) ?? []).length"
                  class="border border-gray-300 rounded-lg px-3 py-1 text-xs text-gray-500 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  @click="highlights.set(pi, [])"
                >
                  清除标记
                </button>
              </div>
              <p class="mb-4 text-xs text-gray-400 dark:text-gray-500">
                💡 选中词组可标记高亮，点击已标记的词可取消
              </p>
              <div
                class="text-gray-700 leading-relaxed space-y-4 dark:text-gray-300"
              >
                <p
                  v-for="(para, i) in p.passage.split('\n\n')"
                  :key="i"
                  @click="handleMarkClick($event, pi)"
                >
                  <TextHighlights
                    :text="para"
                    :words="highlights.get(pi) ?? []"
                    marking
                  />
                </p>
              </div>
              <img
                v-if="p.image && !passageImageFailed[pi]"
                :src="resolveMediaUrl(p.image)"
                :alt="`${p.title} 示意图`"
                class="mt-4 max-w-full cursor-zoom-in border border-gray-200 rounded-lg dark:border-gray-700"
                @click="enlargedImage = resolveMediaUrl(p.image)"
                @error="passageImageFailed[pi] = true"
              >
              <p
                v-else-if="p.image && passageImageFailed[pi]"
                class="mt-4 text-sm text-gray-500"
              >
                示意图加载失败，请检查网络后刷新页面
              </p>
              <div
                v-if="p.headings?.length"
                class="mt-4 border border-gray-200 rounded-lg bg-white p-4 lg:sticky lg:top-0 lg:z-10 lg:order-first lg:mt-0 dark:border-gray-700 dark:bg-gray-800"
              >
                <p class="mb-2 text-sm text-gray-900 font-bold dark:text-white">
                  标题列表
                </p>
                <ul class="text-sm text-gray-700 space-y-1 dark:text-gray-300">
                  <li v-for="(h, hi) in p.headings" :key="hi">
                    {{ h }}
                  </li>
                </ul>
              </div>
            </article>

            <!-- 右：题目（独立滚动） -->
            <div class="lg:min-h-0 space-y-4 lg:overflow-y-auto lg:pr-2">
              <!-- 配对/标注题的选项框在 MockQuestionCard 里，镜像听力页写法（M-Opt4）。阅读数据
                   已有 map-label options 字段（如 cam18-test2 的 AI_HEALTH_OPTIONS）。 -->
              <MockQuestionCard
                v-for="(q, qi) in p.questions"
                :key="q.id"
                :q="q"
                :questions="p.questions"
                :index="qi"
                :answer="answers[q.id]"
                :status="questionStatus(q)"
                :submitted="submitted"
                @answer="setAnswer(q.id, $event)"
                @toggle="toggleMultiSelect(q.id, $event)"
              >
                <template #map-label>
                  <!-- 地图标注题 -->
                  <input
                    v-if="q.type === 'map-label'"
                    :disabled="submitted"
                    :value="answers[q.id] ?? ''"
                    :placeholder="mapLabelPlaceholder(q)"
                    :maxlength="isRomanLabel(q) ? 4 : 1"
                    class="w-24 border border-gray-300 rounded-lg px-4 py-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    @input="setMapLabel(q, $event)"
                  >
                </template>
              </MockQuestionCard>
            </div>
          </div>
        </div>

        <div class="pb-12 text-center space-x-3">
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="router.push('/ielts')"
          >
            ← 返回雅思考试
          </button>
          <button
            type="button"
            class="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="leaveForHistory"
          >
            📊 做题记录
          </button>
        </div>

        <!-- 划词高亮弹窗 -->
        <div
          v-if="selPopup"
          class="fixed z-50 rounded-lg bg-gray-900 px-3 py-2 shadow-xl -translate-x-1/2 -translate-y-full"
          :style="{ left: `${selPopup.x}px`, top: `${selPopup.y}px` }"
        >
          <div class="flex items-center gap-2">
            <button
              class="rounded bg-yellow-400 px-3 py-1 text-sm text-gray-900 font-bold hover:bg-yellow-300"
              @click="addHighlight"
            >
              🖍 标记
            </button>
            <button
              class="rounded px-2 py-1 text-sm text-gray-300 hover:text-white"
              @click="clearSelection"
            >
              ✕
            </button>
          </div>
          <div
            class="absolute left-1/2 top-full h-0 w-0 border-8 border-transparent border-t-gray-900 -translate-x-1/2"
          />
        </div>

        <!-- 手机端悬浮"原文"按钮 -->
        <button
          v-if="!submitted"
          class="fixed bottom-6 right-6 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm text-white font-bold shadow-lg lg:hidden hover:bg-blue-700"
          @click="showPassageModal = true"
        >
          📖 原文
        </button>

        <!-- 手机端原文弹窗 -->
        <div
          v-if="showPassageModal"
          class="fixed inset-0 z-50 flex flex-col bg-white lg:hidden dark:bg-gray-900"
        >
          <div
            class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
          >
            <h3 class="text-gray-900 font-bold dark:text-white">
              Passage {{ activePassage + 1 }}：{{
                test.passages[activePassage].title
              }}
            </h3>
            <button
              class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold dark:bg-gray-700"
              @click="showPassageModal = false"
            >
              ✕ 关闭
            </button>
          </div>
          <div
            class="flex-1 overflow-y-auto px-4 py-4"
            data-passage
            @mouseup="handleSelect(activePassage)"
            @touchend="handleSelect(activePassage)"
          >
            <div
              class="text-gray-700 leading-relaxed space-y-4 dark:text-gray-300"
            >
              <p
                v-for="(para, i) in test.passages[activePassage].passage.split(
                  '\n\n',
                )"
                :key="i"
                @click="handleMarkClick($event, activePassage)"
              >
                <TextHighlights
                  :text="para"
                  :words="highlights.get(activePassage) ?? []"
                  marking
                />
              </p>
            </div>
            <img
              v-if="test.passages[activePassage].image && !passageImageFailed[activePassage]"
              :src="resolveMediaUrl(test.passages[activePassage].image ?? '')"
              :alt="`${test.passages[activePassage].title} 示意图`"
              class="mt-4 max-w-full cursor-zoom-in border border-gray-200 rounded-lg dark:border-gray-700"
              @click="
                enlargedImage = resolveMediaUrl(
                  test.passages[activePassage].image ?? '',
                )
              "
              @error="passageImageFailed[activePassage] = true"
            >
            <p
              v-else-if="test.passages[activePassage].image && passageImageFailed[activePassage]"
              class="mt-4 text-sm text-gray-500"
            >
              示意图加载失败，请检查网络后刷新页面
            </p>
            <div
              v-if="test.passages[activePassage].headings?.length"
              class="mt-4 border border-gray-200 rounded-lg p-4 dark:border-gray-700"
            >
              <p class="mb-2 text-sm text-gray-900 font-bold dark:text-white">
                标题列表
              </p>
              <ul class="text-sm text-gray-700 space-y-1 dark:text-gray-300">
                <li
                  v-for="(h, hi) in test.passages[activePassage].headings"
                  :key="hi"
                >
                  {{ h }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.user-mark {
  background-color: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
  cursor: pointer;
}
.dark .user-mark {
  background-color: #a16207;
  color: #fefce8;
}
</style>

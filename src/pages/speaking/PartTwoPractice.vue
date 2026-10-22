<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { formatClock, useRecorder } from '~/composables/useRecorder'
import type { Part2Card } from './part2'

defineProps<{ card: Part2Card }>()
const emit = defineEmits<{ back: [] }>()

type Phase = 'ready' | 'prep' | 'talk' | 'done'
const phase = ref<Phase>('ready')
const countdown = ref(0)

const PREP_SECONDS = 60
const TALK_SECONDS = 120

let timer: ReturnType<typeof setInterval> | null = null
const recorder = useRecorder()

const phaseLabel = computed(() => ({
  ready: '准备',
  prep: '⏳ 准备中（1 分钟）',
  talk: '🎙 陈述中（2 分钟）',
  done: '✅ 完成',
}[phase.value]))

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startPrep() {
  phase.value = 'prep'
  countdown.value = PREP_SECONDS
  clearTimer()
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearTimer()
      startTalk()
    }
  }, 1000)
}

async function startTalk() {
  clearTimer()
  phase.value = 'talk'
  countdown.value = TALK_SECONDS
  // 陈述开始自动录音
  await recorder.start()
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0)
      finishTalk()
  }, 1000)
}

function finishTalk() {
  clearTimer()
  recorder.stop()
  phase.value = 'done'
}

function retry() {
  clearTimer()
  recorder.clear()
  phase.value = 'ready'
  countdown.value = 0
}

function goBack() {
  clearTimer()
  recorder.stop()
  emit('back')
}

onUnmounted(() => {
  clearTimer()
  recorder.stop()
})
</script>

<template>
  <div>
    <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="goBack">
      ← 返回卡片列表
    </button>

    <!-- Cue card -->
    <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-900/10">
      <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">{{ card.category }} · Part 2</div>
      <h3 class="mb-3 text-lg font-bold dark:text-white">{{ card.title }}</h3>
      <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">{{ card.titleCn }}</p>
      <div class="text-sm font-bold dark:text-white">You should say:</div>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-300">
        <li v-for="(b, i) in card.bullets" :key="i">{{ b }}</li>
      </ul>
    </div>

    <!-- 阶段控制 -->
    <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-4 flex items-center justify-between">
        <span class="text-sm font-bold dark:text-white">{{ phaseLabel }}</span>
        <span
          v-if="phase === 'prep' || phase === 'talk'"
          class="text-3xl font-bold tabular-nums"
          :class="countdown <= 10 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'"
        >
          {{ formatClock(countdown) }}
        </span>
      </div>

      <div v-if="phase === 'ready'" class="space-y-3">
        <p class="text-sm leading-6 text-gray-500 dark:text-gray-400">
          考试流程：先 <b>1 分钟准备</b>（可以在纸上记要点），然后 <b>1–2 分钟陈述</b>。陈述开始时会自动录音，结束后可以回放检查流利度、语法和词汇。
        </p>
        <button
          class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          @click="startPrep"
        >
          ▶ 开始 1 分钟准备
        </button>
      </div>

      <div v-if="phase === 'prep'" class="space-y-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">在纸上快速记下要点，想好开头、中间、结尾。准备好可提前开始。</p>
        <button
          class="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700"
          @click="startTalk"
        >
          🎙 提前开始陈述
        </button>
      </div>

      <div v-if="phase === 'talk'" class="space-y-3">
        <p class="flex items-center gap-2 text-sm text-red-500">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
          正在录音…覆盖所有 bullet points，保持说到 1 分半以上
        </p>
        <button
          class="rounded-lg bg-gray-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-700"
          @click="finishTalk"
        >
          ⏹ 结束陈述
        </button>
      </div>

      <div v-if="phase === 'done'" class="space-y-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">回放你的陈述，检查：有没有说满时间？四个要点都覆盖了吗？有没有长时间卡壳？</p>
        <audio v-if="recorder.audioUrl.value" :src="recorder.audioUrl.value" controls class="w-full" />
        <p v-if="recorder.error.value" class="text-sm text-red-500">{{ recorder.error.value }}</p>
        <div class="flex gap-2">
          <button
            class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            @click="retry"
          >
            🔄 再练一次
          </button>
          <button
            class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm dark:border-gray-600 dark:text-gray-200"
            @click="goBack"
          >
            换一张卡
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

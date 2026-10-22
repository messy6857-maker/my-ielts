<script setup lang="ts">
import { formatClock, useRecorder } from '~/composables/useRecorder'

const { isRecording, audioUrl, error, elapsed, start, stop, clear } = useRecorder()

async function toggle() {
  if (isRecording.value)
    stop()
  else
    await start()
}
</script>

<template>
  <div class="mt-2 flex flex-wrap items-center gap-2">
    <button
      class="rounded-full px-3 py-1.5 text-xs font-bold text-white transition"
      :class="isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
      @click="toggle"
    >
      <span v-if="isRecording">⏹ 停止（{{ formatClock(elapsed) }}）</span>
      <span v-else>🎤 录音回答</span>
    </button>
    <span v-if="isRecording" class="flex items-center gap-1 text-xs text-red-500">
      <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />录音中…
    </span>
    <audio v-if="audioUrl && !isRecording" :src="audioUrl" controls class="h-8 max-w-full" />
    <button
      v-if="audioUrl && !isRecording"
      class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      @click="clear"
    >
      清除
    </button>
    <p v-if="error" class="w-full text-xs text-red-500">{{ error }}</p>
  </div>
</template>

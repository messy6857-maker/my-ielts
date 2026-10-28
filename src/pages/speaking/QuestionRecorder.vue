<script setup lang="ts">
import { onUnmounted } from 'vue'
import AIGradeSpeaking from './AIGradeSpeaking.vue'
import { formatRecordingClock, useRecorder } from '~/composables/useRecorder'

defineProps<{ question: string }>()

const {
  isRecording,
  processing,
  starting,
  audioUrl,
  error,
  elapsed,
  transcript,
  transcriptionSupported,
  start,
  stop,
  clear,
} = useRecorder()

async function toggle() {
  if (isRecording.value)
    stop()
  else await start()
}

// 收起话题/切页签会卸载本组件：卸载时必须停录音，否则麦克风在后台继续开着
onUnmounted(() => {
  stop()
})
</script>

<template>
  <div class="mt-2">
    <div class="flex flex-wrap items-center gap-2">
      <button
        class="rounded-full px-3 py-1.5 text-xs font-bold text-white transition"
        :class="
          isRecording
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-blue-600 hover:bg-blue-700'
        "
        :disabled="starting || processing"
        @click="toggle"
      >
        <span v-if="isRecording">⏹ 停止（{{ formatRecordingClock(elapsed) }}）</span>
        <span v-else>🎤 录音回答</span>
      </button>
      <span
        v-if="isRecording"
        class="flex items-center gap-1 text-xs text-red-500"
      >
        <span
          class="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500"
        />录音中…
      </span>
      <audio
        v-if="audioUrl && !isRecording && !processing"
        :src="audioUrl"
        controls
        class="h-8 max-w-full"
        @error="error = '录音回放失败，请尝试重新录制'"
      />
      <button
        v-if="audioUrl && !isRecording && !processing"
        class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        @click="clear"
      >
        清除
      </button>
    </div>
    <p v-if="starting || processing" class="text-xs text-gray-500">
      {{ starting ? '正在等待麦克风权限…' : '正在保存录音…' }}
    </p>
    <p v-if="error" class="mt-1 text-xs text-red-500">
      {{ error }}
    </p>

    <!-- 语音转写 -->
    <div
      v-if="transcript || (audioUrl && !isRecording && !processing)"
      class="mt-2 rounded-lg bg-gray-50 p-3 text-xs leading-5 dark:bg-gray-700/50"
    >
      <div class="mb-1 font-bold text-gray-500 dark:text-gray-400">
        📝 语音转写
      </div>
      <p v-if="transcript" class="text-gray-700 dark:text-gray-200">
        {{ transcript }}
      </p>
      <p v-else-if="!transcriptionSupported" class="text-gray-400">
        当前浏览器不支持语音转写（请用 Chrome/Edge），AI
        评分不可用，但录音回放正常。
      </p>
      <p v-else class="text-gray-400">
        未识别出语音内容
      </p>
    </div>

    <!-- AI 评分 -->
    <AIGradeSpeaking
      v-if="audioUrl && !isRecording && !processing && transcript.trim()"
      :question="question"
      :transcript="transcript"
    />
  </div>
</template>

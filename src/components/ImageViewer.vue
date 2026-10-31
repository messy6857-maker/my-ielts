<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ src: string; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const scale = ref(1)
const failed = ref(false)
const imageVersion = ref(0)
watch(
  () => props.src,
  () => {
    failed.value = false
    scale.value = 1
  },
)
function retry() {
  failed.value = false
  imageVersion.value++
}
function key(event: KeyboardEvent) {
  if (!props.disabled && event.key === 'Escape')
    emit('close')
}
onMounted(() => window.addEventListener('keydown', key))
onUnmounted(() => window.removeEventListener('keydown', key))
</script>

<template>
  <Teleport to="body">
    <div
      role="dialog"
      :inert="disabled ? true : undefined"
      aria-modal="true"
      aria-label="图片放大"
      class="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
    >
      <div class="flex gap-4 p-4">
        <button @click="scale = Math.max(1, scale - 0.5)">
          缩小
        </button><button @click="scale = Math.min(4, scale + 0.5)">
          放大
        </button><button class="ml-auto" @click="emit('close')">
          关闭
        </button>
      </div>
      <div class="flex-1 overflow-auto p-4">
        <p v-if="failed" role="alert">
          图片加载失败。<button class="underline" @click="retry">
            重试加载
          </button>
        </p>
        <img
          v-if="!failed"
          :key="imageVersion"
          :src="src"
          alt="放大后的题目图片"
          class="mx-auto max-w-none"
          :style="{ width: `${scale * 100}%` }"
          @error="failed = true"
        >
      </div>
    </div>
  </Teleport>
</template>

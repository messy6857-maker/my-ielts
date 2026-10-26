<script setup lang="ts">
import type { Component } from 'vue'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

const props = defineProps<{ loader: () => Promise<{ default: Component }> }>()
const task = shallowRef<Component | null>(null)
const error = ref(false)
let requestId = 0
async function load() {
  const request = ++requestId
  task.value = null
  error.value = false
  try {
    const loaded = await props.loader()
    if (request === requestId) task.value = loaded.default
  }
  catch {
    if (request === requestId) error.value = true
  }
}
watch(() => props.loader, load, { immediate: true })
onScopeDispose(() => { requestId++ })
</script>

<template>
  <component :is="task" v-if="task" />
  <p v-else-if="error" role="alert" class="py-8 text-center">
    作文练习加载失败，请检查网络。
    <button class="ml-2 text-blue-600 underline" @click="load">
重试
</button>
  </p>
  <p v-else role="status" class="py-8 text-center text-gray-500">
正在加载作文练习…
</p>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useGoBack } from '../composables/useGoBack'
import { aiSettingsState, getAISettings, saveAISettings, testAIConnection } from '../composables/useAISettings'

const { goBack } = useGoBack('/')

const form = ref({ ...getAISettings() })
const saved = ref(false)
const testing = ref(false)
const testMsg = ref('')
const testOk = ref(false)
const showKey = ref(false)

function onSave() {
  saveAISettings({
    baseUrl: form.value.baseUrl.trim(),
    apiKey: form.value.apiKey.trim(),
    model: form.value.model.trim(),
  })
  aiSettingsState.value = getAISettings()
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

async function onTest() {
  testing.value = true
  testMsg.value = ''
  try {
    // 先保存再测
    onSave()
    testMsg.value = await testAIConnection()
    testOk.value = true
  }
  catch (e) {
    testMsg.value = e instanceof Error ? e.message : '连接失败'
    testOk.value = false
  }
  finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 2xl:px-0">
    <button class="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400" @click="goBack">← 返回</button>
    <h2 class="mb-6 text-xl font-bold dark:text-white">⚙️ 设置</h2>

    <div class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 class="mb-1 font-bold dark:text-white">🤖 AI 批改</h3>
      <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
        填写后可在大小作文批改页使用 AI 批改。Key 只保存在你本机浏览器，请求经你的 VPS 中转（浏览器直连会被第三方接口拦截）。
      </p>

      <label class="mb-4 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">API 地址</span>
        <input
          v-model="form.baseUrl"
          placeholder="https://api.deepseek.com/v1"
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <span class="mt-1 block text-xs text-gray-400">OpenAI 兼容接口地址，不带 /chat/completions</span>
      </label>

      <label class="mb-4 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">API Key</span>
        <div class="relative">
          <input
            v-model="form.apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
            autocomplete="off"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            @click="showKey = !showKey"
          >{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
      </label>

      <label class="mb-6 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">模型</span>
        <input
          v-model="form.model"
          placeholder="deepseek-chat"
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <div class="flex flex-wrap items-center gap-3">
        <button
          class="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 dark:bg-blue-600"
          @click="onSave"
        >保存</button>
        <button
          class="rounded-xl border border-gray-300 px-5 py-2.5 text-sm dark:border-gray-600 dark:text-white"
          :disabled="testing"
          @click="onTest"
        >{{ testing ? '测试中…' : '测试连接' }}</button>
        <span v-if="saved" class="text-sm text-green-600">已保存 ✓</span>
        <span v-if="testMsg" class="text-sm" :class="testOk ? 'text-green-600' : 'text-red-500'">{{ testMsg }}</span>
      </div>
    </div>
  </div>
</template>

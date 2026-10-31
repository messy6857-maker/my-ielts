<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useSync } from '../composables/useSync'
import {
  REJECTED_REASON_LABELS,
  clearQuarantinedKeys,
  getQuarantinedKeys,
  getRejectedReason,
  unquarantineKeys,
} from '../composables/syncClient'
import { decodeId } from '../utils/storage'
import {
  downloadStudyBackup,
  previewStudyBackup,
  restoreStudyBackup,
} from '../utils/backup'
import { pruneArchives } from '../utils/archives'
import { useGoBack } from '../composables/useGoBack'
import {
  aiSettingsState,
  getAISettings,
  saveAISettings,
  testAIConnection,
} from '../composables/useAISettings'

const { currentUser } = useAuth()
const { rejectedNotice, dismissRejectedNotice, pushNow } = useSync()
const language = ref(
  localStorage.getItem('myielts_tts_language') === 'en-GB' ? 'en-GB' : 'en-US',
)
watch(language, value => localStorage.setItem('myielts_tts_language', value))
const importText = ref('')
const importGuest = ref(false)
const importMessage = ref('')
const importPreview = computed(() => {
  try {
    return importText.value
      ? previewStudyBackup(importText.value, importGuest.value)
      : null
  }
  catch {
    return null
  }
})
async function chooseBackup(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  if (file.size > 30 * 1024 * 1024) {
    importMessage.value = '备份超过 30MB，请先拆分文件'
    return
  }
  importText.value = await file.text()
  importMessage.value = importPreview.value
    ? ''
    : '备份格式无效，未写入任何数据'
}
function restoreBackup() {
  if (!importPreview.value)
    return
  const result = restoreStudyBackup(importPreview.value, currentUser.value)
  importMessage.value = `已合并 ${result.imported} 条；保留本机较新版本 ${result.keptNewer} 条；失败 ${result.failed} 条。`
  importText.value = ''
}
const backup = () => downloadStudyBackup(currentUser.value)
const cleanupArchives = () => pruneArchives(currentUser.value)
// 服务端拒绝的同步条目（格式异常）：已隔离不再上传，本机记录仍在，导出备份可取回
const quarantined = ref<string[]>([])
function refreshQuarantined() {
  quarantined.value = getQuarantinedKeys(currentUser.value)
}
watch(currentUser, refreshQuarantined, { immediate: true })
watch(rejectedNotice, refreshQuarantined)
// entry 键形如 myielts_u_<用户>_<表>__entry_<hex>：用现有 decodeId 还原记录 ID，
// 用户才能辨认被隔离的是哪条记录（用户名含下划线时不硬拆，只还原 ID 部分）。
function describeQuarantinedKey(k: string) {
  const idx = k.indexOf('__entry_')
  if (idx === -1)
    return k
  const id = decodeId(k.slice(idx + 8))
  return id === null ? k : `${k.slice(0, idx)} · ${id}`
}
function rejectedReasonLabel(k: string) {
  const r = getRejectedReason(currentUser.value, k)
  return r ? REJECTED_REASON_LABELS[r] : ''
}
async function unquarantineOne(k: string) {
  if (!currentUser.value)
    return
  unquarantineKeys(currentUser.value, [k])
  refreshQuarantined()
  await pushNow(true)
  refreshQuarantined()
}
async function clearQuarantine() {
  clearQuarantinedKeys(currentUser.value)
  dismissRejectedNotice()
  refreshQuarantined()
  await pushNow(true)
  refreshQuarantined()
}
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
    testMsg.value = await testAIConnection({ ...form.value })
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
  <section class="mx-auto mt-4 max-w-2xl border rounded p-4">
    <h3 class="font-bold">
      恢复学习备份
    </h3>
    <input type="file" accept="application/json,.json" @change="chooseBackup">
    <label class="my-2 flex gap-2"><input
      v-model="importGuest"
      type="checkbox"
    >读取备份中的游客原始记录</label>
    <p v-if="importPreview">
      来源：{{ importPreview.source || "游客" }}；目标：{{
        currentUser || "当前游客"
      }}；可合并 {{ Object.keys(importPreview.entries).length }} 条，跳过
      {{ importPreview.skipped }}
      条。较新的本机记录及删除标记优先；草稿分别保留。
    </p>
    <button
      v-if="importPreview"
      class="my-2 rounded bg-blue-600 px-3 py-1 text-white"
      @click="restoreBackup"
    >
      合并到当前身份
    </button>
    <p role="status">
      {{ importMessage }}
    </p>
  </section>
  <div class="mx-auto max-w-2xl px-4 pt-6 2xl:px-0">
    <button
      class="mb-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800"
      @click="goBack"
    >
      ← 返回
    </button>
    <h2 class="mb-6 text-xl font-bold dark:text-white">
      ⚙️ 设置
    </h2>

    <section
      class="mb-6 border border-gray-200 rounded-xl p-5 dark:border-gray-700"
    >
      <h3 class="mb-2 font-bold">
        学习记录与朗读
      </h3>
      <p class="mb-3 text-sm text-gray-500">
        备份包含当前身份的学习记录及作文草稿，不包含密码、登录令牌或 API
        Key。AI评分存档保留最近30份，合计不超过1 MiB；导出后可清理旧存档。
      </p>
      <button class="mr-3 border rounded px-3 py-2 text-sm" @click="backup">
        导出学习备份
      </button>
      <button class="border rounded px-3 py-2 text-sm" @click="cleanupArchives">
        整理旧评分存档
      </button>
      <div
        v-if="quarantined.length"
        class="mt-4 border border-amber-300 rounded-lg bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20"
      >
        <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
          ⚠️ 有
          {{ quarantined.length }}
          条学习记录因格式异常被服务端拒绝，已隔离不再随包上传（本机记录仍在，可先导出备份）。
        </p>
        <p
          v-if="rejectedNotice"
          class="mt-1 text-sm text-amber-800 dark:text-amber-200"
        >
          {{ rejectedNotice }}
        </p>
        <ul class="mt-2 max-h-32 overflow-auto break-all text-xs text-gray-500">
          <li
            v-for="k in quarantined"
            :key="k"
            class="flex items-baseline justify-between gap-2"
          >
            <span>{{ describeQuarantinedKey(k)
            }}<span v-if="rejectedReasonLabel(k)">（{{ rejectedReasonLabel(k) }}）</span></span>
            <button
              class="shrink-0 border rounded px-2 py-0.5 text-xs"
              @click="unquarantineOne(k)"
            >
              解除此条
            </button>
          </li>
        </ul>
        <button
          class="mt-2 border rounded px-3 py-1.5 text-sm"
          @click="clearQuarantine"
        >
          解除隔离（下次同步会再次尝试上传）
        </button>
        <button
          v-if="rejectedNotice"
          class="ml-2 mt-2 border rounded px-3 py-1.5 text-sm"
          @click="dismissRejectedNotice"
        >
          我知道了
        </button>
      </div>
      <label class="mt-4 block text-sm">朗读偏好
        <select
          v-model="language"
          class="ml-2 border rounded bg-transparent p-2"
        >
          <option value="en-US">美式英语</option>
          <option value="en-GB">英式英语</option>
        </select></label>
      <p class="mt-2 text-xs text-gray-500">
        实际声音由浏览器和系统已安装的语音决定。
      </p>
    </section>
    <div
      class="border border-gray-200 rounded-xl bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      <h3 class="mb-1 font-bold dark:text-white">
        🤖 AI 批改
      </h3>
      <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
        填写后可在大小作文批改页使用 AI 批改。Key
        只保存在你本机浏览器，请求经你的 VPS
        中转（浏览器直连会被第三方接口拦截）。 注意：Key
        按浏览器全局共享、不按账号隔离，同一浏览器的各账号共用此 Key。
      </p>

      <label class="mb-4 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">API 地址</span>
        <input
          v-model="form.baseUrl"
          placeholder="https://api.deepseek.com/v1"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
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
            class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 pr-12 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
          <button
            class="absolute right-2 top-1/2 text-xs text-gray-400 -translate-y-1/2 hover:text-gray-600"
            @click="showKey = !showKey"
          >
            {{ showKey ? "隐藏" : "显示" }}
          </button>
        </div>
      </label>

      <label class="mb-6 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">模型</span>
        <input
          v-model="form.model"
          placeholder="deepseek-chat"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
      </label>

      <div class="flex flex-wrap items-center gap-3">
        <button
          class="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white dark:bg-blue-600 hover:bg-blue-800"
          @click="onSave"
        >
          保存
        </button>
        <button
          class="border border-gray-300 rounded-xl px-5 py-2.5 text-sm dark:border-gray-600 dark:text-white"
          :disabled="testing"
          @click="onTest"
        >
          {{ testing ? "测试中…" : "测试连接" }}
        </button>
        <span v-if="saved" class="text-sm text-green-600">已保存 ✓</span>
        <span
          v-if="testMsg"
          class="text-sm"
          :class="testOk ? 'text-green-600' : 'text-red-500'"
        >{{ testMsg }}</span>
      </div>
    </div>
  </div>
</template>

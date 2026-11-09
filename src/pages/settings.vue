<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useSync } from '../composables/useSync'
import {
  REJECTED_REASON_LABELS,
  clearQuarantinedKeys,
  getQuarantinedKeys,
  getRejectedReason,
  unquarantineKeys,
} from '../composables/syncClient'
import { decodeId, subscribeStorage } from '../utils/storage'
import {
  downloadStudyBackup,
  previewStudyBackup,
  restoreStudyBackup,
} from '../utils/backup'
import { pruneArchives } from '../utils/archives'
import { useDailyStudyGoal } from '../composables/useStudyTimer'
import { useGoBack } from '../composables/useGoBack'
import {
  AI_PROVIDERS,
  MODEL_STRENGTH_LABELS,
  aiSettingsState,
  detectAIProvider,
  getAISettings,
  getModelOption,
  getProviderForBaseUrl,
  modelSupportsReasoningEffort,
  reasoningEffortForProvider,
  saveAISettings,
  switchProviderSettings,
  testAIConnection,
} from '../composables/useAISettings'

const { currentUser } = useAuth()
const { rejectedNotice, dismissRejectedNotice, pushNow } = useSync()
// C-07：每日学习目标（分钟），按账号存、跨设备同步；输入即保存（15–480 分钟）。
const { minutes: goalMinutes, setMinutes: setGoalMinutes } = useDailyStudyGoal()
const goalMinutesInput = computed({
  get: () => goalMinutes.value,
  set: (v: number) => setGoalMinutes(v),
})
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
let backupSelection = 0
async function chooseBackup(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  backupSelection++
  importText.value = ''
  if (file.size > 30 * 1024 * 1024) {
    importMessage.value = '备份超过 30MB，请先拆分文件'
    return
  }
  const selection = ++backupSelection
  let text: string
  try {
    text = await file.text()
  }
  catch {
    if (selection === backupSelection)
      importMessage.value = '备份读取失败，请重新选择文件'
    return
  }
  if (selection !== backupSelection)
    return
  importText.value = text
  importMessage.value = importPreview.value
    ? ''
    : '备份格式无效，未写入任何数据'
}
function restoreBackup() {
  if (!importPreview.value)
    return
  const result = restoreStudyBackup(importPreview.value, currentUser.value)
  importMessage.value = `已合并 ${result.imported} 条；保留本机较新版本 ${result.keptNewer} 条；失败 ${result.failed} 条。`
  if (!result.failed)
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
const offQuarantine = subscribeStorage((key) => {
  if (!key || key.startsWith('myielts_sync_quarantined'))
    refreshQuarantined()
})
onUnmounted(offQuarantine)
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
let detectRevision = 0
const saved = ref(false)
const testing = ref(false)
const testMsg = ref('')
const testOk = ref(false)
const showKey = ref(false)
/** 当前地址对应的服务商（手动改过地址则为 null，即自定义）。 */
const selectedProvider = computed(() => getProviderForBaseUrl(form.value.baseUrl))
/** 当前服务商的模型列表（自定义地址时为空，只剩自定义模型输入框）。 */
const providerModels = computed(() => selectedProvider.value?.models ?? [])
/** 模型下拉框的值：当前模型在列表里就选它，否则走“自定义模型”。 */
const modelSelectValue = computed(() =>
  providerModels.value.some(m => m.id === form.value.model.trim())
    ? form.value.model.trim()
    : '__custom__',
)
/** 当前模型的强度信息（自定义模型没有）。 */
const modelOption = computed(() =>
  selectedProvider.value
    ? getModelOption(selectedProvider.value.id, form.value.model.trim())
    : null,
)
/** 推理强度选择只对支持 reasoning_effort 的模型显示（DeepSeek 全系、OpenAI o 系列）。 */
const showReasoningEffort = computed(() =>
  selectedProvider.value
    ? modelSupportsReasoningEffort(selectedProvider.value.id, form.value.model.trim())
    : false,
)
const reasoningEffortInput = computed({
  get: () => reasoningEffortForProvider(selectedProvider.value?.id ?? '', form.value.reasoningEffort),
  set: (value) => { form.value.reasoningEffort = value },
})
/** 点服务商预设：填地址；当前模型不在该服务商列表里时换成它的第一个模型；
 *  Key 也跟着换到该服务商存过的（没填过就是空），当前 Key 先存回旧服务商名下。 */
function selectProvider(provider: (typeof AI_PROVIDERS)[number]) {
  form.value = switchProviderSettings(form.value, provider)
}
function onModelSelect(value: string) {
  if (value === '__custom__')
    return
  form.value.model = value
}

function onSave() {
  detectRevision++
  saveAISettings({
    baseUrl: form.value.baseUrl.trim(),
    apiKey: form.value.apiKey.trim(),
    model: form.value.model.trim(),
    reasoningEffort: form.value.reasoningEffort ?? 'medium',
    apiKeys: form.value.apiKeys,
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
const detecting = ref(false)
const detectMsg = ref('')
const detectOk = ref(false)
watch([() => form.value.apiKey, () => form.value.baseUrl, () => form.value.model, currentUser], () => {
  detectRevision++
  detectMsg.value = ''
}, { flush: 'sync' })
onUnmounted(() => {
  detectRevision++
})

/** 只填 Key 自动识别：后端真去试这个 Key 属于哪家，命中后自动填地址、设该家默认模型。 */
async function onDetect() {
  const key = form.value.apiKey.trim()
  if (detecting.value || !key)
    return
  const revision = detectRevision
  detecting.value = true
  detectMsg.value = ''
  try {
    const result = await detectAIProvider(key)
    if (revision !== detectRevision)
      return
    const provider = AI_PROVIDERS.find(p => p.id === result.provider)
    form.value.baseUrl = result.baseUrl
    if (provider) {
      form.value.model = provider.models[0].id
      // 刚识别出的 Key 就属于这家，记到它名下（切换回来还能看到）
      form.value.apiKeys = { ...(form.value.apiKeys ?? {}), [provider.id]: key }
    }
    detectMsg.value = `已识别为 ${result.label}，模型已设为 ${provider?.models[0].label ?? form.value.model}，点“保存”即可用`
    detectOk.value = true
  }
  catch (e) {
    if (revision !== detectRevision)
      return
    detectMsg.value = e instanceof Error ? e.message : '识别失败'
    detectOk.value = false
  }
  finally {
    detecting.value = false
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
        Key。AI评分存档：新版写作保留最近30份、不超过1 MiB；口语与旧版作文评分永久保留，可手动清理。导出后可清理旧存档。
      </p>
      <button class="mr-3 border rounded px-3 py-2 text-sm" @click="backup">
        导出学习备份
      </button>
      <button class="border rounded px-3 py-2 text-sm" @click="cleanupArchives">
        整理旧评分存档
      </button>
      <label class="mt-4 block text-sm">每日学习目标
        <input
          v-model.number="goalMinutesInput"
          type="number"
          min="15"
          max="480"
          step="5"
          class="ml-2 w-20 border rounded bg-transparent p-2"
        >
        分钟
      </label>
      <p class="mt-2 text-xs text-gray-500">
        各页计时进度按此目标计算（15–480 分钟，默认 120 分钟），改完立即生效并同步到其他设备。
      </p>
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
        🤖 AI 批改 / 口语评分
      </h3>
      <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
        只填自己的 Key、点“自动识别服务商”，地址和模型会自动填好；也可以手动选服务商、挑模型。
        可用于大小作文批改、口语转写评分和每日阅读翻译。
        三项都要填齐（API 地址、密钥、模型）才会启用；未配置时口语页会提示并提供本地 4 项自评清单。
        Key 只保存在本机浏览器，请求经 VPS 中转（浏览器直连第三方会被 CORS 拦截）。
        注意：每个服务商各记一个 Key，切换服务商时密钥框跟着换（没填过就是空）；Key 不按账号隔离，同一浏览器的各账号共用此 Key；评分存档仍按账号隔离。
      </p>

      <div class="mb-4">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">服务商</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in AI_PROVIDERS"
            :key="p.id"
            type="button"
            class="border rounded-lg px-3 py-1.5 text-sm"
            :class="selectedProvider?.id === p.id
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-600 dark:text-white'"
            @click="selectProvider(p)"
          >
            {{ p.label }}
          </button>
          <span
            v-if="!selectedProvider"
            class="self-center text-xs text-gray-400"
          >自定义地址</span>
        </div>
      </div>

      <label class="mb-4 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">API 地址</span>
        <input
          v-model="form.baseUrl"
          placeholder="https://api-cdn.thehive.ai/api/v3"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
        <span class="mt-1 block text-xs text-gray-400">地址不带 /chat/completions；中转只允许 Hive、OpenAI、DeepSeek 官方三个域名<span v-if="selectedProvider">；{{ selectedProvider.label }} 的 Key 去 {{ selectedProvider.keyHint }} 拿</span></span>
      </label>

      <label class="mb-4 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">API 密钥</span>
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

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="detecting || !form.apiKey.trim()"
          @click="onDetect"
        >
          {{ detecting ? "识别中…" : "🔍 自动识别服务商" }}
        </button>
        <span
          v-if="detectMsg"
          class="text-sm"
          :class="detectOk ? 'text-green-600' : 'text-red-500'"
        >{{ detectMsg }}</span>
      </div>

      <div class="mb-4">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">模型</span>
        <select
          v-if="providerModels.length"
          :value="modelSelectValue"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          @change="onModelSelect(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="m in providerModels"
            :key="m.id"
            :value="m.id"
          >
            {{ m.label }}（{{ MODEL_STRENGTH_LABELS[m.strength] }}）
          </option>
          <option value="__custom__">
            自定义模型…
          </option>
        </select>
        <input
          v-if="modelSelectValue === '__custom__'"
          v-model="form.model"
          placeholder="输入模型名，如 deepseek-v4-flash"
          class="mt-2 w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
        <p v-if="modelOption" class="mt-1 text-xs text-gray-400">
          强度：{{ MODEL_STRENGTH_LABELS[modelOption.strength] }}——{{ modelOption.note }}
        </p>
        <p v-else class="mt-1 text-xs text-gray-400">
          自定义模型：强度未知，保存后点“测试连接”验证能不能用。
        </p>
      </div>

      <label v-if="showReasoningEffort" class="mb-6 block">
        <span class="mb-1 block text-sm font-medium dark:text-gray-200">推理强度</span>
        <select
          v-model="reasoningEffortInput"
          class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="low">低——想得少，回答快</option>
          <template v-if="selectedProvider?.id === 'deepseek'">
            <option value="high">高——默认</option>
            <option value="max">最高——耗时更长</option>
          </template>
          <template v-else>
            <option value="medium">中——默认，均衡</option>
            <option value="high">高——想得多，批改更细，慢一点</option>
          </template>
        </select>
        <span class="mt-1 block text-xs text-gray-400">当前模型支持调推理强度；换到不支持的模型时这项会被忽略。</span>
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

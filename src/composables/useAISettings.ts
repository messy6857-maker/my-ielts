import { ref } from 'vue'
import { SYNC_API_BASE } from '../sync-config'
import { extractJson } from '../utils/text'
import { getToken } from './syncClient'
import { useAuth } from './useAuth'

// AI 批改设置：存在浏览器 localStorage，按账号分开保存（游客单独一份），不参与同步和备份
export interface AISettings {
  baseUrl: string // 如 https://api-cdn.thehive.ai/api/v3（不带 /chat/completions）
  apiKey: string
  model: string // 如 deepseek-ai/deepseek-v4.1-flash-1017
  /** 推理强度（低/中/高）：仅 DeepSeek 与 OpenAI 推理模型有效，其余模型忽略 */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max'
  /** 各服务商的 Key（按服务商 id 存）：切换服务商时密钥框跟着换，没填过就是空 */
  apiKeys?: Record<string, string>
}
/**
 * 旧版全局 key（所有账号共用）。旧数据里没有“属于谁”的信息，所以不会自动归给任何人：
 * 设置页提示当前用户认领（复制到自己名下并删除旧数据）或直接删除。
 */
const LEGACY_KEY = 'myielts_ai_settings_v1'
/** 按账号的 key。故意不用 accountKey 的 myielts_u_ 前缀，确保永远不会被当成学习数据同步或导出备份 */
export function aiSettingsKey(user: string | null): string {
  return user
    ? `${LEGACY_KEY}:u:${user}`
    : `${LEGACY_KEY}:guest`
}
function currentKey(): string {
  return aiSettingsKey(useAuth().currentUser.value)
}
function readLegacyRaw(): string | null {
  try {
    return localStorage.getItem(LEGACY_KEY)
  }
  catch {
    return null
  }
}
/** 旧版共用设置的概况（只给出 Key 末 4 位，帮用户认出是不是自己的）；没有或读不出时返回 null */
export function legacyAISettingsInfo(): { keyTail: string, baseUrl: string } | null {
  const raw = readLegacyRaw()
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw) as Partial<AISettings>
    const keys = [
      typeof parsed.apiKey === 'string'
        ? parsed.apiKey
        : '',
      ...Object.values(parsed.apiKeys ?? {}),
    ].map(k => String(k).trim()).filter(Boolean)
    if (!keys.length)
      return null
    return {
      keyTail: keys[0].slice(-4),
      baseUrl: typeof parsed.baseUrl === 'string'
        ? parsed.baseUrl
        : '',
    }
  }
  catch {
    return null
  }
}
/** 删除旧版共用设置（不是自己的，或不再需要） */
export function discardLegacyAISettings(): void {
  try {
    localStorage.removeItem(LEGACY_KEY)
  }
  catch {
    /* 忽略 */
  }
}
const DEFAULTS: AISettings = {
  baseUrl: 'https://api-cdn.thehive.ai/api/v3',
  apiKey: '',
  model: 'deepseek-ai/deepseek-v4.1-flash-1017',
  reasoningEffort: 'medium',
}
/** 模型强度档位：选模型时直接看得出它多强、适合干什么 */
export type ModelStrength = 'flagship' | 'strong' | 'balanced' | 'light' | 'reasoning'
export const MODEL_STRENGTH_LABELS: Record<ModelStrength, string> = {
  flagship: '旗舰最强',
  strong: '强',
  balanced: '均衡',
  light: '轻量快速',
  reasoning: '推理最强',
}
export interface AIModelOption {
  id: string
  label: string
  strength: ModelStrength
  /** 强度说明 */
  note: string
  /** 推理模型（OpenAI o 系列）不接受 temperature，后端转发时不带该参数 */
  reasoning?: boolean
}
export interface AIProvider {
  id: string
  label: string
  baseUrl: string
  /** 去哪里拿 Key */
  keyHint: string
  models: AIModelOption[]
}
/** 服务商预设：地址与模型都按官方文档取（DeepSeek 官方地址不带 /v1，后端统一拼 /chat/completions）。 */
export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'hive',
    label: 'Hive',
    baseUrl: 'https://api-cdn.thehive.ai/api/v3',
    keyHint: 'Hive 控制台',
    models: [
      {
        id: 'deepseek-ai/deepseek-v4.1-flash-1017',
        label: 'DeepSeek V4.1 Flash',
        strength: 'balanced',
        note: '当前默认：快速、便宜，批改和翻译都够用',
      },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'platform.openai.com → API Keys',
    models: [
      {
        id: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        strength: 'strong',
        note: '最新主力，接近旗舰水平，性价比最高；不接受 temperature',
        reasoning: true,
      },
      {
        id: 'gpt-6-astra',
        label: 'GPT-6 Astra',
        strength: 'flagship',
        note: '旗舰最强，难题和深度批改用，价格最高；不接受 temperature',
        reasoning: true,
      },
      {
        id: 'gpt-6.1-terra',
        label: 'GPT-6.1 Terra',
        strength: 'balanced',
        note: '快速均衡，日常够用；不接受 temperature',
        reasoning: true,
      },
      {
        id: 'gpt-6-luna',
        label: 'GPT-6 Luna',
        strength: 'light',
        note: '最便宜，适合翻译等简单任务；不接受 temperature',
        reasoning: true,
      },
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o mini',
        strength: 'light',
        note: '便宜老款，兼容性最好（自动识别的探测模型）',
      },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    keyHint: 'platform.deepseek.com → API Keys',
    models: [
      {
        id: 'deepseek-flash',
        label: 'DeepSeek Flash',
        strength: 'balanced',
        note: '快速、便宜，批改和翻译都够用（V4.1 Flash）',
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        strength: 'flagship',
        note: '旗舰最强，精细批改和难题用',
      },
    ],
  },
]
/** 根据 API 地址推断服务商（地址被手动改过就归为自定义，返回 null）。 */
export function getProviderForBaseUrl(baseUrl: string): AIProvider | null {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  return AI_PROVIDERS.find(p => p.baseUrl.toLowerCase() === normalized) ?? null
}
/** 根据 API 地址取服务商 id（不在三家预设里的地址归为 'custom'；只用于判断服务商能力，Key 槽位见 keySlotForBaseUrl）。 */
export function getProviderIdForBaseUrl(baseUrl: string): string {
  return getProviderForBaseUrl(baseUrl)?.id ?? 'custom'
}
/** 规范化 API 地址：协议和域名小写，去掉查询串、锚点和末尾的斜杠（路径大小写保留） */
export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  try {
    const url = new URL(trimmed)
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  }
  catch {
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}
/** 旧版所有自定义地址共用的 Key 槽位 */
const SHARED_CUSTOM_SLOT = 'custom'
/**
 * Key 存放的槽位：三家预设用服务商 id；自定义地址按规范化后的地址各占一个槽（custom:<地址>），
 * 不同的自定义地址不会再共用同一个 Key。
 */
export function keySlotForBaseUrl(baseUrl: string): string {
  const preset = getProviderForBaseUrl(baseUrl)
  if (preset)
    return preset.id
  return baseUrl.trim()
    ? `${SHARED_CUSTOM_SLOT}:${normalizeBaseUrl(baseUrl)}`
    : SHARED_CUSTOM_SLOT
}
/**
 * 一份设置的 Key 表（槽位 → Key）。只有设置里的 apiKey 能确认属于它的 baseUrl，记到该地址的槽位；
 * 旧版所有自定义地址共用的 custom 槽说不清是哪个地址的，原样留着，不绑定到任何地址、也不会被使用。
 * 槽位里用户明确保存的空值保留（apiKey 为空时不改它）。
 */
function boundApiKeys(settings: Partial<AISettings>): Record<string, string> {
  const keys: Record<string, string> = {}
  for (const [slot, key] of Object.entries(settings.apiKeys ?? {})) {
    if (typeof key === 'string')
      keys[slot] = key
  }
  const baseUrl = typeof settings.baseUrl === 'string'
    ? settings.baseUrl
    : ''
  const slot = keySlotForBaseUrl(baseUrl)
  if (slot !== SHARED_CUSTOM_SLOT && typeof settings.apiKey === 'string' && settings.apiKey.trim())
    keys[slot] = settings.apiKey.trim()
  return keys
}
/** 某槽位存的 Key；没绑定地址的旧 custom 槽永远不拿来用 */
function keyForSlot(apiKeys: Record<string, string> | undefined, slot: string): string {
  if (slot === SHARED_CUSTOM_SLOT)
    return ''
  return apiKeys?.[slot] ?? ''
}
/**
 * API 地址变了（点服务商预设、手动改地址都走这里）：表单里的 Key 先存回原地址的槽位，
 * 再换成新地址存过的 Key，没有就清空——Key 不会跟着跑到别的地址上去测试或保存。
 * 原地址是还没保存过的自定义地址（比如正在逐字输入的半截地址）时不存回，免得留下一堆无用槽位。
 */
export function rebindKeyForBaseUrl(current: AISettings, previousBaseUrl: string): AISettings {
  const oldSlot = keySlotForBaseUrl(previousBaseUrl)
  const newSlot = keySlotForBaseUrl(current.baseUrl)
  if (oldSlot === newSlot)
    return current
  const apiKeys = {
    ...(current.apiKeys ?? {}),
  }
  const isPreset = AI_PROVIDERS.some(p => p.id === oldSlot)
  if (oldSlot !== SHARED_CUSTOM_SLOT && (isPreset || oldSlot in apiKeys))
    apiKeys[oldSlot] = current.apiKey.trim()
  return {
    ...current,
    apiKeys,
    apiKey: keyForSlot(apiKeys, newSlot),
  }
}
/**
 * 切服务商：先把当前 Key 存到旧服务商名下，再把新服务商存过的 Key（没填过就是空）取出来；
 *  当前模型在新服务商列表里就保留，否则换成它的第一个模型。
 */
export function switchProviderSettings(current: AISettings, provider: AIProvider): AISettings {
  return {
    ...rebindKeyForBaseUrl({ ...current, baseUrl: provider.baseUrl }, current.baseUrl),
    model: provider.models.some(m => m.id === current.model.trim())
      ? current.model.trim()
      : provider.models[0].id,
  }
}
/** 找到某个服务商下某个模型的档位信息（自定义模型返回 null）。 */
export function getModelOption(providerId: string, modelId: string): AIModelOption | null {
  const provider = AI_PROVIDERS.find(p => p.id === providerId)
  return provider?.models.find(m => m.id === modelId) ?? null
}
/** 该模型是否支持推理强度（reasoning_effort）：DeepSeek 全系 + OpenAI 推理模型（o 系列、GPT-5/6）。 */
export function modelSupportsReasoningEffort(providerId: string, modelId: string): boolean {
  if (providerId === 'deepseek')
    return true
  if (providerId === 'openai')
    return /^(?:o\d|gpt-[56](?:[.-]|$))/.test(modelId) && !modelId.includes('-chat-')
  return false
}
export function reasoningEffortForProvider(providerId: string, effort: AISettings['reasoningEffort']) {
  if (providerId === 'deepseek') {
    return effort === 'low' || effort === 'max'
      ? effort
      : 'high'
  }
  return effort === 'low' || effort === 'high'
    ? effort
    : effort === 'max'
      ? 'high'
      : 'medium'
}

function parseStoredSettings(raw: string | null): Partial<AISettings> | null {
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Partial<AISettings>
      : null
  }
  catch {
    return null
  }
}
function readCurrentRaw(): string | null {
  try {
    return localStorage.getItem(currentKey())
  }
  catch {
    return null
  }
}
/** 一份设置里各服务商的 Key（apiKeys 加上当前选中服务商的 apiKey） */
function keysOfSettings(settings: Partial<AISettings>): Record<string, string> {
  const keys: Record<string, string> = {}
  for (const [slot, key] of Object.entries(boundApiKeys(settings))) {
    if (key.trim())
      keys[slot] = key.trim()
  }
  return keys
}
export interface LegacyClaimConflict {
  /** Key 槽位（服务商 id，或 custom:<规范化地址>） */
  provider: string
  label: string
  /** 旧设置里这一槽的 Key 末 4 位 */
  legacyTail: string
  /** 当前身份这一槽的 Key 末 4 位 */
  currentTail: string
  /** 弹窗打开时两边的完整 Key：保存前核对冲突没有变化（不显示给用户） */
  legacyKey: string
  currentKey: string
}
function slotLabel(slot: string): string {
  if (slot.startsWith(`${SHARED_CUSTOM_SLOT}:`))
    return `自定义地址 ${slot.slice(SHARED_CUSTOM_SLOT.length + 1)}`
  return AI_PROVIDERS.find(p => p.id === slot)?.label ?? slot
}
function computeClaimConflicts(legacy: Partial<AISettings>, current: Partial<AISettings> | null): LegacyClaimConflict[] {
  if (!current)
    return []
  const legacyKeys = keysOfSettings(legacy)
  const currentKeys = keysOfSettings(current)
  return Object.keys(legacyKeys)
    // 没绑定地址的旧 custom 槽不会被任何地址使用，不算冲突（合并时保留当前的）
    .filter(slot => slot !== SHARED_CUSTOM_SLOT && currentKeys[slot] && currentKeys[slot] !== legacyKeys[slot])
    .map(slot => ({
      provider: slot,
      label: slotLabel(slot),
      legacyTail: legacyKeys[slot].slice(-4),
      currentTail: currentKeys[slot].slice(-4),
      legacyKey: legacyKeys[slot],
      currentKey: currentKeys[slot],
    }))
}
/** 认领旧设置时，同一槽位两边各有一个不同 Key 的冲突列表（没有冲突时为空） */
export function legacyClaimConflicts(): LegacyClaimConflict[] {
  const legacy = parseStoredSettings(readLegacyRaw())
  if (!legacy)
    return []
  return computeClaimConflicts(legacy, parseStoredSettings(readCurrentRaw()))
}
/** claimed：已认领；changed：冲突和弹窗里给用户看的不一样了，什么都没改，需要重新确认；failed：旧设置不存在或保存失败 */
export type LegacyClaimResult = 'claimed' | 'changed' | 'failed'
/**
 * 把旧版共用设置认领到当前身份名下，成功后删除旧数据。
 * 与当前身份已有的设置合并，Key 始终跟着自己的地址（槽位）：各槽位的 Key 都保留；
 * 同一槽位两边 Key 不同时，只按用户在弹窗里对“这些冲突”做的选择处理（decisions，默认保留当前的）。
 * 保存前重新计算冲突，必须和弹窗里给用户看的 shown 完全一致（同样的槽位、同样的两个 Key），
 * 否则返回 changed 不做任何修改——期间其他页签新存的 Key 不会被没确认过的选择覆盖。
 * 当前身份已经配好（地址、模型、该地址的 Key 齐全）就沿用它选中的地址和模型，否则用旧设置里选中的。
 */
export function claimLegacyAISettings(
  decisions: Record<string, 'legacy' | 'current'> = {},
  shown: LegacyClaimConflict[] = [],
): LegacyClaimResult {
  const legacy = parseStoredSettings(readLegacyRaw())
  if (!legacy || !legacyAISettingsInfo())
    return 'failed'
  const current = parseStoredSettings(readCurrentRaw())
  const conflicts = computeClaimConflicts(legacy, current)
  const unchanged = conflicts.length === shown.length
    && conflicts.every(c => shown.some(s => s.provider === c.provider
      && s.legacyKey === c.legacyKey
      && s.currentKey === c.currentKey))
  if (!unchanged)
    return 'changed'
  const legacyKeys = keysOfSettings(legacy)
  const currentKeys = current
    ? keysOfSettings(current)
    : {}
  // 当前身份明确存的空值（旧设置这一槽也没有 Key 时）原样保留，不因认领被删掉
  const apiKeys: Record<string, string> = {
    ...(current
      ? boundApiKeys(current)
      : {}),
    ...legacyKeys,
    ...currentKeys,
  }
  for (const c of conflicts) {
    if (decisions[c.provider] === 'legacy')
      apiKeys[c.provider] = c.legacyKey
  }
  const currentConfigured = !!current
    && typeof current.baseUrl === 'string' && !!current.baseUrl.trim()
    && typeof current.model === 'string' && !!current.model.trim()
    && !!keyForSlot(currentKeys, keySlotForBaseUrl(current.baseUrl))
  const chosen: Partial<AISettings> = currentConfigured
    ? current!
    : legacy
  const merged: AISettings = {
    ...DEFAULTS,
    ...chosen,
    apiKeys,
  }
  merged.apiKey = keyForSlot(apiKeys, keySlotForBaseUrl(merged.baseUrl))
  try {
    localStorage.setItem(currentKey(), JSON.stringify(merged))
    localStorage.removeItem(LEGACY_KEY)
    return 'claimed'
  }
  catch {
    return 'failed'
  }
}
export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(currentKey())
    if (raw) {
      const parsed: AISettings = {
        ...DEFAULTS,
        ...JSON.parse(raw),
      }
      // 兼容旧版：没有分服务商的 map 时把现有 Key 记到当前槽位；旧的共用 custom 槽绑定到当前自定义地址
      if (parsed.apiKeys || parsed.apiKey.trim())
        parsed.apiKeys = boundApiKeys(parsed)
      return parsed
    }
  }
  catch {
    /* 忽略 */
  }
  return { ...DEFAULTS }
}
export function saveAISettings(s: AISettings) {
  // 保存时把当前 Key 写回当前服务商名下（切换服务商时取的就是这里）
  const apiKeys = {
    ...(s.apiKeys ?? {}),
  }
  const slot = keySlotForBaseUrl(s.baseUrl)
  if (slot !== SHARED_CUSTOM_SLOT)
    apiKeys[slot] = s.apiKey.trim()
  localStorage.setItem(currentKey(), JSON.stringify({ ...s, apiKeys }))
}
export function hasAISettings(): boolean {
  const s = getAISettings()
  return !!(s.apiKey.trim() && s.baseUrl.trim() && s.model.trim())
}
// ---------- AI 批改调用（OpenAI 兼容接口） ----------
export interface AICorrection {
  original: string
  fixed: string
  reason: string
}
export interface AIGradeResult {
  scores: {
    ta: number
    cc: number
    lr: number
    gra: number
    overall: number
  }
  comments: {
    ta: string
    cc: string
    lr: string
    gra: string
  }
  corrections: AICorrection[]
  suggestion: string
  /** 四项标准各自的详细修改建议（新版才有，老存档可能缺失） */
  advice?: {
    ta: string
    cc: string
    lr: string
    gra: string
  }
  /** 改写后的文章全文（新版才有） */
  rewritten?: string
}
async function callChatApi(
  settings: AISettings,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  // 走 VPS 中转：浏览器直连第三方 API 会被 CORS 拦截
  const token = getToken(useAuth().currentUser.value)
  if (!token)
    throw new Error('请先登录（AI 中转需要登录态）')
  const timeout = new AbortController()
  const abort = () => timeout.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted)
    timeout.abort()
  const timeoutId = setTimeout(abort, 120000)
  let res: Response
  let body: any
  try {
    res = await fetch(`${SYNC_API_BASE}/ai/chat`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        baseUrl: settings.baseUrl.trim(),
        apiKey: settings.apiKey.trim(),
        model: settings.model.trim(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        reasoningEffort: reasoningEffortForProvider(getProviderIdForBaseUrl(settings.baseUrl), settings.reasoningEffort),
      }),
    })
    body = await res.json().catch(() => null)
  }
  catch {
    throw new Error(
      signal?.aborted
        ? '已取消评分'
        : timeout.signal.aborted
          ? '评分请求超时，请重试'
          : '中转请求失败，请检查网络连接',
    )
  }
  finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abort)
  }
  // 401 可能是登录过期，也可能是用户的 API Key 无效（后端透传 Hive 的 401）
  // 后端 auth 中间件返回的 message 是"登录已过期"，透传的是"AI 接口返回 401"
  if (res.status === 401) {
    const msg = body?.message || ''
    if (msg.includes('AI 接口返回'))
      throw new Error('API Key 无效或已过期，请去设置页检查 Key 是否正确')
    throw new Error('登录已过期，请重新登录')
  }
  if (res.status === 403)
    throw new Error(body?.message || '无权限使用 AI 功能')
  if (!res.ok || !body?.ok)
    throw new Error(body?.message || `请求失败（${res.status}）`)
  const content = body.data?.choices?.[0]?.message?.content
  if (!content)
    throw new Error('AI 返回为空，请重试')
  return content
}
// 官方评分标准（IELTS Writing Band Descriptors, May 2023 更新版）condensed
const TASK1_DESCRIPTORS = `【Task Achievement】
9分: 任务所有要求得到充分恰当的满足；内容上可能有极罕见的疏漏。
8分: 覆盖任务所有要求，恰当、相关、充分；关键特征选取巧妙，呈现清晰、突出、有例证；偶有遗漏。
7分: 覆盖任务要求，内容相关准确，偶有遗漏；有清晰的overview，数据分类恰当，识别主要趋势/差异；例证可更充分。
6分: 紧扣任务要求，格式恰当；关键特征得到覆盖和充分强调；尝试给出相关概述；用数据支撑；细节处可能有不相关/不准确信息，部分细节缺失或冗余。
5分: 大体回应任务要求；关键特征覆盖不足；细节复述偏机械；可能缺乏数据支撑；倾向堆砌细节而无全局观。
【Coherence and Cohesion】
9分: 行文毫不费力；衔接自然到几乎不被注意；段落划分娴熟。
8分: 行文流畅；信息逻辑排序，衔接处理好；偶有小问题；段落使用充分恰当。
7分: 逻辑组织清晰，通篇推进明确；衔接手段（含指代、替代）多样但有小错误或过度/不足。
6分: 大体连贯，有整体推进；衔接手段有效果但句内/句间衔接可能因误用、过度、缺失而显机械。
5分: 有组织但逻辑不完全，缺乏整体推进；句子连接不流畅；衔接手段有限/过度且有错误。
【Lexical Resource】
9分: 词汇运用充分灵活精准；搭配非常自然老道；拼写/构词错误极罕见。
8分: 词汇资源宽广，运用流畅灵活；能巧妙使用非常见/习语表达，偶有选词搭配小错。
7分: 词汇足以支撑灵活精准；能用一些非常见/习语表达；有搭配意识但有不当；偶错不影响理解。
6分: 词汇大体够用；意义清楚但范围受限、选词欠精准；有一些拼写/构词错误。
5分: 词汇有限但勉强够用；简单词可用但变化少；选词常不当；错误明显或造成阅读困难。
【Grammatical Range and Accuracy】
9分: 句式范围广，运用充分灵活；标点语法全程恰当；错误极罕见。
8分: 句式范围广，灵活准确；多数句子无错；标点好；偶有零散错误。
7分: 复杂句式多样，有一定灵活准确度；无错句常见；个别错误不影响理解。
6分: 简单复杂句混用但灵活性有限；复杂句准确度不如简单句；有错但少影响理解。
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`
const TASK2_DESCRIPTORS = `【Task Response】
9分: 切题深入；立场清晰完整，直接回应问题；观点相关、充分展开、有力支撑。
8分: 切题充分；立场清晰且展开好；观点相关、展开充分、有支撑；偶有遗漏。
7分: 回应题目主要部分；立场清晰且有展开；主要观点有扩展支撑，但可能过度概括或支撑欠聚焦。
6分: 回应主要部分（详略不一）；立场与题目直接相关，但结论可能不清/无据/重复；观点展开不足。
5分: 回应不完整；有立场但展开不清；主要观点有限、展开不足，可能有无关细节。
【Coherence and Cohesion】
9分: 行文毫不费力；衔接自然到几乎不被注意；段落划分娴熟。
8分: 行文流畅；信息逻辑排序，衔接处理好；偶有小问题；段落使用充分恰当。
7分: 逻辑组织清晰，通篇推进明确；衔接手段多样但有小错误或过度/不足；段落总体有效。
6分: 大体连贯，有整体推进；衔接手段有效果但可能机械；段落未必合乎逻辑。
5分: 有组织但逻辑不完全；句子连接不流畅；衔接手段有限/过度且有错误；段落可能缺失。
【Lexical Resource】
9分: 词汇运用充分灵活精准；搭配非常自然老道；拼写/构词错误极罕见。
8分: 词汇资源宽广，运用流畅灵活；能巧妙使用非常见/习语表达，偶有选词搭配小错。
7分: 词汇足以支撑灵活精准；能用一些非常见/习语表达；有搭配意识但有不当；偶错不影响理解。
6分: 词汇大体够用；意义清楚但范围受限、选词欠精准；有一些拼写/构词错误。
5分: 词汇有限但勉强够用；简单词可用但变化少；选词常不当；错误明显或造成阅读困难。
【Grammatical Range and Accuracy】
9分: 句式范围广，运用充分灵活；标点语法全程恰当；错误极罕见。
8分: 句式范围广，灵活准确；多数句子无错；标点好；偶有零散错误。
7分: 复杂句式多样，有一定灵活准确度；无错句常见；个别错误不影响理解。
6分: 简单复杂句混用但灵活性有限；复杂句准确度不如简单句；有错但少影响理解。
5分: 句式有限重复；复杂句多有错误；简单句最准；语法错误多。`
function buildPrompt(
  taskLabel: string,
  criterion1: string,
  question: string,
  essay: string,
): {
  system: string
  user: string
} {
  const descriptors
    = taskLabel === 'Task 1'
      ? TASK1_DESCRIPTORS
      : TASK2_DESCRIPTORS
  const c1name
    = taskLabel === 'Task 1'
      ? '任务完成情况(Task Achievement)'
      : '任务回应(Task Response)'
  const system = `你是雅思写作${taskLabel}考官，必须严格依据以下官方评分标准（IELTS Writing Band Descriptors，May 2023 版）打分：

${descriptors}

打分规则：每项按0.5分制（4.0-9.0）；作文必须完全符合某档的正面特征才能得该档，负面特征会拉低分数。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "${criterion1}": 6.5, "cc": 6.0, "lr": 6.5, "gra": 6.0, "overall": 6.5},
"comments": { "${criterion1}": "先说依据官方标准的哪条给分，再给1-2句下一步建议", "cc": "...", "lr": "...", "gra": "..."},
"corrections": [ { "original": "原文句子", "fixed": "修改后的句子", "reason": "中文说明，指出违反了哪项标准"}],
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）",
"advice": {
"${criterion1}": "针对${c1name}的详细修改建议（中文，3-5句，具体指出哪里没做好、应该怎么改，最好给1个改写示例）",
"cc": "针对连贯与衔接的详细修改建议（同上）",
"lr": "针对词汇资源的详细修改建议（同上，给出可替换的高级表达）",
"gra": "针对语法的详细修改建议（同上，指出典型句式问题）"
},
"rewritten": "把整篇文章按你的建议改写一遍（英文全文，保持原意和段落结构，应用所有改进；不要加中文）"
}
其中 ${criterion1} 对应${c1name}，cc=连贯与衔接，lr=词汇资源，gra=语法多样性与准确性。corrections 挑 3-6 个最值得改的句子。全部用中文（original/fixed/rewritten 保留英文原文）。`
  const user = `【题目】\n${question}\n\n【考生作文】\n${essay}`
  return { system, user }
}
export async function gradeEssayWithAI(
  task: 'task1' | 'task2',
  question: string,
  essay: string,
  signal?: AbortSignal,
): Promise<AIGradeResult> {
  const settings = getAISettings()
  if (!hasAISettings())
    throw new Error('请先在设置页填写 API 地址、Key 和模型')
  const words = essay.trim().split(/\s+/).filter(Boolean).length
  if (words < 20)
    throw new Error('作文太短，无法批改')
  const { system, user }
    = task === 'task1'
      ? buildPrompt('Task 1', 'ta', question, essay)
      : buildPrompt('Task 2', 'tr', question, essay)
  const raw = await callChatApi(settings, system, user, signal)
  let parsed: AIGradeResult
  try {
    parsed = JSON.parse(extractJson(raw))
  }
  catch {
    throw new Error('AI 返回格式异常，请重试')
  }
  // 入口校验：四项分数/四项点评/逐句修改/总建议齐全才放行（口语侧同款严格程度）；
  // 只验 overall 会让缺字段结果入库，随后在恢复或渲染时崩溃
  if (!isValidEssayGrade(parsed, task))
    throw new Error('AI 返回格式异常，请重试')
  // Task 2 第一项 key 为 tr，归一化为 ta，方便面板统一渲染
  if (task === 'task2')
    normalizeTask2Grade(parsed)
  return parsed
}
/**
 * Task 2 首项 key 归一化：模型按 prompt 用 tr，面板统一按 ta 取值。
 *  scores/comments/advice 三处都要归一化，否则建议区首项会空白；
 *  新批改与老存档恢复共用此函数。
 */
export function normalizeTask2Grade(parsed: AIGradeResult): AIGradeResult {
  // 老存档可能缺 comments：先判空再读 tr，否则 Cannot read properties 会抛给用户
  const s = parsed.scores as unknown as Record<string, number> | undefined
  const c = parsed.comments as unknown as Record<string, string> | undefined
  const a = parsed.advice as unknown as Record<string, string> | undefined
  if (s && s.tr !== undefined && s.ta === undefined) {
    s.ta = s.tr
    delete s.tr
  }
  if (c && c.tr !== undefined && c.ta === undefined) {
    c.ta = c.tr
    delete c.tr
  }
  if (a && a.tr !== undefined && a.ta === undefined) {
    a.ta = a.tr
    delete a.tr
  }
  return parsed
}
const ESSAY_CRITERIA = ['ta', 'cc', 'lr', 'gra'] as const
/** 0.5 分制取整：6.25 → 6.5、6.75 → 7.0（overall 与均值不一致时重算用）。 */
export function roundHalf(v: number): number {
  return Math.round(v * 2) / 2
}
/** 四项均值（Task 2 首项接受 tr 或 ta）。 */
function essayMean(s: Record<string, unknown>, task: 'task1' | 'task2'): number {
  const first = task === 'task2'
    ? (s.ta ?? s.tr)
    : s.ta
  return (
    (first as number) + (s.cc as number) + (s.lr as number) + (s.gra as number)
  ) / 4
}
/**
 * 雅思 band 量表分数：有限数字且在 [0, 9] 内。prompt 写 4.0-9.0，但不收紧到 4-9，
 *  模型可能给 4 分以下；12、0 以下、负数、NaN 之类的一律不算合法分数。
 */
export function isBandScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9
}
/**
 * 逐句修改元素校验：非 null 对象，original/fixed 必须为字符串，
 *  reason 若存在必须为字符串（缺失允许，面板渲染为空）。
 */
function isValidCorrection(c: unknown): c is AICorrection {
  if (!c || typeof c !== 'object')
    return false
  const o = c as Partial<AICorrection>
  if (typeof o.original !== 'string' || typeof o.fixed !== 'string')
    return false
  if (o.reason !== undefined && typeof o.reason !== 'string')
    return false
  return true
}
/**
 * 写作新批改入口校验：四项分数与 overall 须为 [0, 9] 内有限数字、四项点评须为字符串、
 *  corrections 须为数组且每个元素结构合法、suggestion 须为字符串、rewritten 若存在须为字符串；
 *  Task 2 首项接受 tr 或 ta；overall 与四项均值差 ≥ 1.0 时判格式异常（面板不展示自相矛盾的总分）。
 */
export function isValidEssayGrade(
  parsed: unknown,
  task: 'task1' | 'task2',
): parsed is AIGradeResult {
  if (!parsed || typeof parsed !== 'object')
    return false
  const p = parsed as Partial<AIGradeResult> & {
    scores?: Record<string, unknown>
    comments?: Record<string, unknown>
  }
  const s = p.scores
  const c = p.comments
  if (!s || !c)
    return false
  const firstScore = task === 'task2'
    ? (s.ta ?? s.tr)
    : s.ta
  const firstComment = task === 'task2'
    ? (c.ta ?? c.tr)
    : c.ta
  if (
    !isBandScore(firstScore)
    || !isBandScore(s.cc)
    || !isBandScore(s.lr)
    || !isBandScore(s.gra)
    || !isBandScore(s.overall)
  ) {
    return false
  }
  if (Math.abs((s.overall as number) - essayMean(s, task)) >= 1.0)
    return false
  if (
    typeof firstComment !== 'string'
    || typeof c.cc !== 'string'
    || typeof c.lr !== 'string'
    || typeof c.gra !== 'string'
  ) {
    return false
  }
  if (
    !Array.isArray(p.corrections)
    || !p.corrections.every(isValidCorrection)
    || typeof p.suggestion !== 'string'
  ) {
    return false
  }
  if (p.rewritten !== undefined && typeof p.rewritten !== 'string')
    return false
  return true
}
/**
 * 老存档修复：分数本身无效（缺项/非数字/超 [0, 9] 范围）才丢弃；点评缺失的补空值、
 *  逐句修改过滤掉不合格元素、总建议缺失补空值后展示，不再像以前那样整条丢弃。
 *  overall 与四项均值差 ≥ 1.0 时重算为均值（roundHalf），不展示自相矛盾的总分；
 *  rewritten 非字符串时置空（面板 v-if 为假即隐藏改写区）；advice/rewritten 本就是可选字段。
 */
export function repairSavedGrade(
  parsed: AIGradeResult | null,
  task: 'task1' | 'task2',
): AIGradeResult | null {
  if (!parsed || typeof parsed !== 'object')
    return null
  const p = task === 'task2'
    ? normalizeTask2Grade(parsed)
    : parsed
  const s = p.scores as unknown as Record<string, unknown> | undefined
  if (
    !s
    || !ESSAY_CRITERIA.every(k => isBandScore(s[k]))
    || !isBandScore(s.overall)
  ) {
    return null
  }
  if (Math.abs((s.overall as number) - essayMean(s, task)) >= 1.0)
    s.overall = roundHalf(essayMean(s, task))
  const c = (
    p.comments && typeof p.comments === 'object'
      ? p.comments
      : {}
  ) as Record<string, string>
  for (const k of ESSAY_CRITERIA) {
    if (typeof c[k] !== 'string')
      c[k] = ''
  }

  p.comments = c as unknown as AIGradeResult['comments']
  if (!Array.isArray(p.corrections))
    p.corrections = []
  else p.corrections = p.corrections.filter(isValidCorrection)
  if (typeof p.suggestion !== 'string')
    p.suggestion = ''
  if (p.rewritten !== undefined && typeof p.rewritten !== 'string')
    p.rewritten = ''
  return p
}
export interface AISpeakingResult {
  scores: {
    fluency: number
    lexical: number
    grammar: number
    overall: number
  }
  comments: {
    fluency: string
    lexical: string
    grammar: string
  }
  suggestion: string
}
// 口语评分标准 condensed（IELTS Speaking Band Descriptors）
// 注意：发音(Pronunciation)无法从文字转写评估，不纳入 AI 打分
const SPEAKING_DESCRIPTORS = `【Fluency and Coherence 流利度与连贯性】
9分: 自然流利，极少重复/自我纠正；连贯衔接自然；话题展开充分。
8分: 流利，偶有重复/纠正；衔接恰当；话题展开充分。
7分: 有一定流利度；偶有重复/纠正/犹豫；能使用多种衔接手段；能展开话题。
6分: 能保持较长发言但有重复/纠正；衔接手段有限但大体有效；能展开但不够充分。
5分: 能保持发言但明显不流利；重复纠正多；衔接手段少；展开有限。
【Lexical Resource 词汇资源】
9分: 词汇丰富精确，搭配自然；习语运用自如。
8分: 词汇丰富灵活，搭配多准确；偶有小错。
7分: 词汇量够，能谈多话题；搭配意识强；偶有用词不当。
6分: 词汇够谈熟悉话题；能改述但不总成功；有搭配错误。
5分: 词汇有限；简单话题可应付；错误多但大意可懂。
【Grammatical Range and Accuracy 语法多样性与准确性】
9分: 句式丰富灵活，全程准确。
8分: 句式多样，多数准确，偶有小错。
7分: 复杂句多样，有一定准确度；错误不影响理解。
6分: 简单复杂句混用；复杂句错误多于简单句。
5分: 句式有限重复；错误多但大意可懂。`
const SPEAKING_SYSTEM_PROMPT = `你是雅思口语考官。考生用英语回答了口语题目，下面给你的是【语音转写的文字稿】（转写可能有小错，请宽容）。
必须严格依据以下官方口语评分标准（IELTS Speaking Band Descriptors）打分：

${SPEAKING_DESCRIPTORS}

重要说明：
- 发音(Pronunciation)无法从文字评估，不要打分，overall 按三项综合估算。
- 转写文本没有标点/大小写问题，不要因此扣分；关注内容、词汇、句式。
- 注意：语音转写通常会丢弃 um/uh 等填充词，且不记录停顿时长；流利度只能按文字稿的连贯与展开程度估算，不要断言录音中实际的停顿、重复频率。
- 每项按0.5分制（4.0-9.0）。

严格按以下 JSON 格式返回（不要输出其他内容）：
{
"scores": { "fluency": 6.5, "lexical": 6.0, "grammar": 6.0, "overall": 6.0 },
"comments": { "fluency": "依据标准的哪条给分+1-2句建议", "lexical": "...", "grammar": "..." },
"suggestion": "整体提分建议（中文，2-3句，指出最该优先改的一项）"
}
其中 fluency=流利度与连贯性，lexical=词汇资源，grammar=语法多样性与准确性。全部用中文（引用考生原话时保留英文）。`
/**
 * 口语结果形状校验（新评分入口与存档恢复共用同一口径）：
 *  四项齐全且为 [0, 9] 内有限数字、0.5 步进、overall 与三项均值差 < 1.0、
 *  三项点评为字符串、提分建议为非空字符串；任一项不合格即视为格式异常。
 */
export function isValidSpeakingGrade(
  parsed: unknown,
): parsed is AISpeakingResult {
  if (!parsed || typeof parsed !== 'object')
    return false
  const p = parsed as Partial<AISpeakingResult>
  const s = p.scores
  if (!s)
    return false
  if (
    !isBandScore(s.overall)
    || !isBandScore(s.fluency)
    || !isBandScore(s.lexical)
    || !isBandScore(s.grammar)
  ) {
    return false
  }
  const scores = [
    s.overall,
    s.fluency,
    s.lexical,
    s.grammar,
  ]
  if (scores.some(v => Math.abs(v * 2 - Math.round(v * 2)) >= 1e-9))
    return false
  const mean = (s.fluency + s.lexical + s.grammar) / 3
  if (Math.abs(s.overall - mean) >= 1.0)
    return false
  if (
    !p.comments
    || typeof p.comments.fluency !== 'string'
    || typeof p.comments.lexical !== 'string'
    || typeof p.comments.grammar !== 'string'
  ) {
    return false
  }
  if (typeof p.suggestion !== 'string' || !p.suggestion.trim())
    return false
  return true
}
export async function gradeSpeakingWithAI(
  question: string,
  transcript: string,
  signal?: AbortSignal,
): Promise<AISpeakingResult> {
  const settings = getAISettings()
  if (!hasAISettings())
    throw new Error('请先在设置页填写 API 地址、Key 和模型')
  const words = transcript.trim().split(/\s+/).filter(Boolean).length
  if (words < 10)
    throw new Error('转写文字太少，无法评分（请说几句完整的英语再试）')
  const user = `【题目】\n${question}\n\n【考生回答（语音转写）】\n${transcript}`
  const raw = await callChatApi(settings, SPEAKING_SYSTEM_PROMPT, user, signal)
  let parsed: AISpeakingResult
  try {
    parsed = JSON.parse(extractJson(raw))
  }
  catch {
    throw new Error('AI 返回格式异常，请重试')
  }
  // 入口校验四项齐全：缺项时面板 toFixed 会崩溃，必须在这里拦住；
  // 形状口径与存档恢复共用 isValidSpeakingGrade（0.5 步进、总分一致性、建议非空）
  if (!isValidSpeakingGrade(parsed))
    throw new Error('AI 返回格式异常，请重试')
  return parsed
}
/** 英译中：单词给中文意思，词组/句子给整句翻译。只返回中文译文。 */
export async function translateWithAI(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const settings = getAISettings()
  if (!hasAISettings())
    throw new Error('请先在设置页填写 API 地址、Key 和模型')
  const trimmed = text.trim()
  if (!trimmed)
    throw new Error('没有可翻译的内容')
  if (trimmed.length > 2000)
    throw new Error('选中的内容太长，请选一句话以内')
  const system = '你是一个英汉翻译助手。把用户给出的英文翻译成自然、地道的中文。只输出中文译文，不要加解释、不要输出英文原文、不要加拼音。如果输入是单个单词，给出最常用的中文意思（1-2 个，用分号隔开）；如果是词组或句子，给出整句的中文翻译。'
  const raw = await callChatApi(settings, system, trimmed, signal)
  const result = raw.trim()
  if (!result)
    throw new Error('AI 返回为空，请重试')
  return result
}
// 识别服务商：只看 Key 的格式在本机判断，不发任何网络请求。
// 以前是后端拿同一个 Key 依次去试 OpenAI / DeepSeek / Hive，会把一家的 Key 发给另外两家，现已停用。
// 认不出格式时请用户手动选服务商，再用“测试连接”只向选定的那一家验证。
export interface AIDetectResult {
  provider: string
  label: string
  baseUrl: string
}
/** 按 Key 格式推测服务商；认不出返回 null */
export function guessProviderFromKey(apiKey: string): AIDetectResult | null {
  const key = apiKey.trim()
  let id: string | null = null
  // OpenAI：项目/服务账号/管理 Key 带固定前缀；旧版用户 Key 中间含 T3BlbkFJ（"OpenAI" 的 base64）
  if (/^sk-(?:proj|svcacct|admin)-[\w-]{20,}$/.test(key) || /^sk-\w*T3BlbkFJ\w*$/.test(key))
    id = 'openai'
  // DeepSeek：sk- 加 32 位十六进制
  else if (/^sk-[0-9a-f]{32}$/.test(key))
    id = 'deepseek'
  const provider = id
    ? AI_PROVIDERS.find(p => p.id === id)
    : undefined
  return provider
    ? { provider: provider.id, label: provider.label, baseUrl: provider.baseUrl }
    : null
}
export async function detectAIProvider(apiKey: string): Promise<AIDetectResult> {
  if (!apiKey.trim())
    throw new Error('请先填写 API Key')
  const result = guessProviderFromKey(apiKey)
  if (!result)
    throw new Error('从格式认不出这个 Key 属于哪家，请手动选择服务商，再点“测试连接”验证')
  return result
}
// 测试连接：发一个极短请求验证 Key/地址/模型可用
export async function testAIConnection(
  settings: AISettings = getAISettings(),
): Promise<string> {
  if (
    ![settings.baseUrl, settings.apiKey, settings.model].every(s => s.trim())
  )
    throw new Error('请先填写 API 地址、Key 和模型')
  const content = await callChatApi(settings, '只回复 {"ok":true}', 'ping')
  // 能拿到模型回复即算连通，不强求标准 JSON
  try {
    const parsed = JSON.parse(extractJson(content))
    if (parsed?.ok)
      return '连接成功'
  }
  catch {
    /* 忽略解析失败 */
  }
  if (content && content.trim().length > 0)
    return '连接成功（模型有响应）'
  throw new Error('API 返回为空，请重试')
}
export const aiSettingsState = ref<AISettings>(getAISettings())

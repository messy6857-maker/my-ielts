import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  MODEL_STRENGTH_LABELS,
  getAISettings,
  getModelOption,
  getProviderForBaseUrl,
  getProviderIdForBaseUrl,
  modelSupportsReasoningEffort,
  saveAISettings,
  switchProviderSettings,
} from '../src/composables/useAISettings'
import type { AISettings } from '../src/composables/useAISettings'

describe('AI 服务商预设', () => {
  it('三个预设地址都能被识别（忽略尾斜杠与大小写）', () => {
    expect(getProviderForBaseUrl('https://api-cdn.thehive.ai/api/v3')?.id).toBe('hive')
    expect(getProviderForBaseUrl('https://api.openai.com/v1/')?.id).toBe('openai')
    expect(getProviderForBaseUrl('https://API.DEEPSEEK.COM')?.id).toBe('deepseek')
  })
  it('手动改过的地址归为自定义（null）', () => {
    expect(getProviderForBaseUrl('https://example.com/v1')).toBeNull()
    expect(getProviderForBaseUrl('')).toBeNull()
  })
  it('每个服务商至少一个模型，每个模型都有强度档位与说明', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0)
      for (const m of p.models) {
        expect(MODEL_STRENGTH_LABELS[m.strength]).toBeTruthy()
        expect(m.note.length).toBeGreaterThan(0)
      }
    }
  })
  it('Hive 默认模型仍在列表里（老用户设置不丢）', () => {
    expect(getModelOption('hive', 'deepseek-ai/deepseek-v4.1-flash-1017')?.strength).toBe('balanced')
  })
  it('OpenAI 与 DeepSeek 官方的模型 ID 按官方文档取', () => {
    expect(getModelOption('openai', 'gpt-6.1-sol')?.strength).toBe('strong')
    expect(getModelOption('openai', 'gpt-6-astra')?.strength).toBe('flagship')
    expect(getModelOption('openai', 'gpt-6.1-terra')?.strength).toBe('balanced')
    expect(getModelOption('openai', 'gpt-6-luna')?.strength).toBe('light')
    expect(getModelOption('deepseek', 'deepseek-flash')?.strength).toBe('balanced')
    expect(getModelOption('deepseek', 'deepseek-v4-pro')?.strength).toBe('flagship')
  })
  it('自定义模型没有强度信息', () => {
    expect(getModelOption('openai', 'gpt-9')).toBeNull()
    expect(getModelOption('deepseek', 'deepseek-chat')).toBeNull()
  })
})

describe('推理强度（reasoning_effort）适用范围', () => {
  it('DeepSeek 全系支持', () => {
    expect(modelSupportsReasoningEffort('deepseek', 'deepseek-flash')).toBe(true)
    expect(modelSupportsReasoningEffort('deepseek', 'deepseek-v4-pro')).toBe(true)
  })
  it('OpenAI 推理模型支持（o 系列、GPT-5/6），老款不支持', () => {
    expect(modelSupportsReasoningEffort('openai', 'gpt-6.1-sol')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-6-astra')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-6.1-terra')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-6-luna')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'o3')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-5')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-4o')).toBe(false)
    expect(modelSupportsReasoningEffort('openai', 'gpt-4o-mini')).toBe(false)
  })
  it('Hive 不支持', () => {
    expect(modelSupportsReasoningEffort('hive', 'deepseek-ai/deepseek-v4.1-flash-1017')).toBe(false)
  })
})

describe('各服务商的 Key 分开记', () => {
  const hive = AI_PROVIDERS.find(p => p.id === 'hive')!
  const openai = AI_PROVIDERS.find(p => p.id === 'openai')!
  const deepseek = AI_PROVIDERS.find(p => p.id === 'deepseek')!

  it('切换服务商：旧 Key 存到旧家名下，新家存过的 Key 取出来', () => {
    const current: AISettings = {
      baseUrl: hive.baseUrl,
      apiKey: 'sk-hive-1',
      model: hive.models[0].id,
      apiKeys: { openai: 'sk-openai-1' },
    }
    const next = switchProviderSettings(current, openai)
    expect(next.baseUrl).toBe(openai.baseUrl)
    expect(next.apiKey).toBe('sk-openai-1')
    expect(next.apiKeys?.hive).toBe('sk-hive-1')
    expect(next.apiKeys?.openai).toBe('sk-openai-1')
  })
  it('新服务商没填过 Key：密钥框为空，旧 Key 仍存着', () => {
    const current: AISettings = {
      baseUrl: hive.baseUrl,
      apiKey: 'sk-hive-1',
      model: hive.models[0].id,
    }
    const next = switchProviderSettings(current, deepseek)
    expect(next.apiKey).toBe('')
    expect(next.apiKeys?.hive).toBe('sk-hive-1')
  })
  it('切回来：之前存的 Key 还在', () => {
    const start: AISettings = {
      baseUrl: hive.baseUrl,
      apiKey: 'sk-hive-1',
      model: hive.models[0].id,
      apiKeys: { openai: 'sk-openai-1' },
    }
    const toOpenai = switchProviderSettings(start, openai)
    const back = switchProviderSettings(toOpenai, hive)
    expect(back.apiKey).toBe('sk-hive-1')
    expect(back.apiKeys?.openai).toBe('sk-openai-1')
  })
  it('当前模型在新服务商列表里就保留，否则换成它的第一个模型', () => {
    const current: AISettings = {
      baseUrl: hive.baseUrl,
      apiKey: '',
      model: hive.models[0].id,
    }
    expect(switchProviderSettings(current, openai).model).toBe('gpt-6.1-sol')
    const custom: AISettings = { baseUrl: openai.baseUrl, apiKey: '', model: 'my-model' }
    expect(switchProviderSettings(custom, hive).model).toBe('deepseek-ai/deepseek-v4.1-flash-1017')
  })
  it('地址取服务商 id：已知地址返回 id，手动改过的地址归 custom', () => {
    expect(getProviderIdForBaseUrl('https://api.openai.com/v1')).toBe('openai')
    expect(getProviderIdForBaseUrl('https://api-cdn.thehive.ai/api/v3')).toBe('hive')
    expect(getProviderIdForBaseUrl('https://example.com/v1')).toBe('custom')
    expect(getProviderIdForBaseUrl('')).toBe('custom')
  })

  describe('保存与读取（localStorage）', () => {
    beforeEach(() => localStorage.clear())
    it('保存时当前 Key 写回当前服务商名下，读出来各家都在', () => {
      saveAISettings({
        baseUrl: hive.baseUrl,
        apiKey: 'sk-hive-1',
        model: hive.models[0].id,
        apiKeys: { openai: 'sk-openai-1' },
      })
      const loaded = getAISettings()
      expect(loaded.apiKey).toBe('sk-hive-1')
      expect(loaded.apiKeys?.hive).toBe('sk-hive-1')
      expect(loaded.apiKeys?.openai).toBe('sk-openai-1')
    })
    it('兼容旧版：只有单个 Key、没有分服务商 map 时，Key 记到当前服务商名下', () => {
      localStorage.setItem('myielts_ai_settings_v1', JSON.stringify({
        baseUrl: openai.baseUrl,
        apiKey: 'sk-openai-old',
        model: 'gpt-6.1-sol',
      }))
      const loaded = getAISettings()
      expect(loaded.apiKey).toBe('sk-openai-old')
      expect(loaded.apiKeys?.openai).toBe('sk-openai-old')
    })
  })
})

describe('只填 Key 自动识别', () => {
  // 后端 /api/ai/detect 用这三个模型去试 Key 属于哪家；
  // 它们必须都在前端目录里，否则识别成功后模型下拉框会显示“自定义模型”。
  it('后端试 Key 的三个探测模型都在前端目录里', () => {
    expect(getModelOption('openai', 'gpt-4o-mini')).not.toBeNull()
    expect(getModelOption('deepseek', 'deepseek-flash')).not.toBeNull()
    expect(getModelOption('hive', 'deepseek-ai/deepseek-v4.1-flash-1017')).not.toBeNull()
  })
  it('每家都有默认模型可设（识别成功后直接用第一项）', () => {
    for (const p of AI_PROVIDERS)
      expect(p.models[0]?.id).toBeTruthy()
  })
})

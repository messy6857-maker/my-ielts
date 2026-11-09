import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  MODEL_STRENGTH_LABELS,
  getModelOption,
  getProviderForBaseUrl,
  modelSupportsReasoningEffort,
} from '../src/composables/useAISettings'

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
    expect(getModelOption('openai', 'gpt-5')?.strength).toBe('flagship')
    expect(getModelOption('openai', 'gpt-4o-mini')?.strength).toBe('light')
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
  it('OpenAI 只有 o 系列支持', () => {
    expect(modelSupportsReasoningEffort('openai', 'o3')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'o4-mini')).toBe(true)
    expect(modelSupportsReasoningEffort('openai', 'gpt-5')).toBe(false)
    expect(modelSupportsReasoningEffort('openai', 'gpt-4o')).toBe(false)
  })
  it('Hive 不支持', () => {
    expect(modelSupportsReasoningEffort('hive', 'deepseek-ai/deepseek-v4.1-flash-1017')).toBe(false)
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

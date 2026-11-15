import type { AISettings } from '../src/composables/useAISettings'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setToken } from '../src/composables/syncClient'
import {
  AI_PROVIDERS,
  aiSettingsKey,
  getAISettings,
  rebindKeyForBaseUrl,
  switchProviderSettings,
} from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'

const auth = useAuth()
const wrappers: any[] = []
const OPENAI = 'https://api.openai.com/v1'
const CUSTOM_B = 'https://b.example.com/v1'
const hive = AI_PROVIDERS.find(p => p.id === 'hive')!
const openai = AI_PROVIDERS.find(p => p.id === 'openai')!

beforeEach(() => {
  localStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: null }),
  })))
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('an unsaved new key is cleared when the address changes, never replacing a saved key', () => {
  it('composable: pasted key then address change keeps the saved key of the old address', () => {
    const saved = { openai: 'sk-fake-saved-openai' }
    const form: AISettings = {
      baseUrl: OPENAI,
      apiKey: 'sk-fake-pasted',
      model: 'm',
      apiKeys: { ...saved },
    }
    const next = rebindKeyForBaseUrl({ ...form, baseUrl: CUSTOM_B }, OPENAI, saved)
    expect(next.apiKey).toBe('')
    expect(next.apiKeys?.openai).toBe('sk-fake-saved-openai')
    expect(Object.values(next.apiKeys ?? {})).not.toContain('sk-fake-pasted')
    // 点预设切走也一样
    const viaPreset = switchProviderSettings(form, hive, saved)
    expect(viaPreset.apiKey).toBe('')
    expect(viaPreset.apiKeys?.openai).toBe('sk-fake-saved-openai')
  })

  it('composable: the saved key itself still goes along normally', () => {
    const saved = { openai: 'sk-fake-saved-openai', hive: 'sk-fake-hive' }
    const form: AISettings = {
      baseUrl: OPENAI,
      apiKey: 'sk-fake-saved-openai',
      model: 'm',
      apiKeys: { ...saved },
    }
    const toHive = switchProviderSettings(form, hive, saved)
    expect(toHive.apiKey).toBe('sk-fake-hive')
    expect(switchProviderSettings(toHive, openai, saved).apiKey).toBe('sk-fake-saved-openai')
  })

  it('composable: an address without a saved key still keeps the key typed for it', () => {
    const saved = { openai: 'sk-fake-saved-openai' }
    let s: AISettings = {
      baseUrl: CUSTOM_B,
      apiKey: 'sk-fake-b',
      model: 'm',
      apiKeys: { ...saved },
    }
    s = switchProviderSettings(s, openai, saved)
    expect(s.apiKey).toBe('sk-fake-saved-openai')
    s = rebindKeyForBaseUrl({ ...s, baseUrl: CUSTOM_B }, s.baseUrl, saved)
    expect(s.apiKey).toBe('sk-fake-b')
  })

  it('settings page: paste a key, then type an address — the key box clears and saving keeps the saved OpenAI key', async () => {
    localStorage.setItem(aiSettingsKey('alice'), JSON.stringify({ baseUrl: OPENAI, apiKey: 'sk-fake-saved-openai', model: 'gpt-4o-mini' }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/settings',
          component: { template: '<p />' },
        },
      ],
    })
    await router.push('/settings')
    const Page = (await import('../src/pages/settings.vue')).default
    const w = mount(Page, {
      attachTo: document.body,
      global: {
        plugins: [router],
        stubs: { RouterLink: true },
      },
    })
    wrappers.push(w)
    await flushPromises()
    const address = w.get('input[placeholder="https://api-cdn.thehive.ai/api/v3"]')
    const key = w.get('input[placeholder="sk-..."]')
    await key.setValue('sk-fake-pasted')
    await address.setValue(CUSTOM_B)
    expect((key.element as HTMLInputElement).value).toBe('')
    await w.findAll('button').find(b => b.text().trim() === '保存')!.trigger('click')
    const saved = getAISettings()
    expect(saved.baseUrl).toBe(CUSTOM_B)
    expect(saved.apiKey).toBe('')
    expect(saved.apiKeys?.openai).toBe('sk-fake-saved-openai')
    expect(JSON.stringify(saved)).not.toContain('sk-fake-pasted')
    // 切回 OpenAI：还是原来保存的 Key
    await w.findAll('button').find(b => b.text().trim() === 'OpenAI')!.trigger('click')
    expect((key.element as HTMLInputElement).value).toBe('sk-fake-saved-openai')
  })
})

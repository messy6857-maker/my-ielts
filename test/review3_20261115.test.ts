import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import PageBookmark from '../src/components/PageBookmark.vue'
import { setToken } from '../src/composables/syncClient'
import {
  AI_PROVIDERS,
  aiSettingsKey,
  claimLegacyAISettings,
  getAISettings,
  keySlotForBaseUrl,
  legacyClaimConflicts,
  normalizeBaseUrl,
  switchProviderSettings,
} from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'
import { dialogQueue, registerDialogHost, settleDialog } from '../src/composables/useDialog'
import {
  addPageBookmark,
  getPageBookmarks,
  reloadPageBookmarks,
  removePageBookmark,
} from '../src/composables/usePageBookmark'

const auth = useAuth()
const wrappers: any[] = []
let offHost: (() => void) | null = null
const LEGACY_AI = 'myielts_ai_settings_v1'
const LEGACY_BOOKMARKS = 'myielts_page_bookmarks_v1'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'

beforeEach(() => {
  localStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  reloadPageBookmarks()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: null }),
  })))
})
afterEach(() => {
  offHost?.()
  offHost = null
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function setLegacyAI(value: object) {
  localStorage.setItem(LEGACY_AI, JSON.stringify(value))
}
function setCurrentAI(value: object) {
  localStorage.setItem(aiSettingsKey('alice'), JSON.stringify(value))
}
function storedCurrentAI() {
  return JSON.parse(localStorage.getItem(aiSettingsKey('alice'))!)
}

describe('custom API addresses keep their own keys', () => {
  it('normalizes addresses and gives each custom address its own slot', () => {
    expect(normalizeBaseUrl(' HTTPS://A.Example.com/v1/ ')).toBe('https://a.example.com/v1')
    expect(keySlotForBaseUrl('https://a.example.com/v1/')).toBe('custom:https://a.example.com/v1')
    expect(keySlotForBaseUrl('https://b.example.com/v1')).toBe('custom:https://b.example.com/v1')
    expect(keySlotForBaseUrl('https://api.openai.com/v1')).toBe('openai')
    expect(keySlotForBaseUrl('')).toBe('custom')
  })

  it('claiming never puts one custom address’s key on another address', () => {
    setCurrentAI({ baseUrl: 'https://b.example.com/v1', apiKey: 'sk-fake-b', model: 'model-b' })
    setLegacyAI({ baseUrl: 'https://a.example.com/v1', apiKey: 'sk-fake-a', model: 'model-a' })
    // 两个不同的自定义地址不再算同一槽位的冲突
    expect(legacyClaimConflicts()).toEqual([])
    expect(claimLegacyAISettings()).toBe('claimed')
    const merged = getAISettings()
    expect(merged.baseUrl).toBe('https://b.example.com/v1')
    expect(merged.model).toBe('model-b')
    expect(merged.apiKey).toBe('sk-fake-b')
    expect(merged.apiKeys?.['custom:https://a.example.com/v1']).toBe('sk-fake-a')
    expect(merged.apiKeys?.['custom:https://b.example.com/v1']).toBe('sk-fake-b')
  })

  it('the same custom address written differently is one slot', () => {
    setCurrentAI({ baseUrl: 'https://a.example.com/v1/', apiKey: 'sk-fake-new', model: 'm' })
    setLegacyAI({ baseUrl: 'HTTPS://A.EXAMPLE.COM/v1', apiKey: 'sk-fake-old', model: 'm' })
    const conflicts = legacyClaimConflicts()
    expect(conflicts.map(c => c.provider)).toEqual(['custom:https://a.example.com/v1'])
    expect(claimLegacyAISettings({ 'custom:https://a.example.com/v1': 'legacy' }, conflicts)).toBe('claimed')
    expect(getAISettings().apiKey).toBe('sk-fake-old')
  })

  it('the old shared custom slot is never bound to an address; the saved key is', () => {
    setCurrentAI({
      baseUrl: 'https://a.example.com/v1',
      apiKey: 'sk-fake-a',
      model: 'm',
      apiKeys: { custom: 'sk-fake-shared', openai: 'sk-fake-openai' },
    })
    const loaded = getAISettings()
    expect(loaded.apiKeys?.['custom:https://a.example.com/v1']).toBe('sk-fake-a')
    // 切到预设：A 的 Key 留在 A 名下，预设用自己的 Key；来源不明的 custom 槽不被使用
    const openai = AI_PROVIDERS.find(p => p.id === 'openai')!
    const switched = switchProviderSettings(loaded, openai)
    expect(switched.apiKey).toBe('sk-fake-openai')
    expect(switched.apiKeys?.['custom:https://a.example.com/v1']).toBe('sk-fake-a')
  })

  it('an unbound old shared custom key is never treated as a conflict or used for a preset', () => {
    setCurrentAI({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-fake-openai',
      model: 'gpt-4o-mini',
      apiKeys: { custom: 'sk-fake-c1' },
    })
    setLegacyAI({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-fake-openai',
      model: 'gpt-4o-mini',
      apiKeys: { custom: 'sk-fake-c2' },
    })
    expect(legacyClaimConflicts()).toEqual([])
    expect(claimLegacyAISettings()).toBe('claimed')
    expect(getAISettings().apiKey).toBe('sk-fake-openai')
  })
})

describe('claim only applies the choices the user confirmed', () => {
  it('a conflict that appears after the dialog opened is not overwritten', () => {
    setCurrentAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-fake-new-openai', model: 'gpt-4o-mini' })
    setLegacyAI({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-fake-old-openai',
      model: 'gpt-4o-mini',
      apiKeys: { deepseek: 'sk-fake-old-deepseek' },
    })
    const shown = legacyClaimConflicts()
    expect(shown.map(c => c.provider)).toEqual(['openai'])
    // 弹窗开着时，另一页签给当前身份存了 DeepSeek Key
    const current = storedCurrentAI()
    setCurrentAI({
      ...current,
      apiKeys: { ...current.apiKeys, deepseek: 'sk-fake-new-deepseek' },
    })
    expect(claimLegacyAISettings({ openai: 'legacy' }, shown)).toBe('changed')
    // 什么都没改：新 Key 还在，旧设置也还在
    expect(storedCurrentAI().apiKeys.deepseek).toBe('sk-fake-new-deepseek')
    expect(storedCurrentAI().apiKey).toBe('sk-fake-new-openai')
    expect(localStorage.getItem(LEGACY_AI)).not.toBeNull()
    // 按最新冲突重新确认后才保存，且只按新的选择处理
    const again = legacyClaimConflicts()
    expect(again.map(c => c.provider).sort()).toEqual(['deepseek', 'openai'])
    expect(claimLegacyAISettings({ openai: 'legacy', deepseek: 'current' }, again)).toBe('claimed')
    const merged = getAISettings()
    expect(merged.apiKeys?.openai).toBe('sk-fake-old-openai')
    expect(merged.apiKeys?.deepseek).toBe('sk-fake-new-deepseek')
  })

  it('a shown conflict whose current key changed meanwhile asks again', () => {
    setCurrentAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-fake-new-1', model: 'gpt-4o-mini' })
    setLegacyAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-fake-old', model: 'gpt-4o-mini' })
    const shown = legacyClaimConflicts()
    setCurrentAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-fake-new-2', model: 'gpt-4o-mini' })
    expect(claimLegacyAISettings({ openai: 'legacy' }, shown)).toBe('changed')
    expect(storedCurrentAI().apiKey).toBe('sk-fake-new-2')
  })

  it('the settings page re-asks with the latest conflicts instead of applying the old choice', async () => {
    setCurrentAI({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-fake-new-openai', model: 'gpt-4o-mini' })
    setLegacyAI({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-fake-old-openai',
      model: 'gpt-4o-mini',
      apiKeys: { deepseek: 'sk-fake-old-deepseek' },
    })
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
    offHost = registerDialogHost()
    const s = (w.vm as any).$.setupState
    const claiming = s.claimLegacyAI()
    await nextTick()
    expect(dialogQueue.value).toHaveLength(1)
    const current = storedCurrentAI()
    setCurrentAI({
      ...current,
      apiKeys: { ...current.apiKeys, deepseek: 'sk-fake-new-deepseek' },
    })
    settleDialog(dialogQueue.value[0].id, 'confirm')
    await flushPromises()
    // 第二次询问：说明设置刚变过，并列出两处冲突
    expect(dialogQueue.value).toHaveLength(1)
    expect(dialogQueue.value[0].message).toContain('其他页签改过')
    expect(dialogQueue.value[0].message).toContain('DeepSeek')
    expect(storedCurrentAI().apiKeys.deepseek).toBe('sk-fake-new-deepseek')
    settleDialog(dialogQueue.value[0].id, 'cancel')
    await claiming
    const merged = getAISettings()
    expect(merged.apiKeys?.openai).toBe('sk-fake-new-openai')
    expect(merged.apiKeys?.deepseek).toBe('sk-fake-new-deepseek')
    expect(localStorage.getItem(LEGACY_AI)).toBeNull()
  })
})

describe('bookmark storage', () => {
  it('another tab saving between this tab’s read and write is not overwritten', () => {
    const set = Storage.prototype.setItem
    let interleaved = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // 本页签读完列表、正要写入时，另一页签抢先写了它自己的书签
      if (!interleaved && key.startsWith(ITEM_PREFIX)) {
        interleaved = true
        set.call(this, `${ITEM_PREFIX}${encodeURIComponent('/reading/daily')}|other-tab`, JSON.stringify({ id: 'other-tab', y: 2000, createdAt: 1 }))
      }
      return set.call(this, key, value)
    })
    expect(addPageBookmark('/reading/daily', 100)).toBeTruthy()
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(getPageBookmarks('/reading/daily').map(b => b.y)).toEqual([100, 2000])
  })

  it('a failed write does not show the bookmark and reports false', () => {
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith(ITEM_PREFIX))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    expect(addPageBookmark('/reading/daily', 100)).toBe(false)
    expect(getPageBookmarks('/reading/daily')).toEqual([])
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(getPageBookmarks('/reading/daily')).toEqual([])
  })

  it('the bookmark button tells the user when saving failed', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/vocabulary',
          component: { template: '<p />' },
        },
      ],
    })
    await router.push('/vocabulary')
    const w = mount(PageBookmark, {
      attachTo: document.body,
      global: {
        plugins: [router],
      },
    })
    wrappers.push(w)
    await flushPromises()
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith(ITEM_PREFIX))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    await w.get('button[aria-label="增加书签"]').trigger('click')
    expect(w.text()).toContain('书签保存失败')
    expect(w.find('button[aria-label="回到书签 1"]').exists()).toBe(false)
  })

  it('the old whole-table storage is migrated to one key per bookmark', () => {
    localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify({
      '/reading/daily': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
      ],
      '/vocabulary': 300,
    }))
    reloadPageBookmarks()
    // 旧表只读保留（旧版页签可能还会写它），每条都记了“已处理”
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).not.toBeNull()
    expect(Object.keys(localStorage).filter(k => k.startsWith(ITEM_PREFIX))).toHaveLength(3)
    expect(Object.keys(localStorage).filter(k => k.startsWith('myielts_page_bookmark_v2_done:'))).toHaveLength(3)
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual(['a', 'b'])
    expect(getPageBookmarks('/vocabulary').map(b => b.y)).toEqual([300])
  })

  it('a migration that cannot finish keeps the old table and shows everything once', () => {
    localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify({
      '/reading/daily': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
      ],
    }))
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.endsWith('|b'))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).not.toBeNull()
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual(['a', 'b'])
    // 删除一个还没迁走的书签：旧表里的那条也一并删掉，不会再冒出来
    removePageBookmark('/reading/daily', 'b')
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual(['a'])
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual(['a'])
  })
})

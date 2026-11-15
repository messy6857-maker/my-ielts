import type { AISettings } from '../src/composables/useAISettings'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setToken } from '../src/composables/syncClient'
import {
  AI_PROVIDERS,
  aiSettingsKey,
  claimLegacyAISettings,
  getAISettings,
  legacyClaimConflicts,
  rebindKeyForBaseUrl,
  saveAISettings,
  switchProviderSettings,
} from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'
import {
  getPageBookmarks,
  reloadPageBookmarks,
  removePageBookmark,
} from '../src/composables/usePageBookmark'

const auth = useAuth()
const wrappers: any[] = []
const LEGACY_AI = 'myielts_ai_settings_v1'
const LEGACY_BOOKMARKS = 'myielts_page_bookmarks_v1'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
const OPENAI = 'https://api.openai.com/v1'
const DEEPSEEK = AI_PROVIDERS.find(p => p.id === 'deepseek')!.baseUrl
const CUSTOM_B = 'https://b.example.com/v1'
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  reloadPageBookmarks()
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: null,
      content: '{"ok":true}',
      choices: [
        {
          message: { content: '{"ok":true}' },
        },
      ],
    }),
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function setCurrentAI(value: object) {
  localStorage.setItem(aiSettingsKey('alice'), JSON.stringify(value))
}
function storedCurrentAI() {
  return JSON.parse(localStorage.getItem(aiSettingsKey('alice'))!)
}
function chatRequests() {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/ai/chat'))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
}
async function mountSettings() {
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
  return w
}
function button(w: any, text: string) {
  return w.findAll('button').find((b: any) => b.text().trim() === text)!
}
async function typeAddress(w: any, value: string) {
  const input = w.get('input[placeholder="https://api-cdn.thehive.ai/api/v3"]')
  await input.setValue(value)
}

describe('editing the API address by hand switches keys like picking a preset', () => {
  it('rebinding: the key stays with its address and the new address gets its own key or none', () => {
    const start = {
      baseUrl: OPENAI,
      apiKey: 'sk-fake-openai',
      model: 'gpt-4o-mini',
      apiKeys: { deepseek: 'sk-fake-deepseek' },
    }
    const toDeepseek = rebindKeyForBaseUrl({ ...start, baseUrl: DEEPSEEK }, OPENAI)
    expect(toDeepseek.apiKey).toBe('sk-fake-deepseek')
    expect(toDeepseek.apiKeys?.openai).toBe('sk-fake-openai')
    const toCustom = rebindKeyForBaseUrl({ ...start, baseUrl: CUSTOM_B }, OPENAI)
    expect(toCustom.apiKey).toBe('')
    // 改地址的方式（手动/点预设）不影响结果
    const viaPreset = switchProviderSettings(start, AI_PROVIDERS.find(p => p.id === 'deepseek')!)
    expect(viaPreset.apiKey).toBe(toDeepseek.apiKey)
    expect(viaPreset.apiKeys).toEqual(toDeepseek.apiKeys)
  })

  it('half-typed addresses do not leave keys behind; the empty address never uses the old shared slot', () => {
    let s: AISettings = {
      baseUrl: OPENAI,
      apiKey: 'sk-fake-openai',
      model: 'm',
      apiKeys: { custom: 'sk-fake-unknown' },
    }
    for (const url of ['', 'h', 'https://b.ex', CUSTOM_B]) {
      s = rebindKeyForBaseUrl({ ...s, baseUrl: url }, s.baseUrl)
      expect(s.apiKey).toBe('')
    }
    expect(Object.keys(s.apiKeys ?? {}).sort()).toEqual(['custom', 'openai'])
    expect(s.apiKeys?.openai).toBe('sk-fake-openai')
  })

  it('test connection after typing a DeepSeek address sends the DeepSeek key, never the OpenAI one', async () => {
    setCurrentAI({
      baseUrl: OPENAI,
      apiKey: 'sk-fake-openai',
      model: 'gpt-4o-mini',
      apiKeys: { deepseek: 'sk-fake-deepseek' },
    })
    const w = await mountSettings()
    await typeAddress(w, DEEPSEEK)
    await button(w, '测试连接').trigger('click')
    await flushPromises()
    const sent = chatRequests()
    expect(sent).toHaveLength(1)
    expect(sent[0].baseUrl).toBe(DEEPSEEK)
    expect(sent[0].apiKey).toBe('sk-fake-deepseek')
  })

  it('test connection to an address without a key sends nothing', async () => {
    setCurrentAI({ baseUrl: OPENAI, apiKey: 'sk-fake-openai', model: 'gpt-4o-mini' })
    const w = await mountSettings()
    await typeAddress(w, DEEPSEEK)
    expect((w.get('input[placeholder="sk-..."]').element as HTMLInputElement).value).toBe('')
    await button(w, '测试连接').trigger('click')
    await flushPromises()
    expect(chatRequests()).toHaveLength(0)
    expect(w.text()).toContain('请先填写 API 地址、Key 和模型')
  })

  it('saving after typing a new address never writes the old key under it', async () => {
    setCurrentAI({ baseUrl: OPENAI, apiKey: 'sk-fake-openai', model: 'gpt-4o-mini' })
    const w = await mountSettings()
    await typeAddress(w, DEEPSEEK)
    await button(w, '保存').trigger('click')
    const saved = storedCurrentAI()
    expect(saved.baseUrl).toBe(DEEPSEEK)
    expect(saved.apiKey).toBe('')
    expect(saved.apiKeys.deepseek).toBe('')
    expect(saved.apiKeys.openai).toBe('sk-fake-openai')
    // 改回 OpenAI 地址：它的 Key 回来了
    await typeAddress(w, OPENAI)
    expect((w.get('input[placeholder="sk-..."]').element as HTMLInputElement).value).toBe('sk-fake-openai')
  })
})

describe('an old shared custom key of unknown origin is never bound to a new address', () => {
  it('save with an empty key, read back, then claim: the unknown key is never used', () => {
    setCurrentAI({
      baseUrl: OPENAI,
      apiKey: 'sk-fake-openai',
      model: 'm',
      apiKeys: { openai: 'sk-fake-openai', custom: 'sk-fake-unknown' },
    })
    // 1. 从预设切到新的自定义地址，Key 留空保存
    const form = rebindKeyForBaseUrl({
      ...getAISettings(),
      baseUrl: CUSTOM_B,
    }, OPENAI)
    expect(form.apiKey).toBe('')
    saveAISettings(form)
    // 2. 重新读取：用户保存的空值保持为空
    const loaded = getAISettings()
    expect(loaded.apiKey).toBe('')
    expect(loaded.apiKeys?.[`custom:${CUSTOM_B}`]).toBe('')
    // 3. 认领一份同样只有来源不明 custom Key 的旧设置：它不会成为当前 Key
    localStorage.setItem(LEGACY_AI, JSON.stringify({
      baseUrl: CUSTOM_B,
      apiKey: '',
      model: 'm',
      apiKeys: { custom: 'sk-fake-legacy-unknown' },
    }))
    expect(legacyClaimConflicts()).toEqual([])
    expect(claimLegacyAISettings()).toBe('claimed')
    const claimed = getAISettings()
    expect(claimed.baseUrl).toBe(CUSTOM_B)
    expect(claimed.apiKey).toBe('')
    expect(claimed.apiKeys?.[`custom:${CUSTOM_B}`]).toBe('')
  })

  it('a key saved together with its custom address is still kept for that address', () => {
    setCurrentAI({ baseUrl: OPENAI, apiKey: 'sk-fake-openai', model: 'm' })
    localStorage.setItem(LEGACY_AI, JSON.stringify({
      baseUrl: CUSTOM_B,
      apiKey: 'sk-fake-b',
      model: 'm',
      apiKeys: { custom: 'sk-fake-b' },
    }))
    expect(claimLegacyAISettings()).toBe('claimed')
    const claimed = getAISettings()
    expect(claimed.apiKey).toBe('sk-fake-openai')
    expect(claimed.apiKeys?.[`custom:${CUSTOM_B}`]).toBe('sk-fake-b')
    const back = rebindKeyForBaseUrl({ ...claimed, baseUrl: CUSTOM_B }, claimed.baseUrl)
    expect(back.apiKey).toBe('sk-fake-b')
  })

  it('an empty address never picks up the unknown key, even right after a claim', () => {
    setCurrentAI({
      baseUrl: '',
      apiKey: '',
      model: '',
      apiKeys: { custom: 'sk-fake-unknown' },
    })
    localStorage.setItem(LEGACY_AI, JSON.stringify({
      baseUrl: '',
      apiKey: '',
      model: '',
      apiKeys: { custom: 'sk-fake-legacy' },
    }))
    expect(claimLegacyAISettings()).toBe('claimed')
    expect(getAISettings().apiKey).toBe('')
  })
})

describe('upgrading while an old-version tab is still open', () => {
  /** 旧版页签：读整表、加一条、整表写回 */
  function oldTabWrites(table: object) {
    localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify(table))
  }

  it('a bookmark the old tab adds during migration is not lost when the old table is cleaned up', () => {
    oldTabWrites({
      '/x': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
      ],
    })
    const set = Storage.prototype.setItem
    let interleaved = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      const result = set.call(this, key, value)
      // 新页签迁完第一条时，旧页签整表写回（多了 c）
      if (!interleaved && key.startsWith(ITEM_PREFIX)) {
        interleaved = true
        set.call(this, LEGACY_BOOKMARKS, JSON.stringify({
          '/x': [
            { id: 'a', y: 100, createdAt: 1 },
            { id: 'b', y: 900, createdAt: 2 },
            { id: 'c', y: 2000, createdAt: 3 },
          ],
        }))
      }
      return result
    })
    reloadPageBookmarks()
    vi.restoreAllMocks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b', 'c'])
    // 下一次读取把 c 也迁过去；旧表只读保留，c 还在里面
    reloadPageBookmarks()
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).toContain('"c"')
    expect(Object.keys(localStorage).filter(k => k.startsWith(ITEM_PREFIX)).sort()).toEqual([
      `${ITEM_PREFIX}%2Fx|a`,
      `${ITEM_PREFIX}%2Fx|b`,
      `${ITEM_PREFIX}%2Fx|c`,
    ])
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('the old tab writing its stale table after migration adds its new bookmark without bringing back deleted ones', () => {
    oldTabWrites({
      '/x': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
      ],
    })
    reloadPageBookmarks()
    // 新页签删掉 a
    removePageBookmark('/x', 'a')
    // 旧页签内存里还是 a、b，再加一条 d，整表写回
    oldTabWrites({
      '/x': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
        { id: 'd', y: 3000, createdAt: 4 },
      ],
    })
    window.dispatchEvent(new StorageEvent('storage', { key: LEGACY_BOOKMARKS }))
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'd'])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'd'])
  })

  it('while the old table cannot be removed yet, migrated-then-deleted bookmarks stay hidden', () => {
    oldTabWrites({
      '/x': [
        { id: 'a', y: 100, createdAt: 1 },
        { id: 'b', y: 900, createdAt: 2 },
      ],
    })
    // 旧表删不掉也改不了（比如旧版页签一直在写、存储满）：迁过的书签以单条 key 为准
    const remove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LEGACY_BOOKMARKS)
        return
      return remove.call(this, key)
    })
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LEGACY_BOOKMARKS)
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    removePageBookmark('/x', 'a')
    reloadPageBookmarks()
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).toContain('"a"')
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })
})

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AISettings } from '../src/composables/useAISettings'
import { setToken } from '../src/composables/syncClient'
import {
  AI_PROVIDERS,
  aiSettingsKey,
  getAISettings,
  rebindKeyForBaseUrl,
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
const LEGACY_BOOKMARKS = 'myielts_page_bookmarks_v1'
const MIGRATED_LIST = 'myielts_page_bookmark_v2_migrated'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
const DONE_PREFIX = 'myielts_page_bookmark_v2_done:'
const OPENAI = 'https://api.openai.com/v1'
const CUSTOM_B = 'https://b.example.com/v1'
const openai = AI_PROVIDERS.find(p => p.id === 'openai')!

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
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** 旧版页签：整表写回它内存里的快照 */
function oldTabWrites(items: { id: string, y: number, createdAt: number }[]) {
  localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify({ '/x': items }))
}
const A = { id: 'a', y: 100, createdAt: 1 }
const B = { id: 'b', y: 900, createdAt: 2 }
const C = { id: 'c', y: 2000, createdAt: 3 }
const D = { id: 'd', y: 3000, createdAt: 4 }

describe('the new version never deletes or rewrites the old bookmark table', () => {
  it('an old tab writing right after the last check of a migration loses nothing', () => {
    oldTabWrites([A, B])
    const set = Storage.prototype.setItem
    const remove = Storage.prototype.removeItem
    const touchedLegacy: string[] = []
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LEGACY_BOOKMARKS)
        touchedLegacy.push('remove')
      return remove.call(this, key)
    })
    let injected = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LEGACY_BOOKMARKS && injected)
        touchedLegacy.push('write')
      const result = set.call(this, key, value)
      // 迁移的最后一次写入（b 的“已处理”标记）之后，旧版页签立刻整表写回、多了 c
      if (!injected && key === `${DONE_PREFIX}%2Fx|b`) {
        injected = true
        set.call(this, LEGACY_BOOKMARKS, JSON.stringify({ '/x': [A, B, C] }))
      }
      return result
    })
    reloadPageBookmarks()
    expect(touchedLegacy).toEqual([])
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).toContain('"c"')
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b', 'c'])
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(localStorage.getItem(`${ITEM_PREFIX}%2Fx|c`)).not.toBeNull()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('deleting a migrated bookmark records it instead of rewriting the old table', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    const before = localStorage.getItem(LEGACY_BOOKMARKS)
    removePageBookmark('/x', 'a')
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).toBe(before)
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })
})

describe('migration records cannot be overwritten by another tab', () => {
  it('each migrated bookmark has its own record; no shared list is written', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    expect(localStorage.getItem(MIGRATED_LIST)).toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).not.toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|b`)).not.toBeNull()
  })

  it('a stale list written by another tab does not let a deleted bookmark come back', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    removePageBookmark('/x', 'b')
    // 另一个页签（上一版）用它读到的旧快照整表写回迁移记录，没有 b
    localStorage.setItem(MIGRATED_LIST, JSON.stringify([`${ITEM_PREFIX}%2Fx|a`]))
    // 旧版页签随后写回带着 b 的旧快照，并新增 d
    oldTabWrites([A, B, D])
    window.dispatchEvent(new StorageEvent('storage', { key: LEGACY_BOOKMARKS }))
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'd'])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'd'])
  })

  it('two tabs migrating at the same time keep both sets of records', () => {
    oldTabWrites([A, B])
    const set = Storage.prototype.setItem
    let otherTabDone = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // 本页签开始迁移时，另一个新版页签已经把 b 迁好并删掉（只剩它的“已处理”记录）
      if (!otherTabDone) {
        otherTabDone = true
        set.call(this, `${DONE_PREFIX}%2Fx|b`, '1')
      }
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    vi.restoreAllMocks()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).not.toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|b`)).not.toBeNull()
    oldTabWrites([A, B])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a'])
  })

  it('records from the previous version’s shared list are still honored', () => {
    localStorage.setItem(`${ITEM_PREFIX}%2Fx|b`, JSON.stringify(B))
    localStorage.setItem(MIGRATED_LIST, JSON.stringify([`${ITEM_PREFIX}%2Fx|a`, `${ITEM_PREFIX}%2Fx|b`]))
    // a 已在上一版迁过又被删掉；旧版页签写回的快照里还有它
    oldTabWrites([A, B, D])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'd'])
  })
})

describe('a key typed for an unsaved custom address survives switching away and back', () => {
  it('composable: custom address + key → preset → back to the address', () => {
    let s: AISettings = { baseUrl: OPENAI, apiKey: 'sk-fake-openai', model: 'gpt-4o-mini', apiKeys: {} }
    for (const url of ['h', 'https://b.ex', CUSTOM_B])
      s = rebindKeyForBaseUrl({ ...s, baseUrl: url }, s.baseUrl)
    s = { ...s, apiKey: 'sk-fake-b' }
    s = switchProviderSettings(s, openai)
    expect(s.apiKey).toBe('sk-fake-openai')
    s = rebindKeyForBaseUrl({ ...s, baseUrl: CUSTOM_B }, s.baseUrl)
    expect(s.apiKey).toBe('sk-fake-b')
    // 半截地址仍不会留下槽位
    expect(Object.keys(s.apiKeys ?? {}).sort()).toEqual([`custom:${CUSTOM_B}`, 'openai'])
  })

  it('settings page: the typed key comes back and is saved under its own address', async () => {
    localStorage.setItem(aiSettingsKey('alice'), JSON.stringify({ baseUrl: OPENAI, apiKey: 'sk-fake-openai', model: 'gpt-4o-mini' }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component: { template: '<p />' } }] })
    await router.push('/settings')
    const Page = (await import('../src/pages/settings.vue')).default
    const w = mount(Page, { attachTo: document.body, global: { plugins: [router], stubs: { RouterLink: true } } })
    wrappers.push(w)
    await flushPromises()
    const address = w.get('input[placeholder="https://api-cdn.thehive.ai/api/v3"]')
    const key = w.get('input[placeholder="sk-..."]')
    await address.setValue(CUSTOM_B)
    await key.setValue('sk-fake-b')
    await w.findAll('button').find(b => b.text().trim() === 'OpenAI')!.trigger('click')
    expect((key.element as HTMLInputElement).value).toBe('sk-fake-openai')
    await address.setValue(CUSTOM_B)
    expect((key.element as HTMLInputElement).value).toBe('sk-fake-b')
    await w.findAll('button').find(b => b.text().trim() === '保存')!.trigger('click')
    const saved = getAISettings()
    expect(saved.apiKey).toBe('sk-fake-b')
    expect(saved.apiKeys?.[`custom:${CUSTOM_B}`]).toBe('sk-fake-b')
    expect(saved.apiKeys?.openai).toBe('sk-fake-openai')
  })
})

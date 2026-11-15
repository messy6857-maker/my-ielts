import type { AISettings } from '../src/composables/useAISettings'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setToken } from '../src/composables/syncClient'
import { AI_PROVIDERS, aiSettingsKey, getAISettings, switchProviderSettings } from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'
import { getPageBookmarks, reloadPageBookmarks, removePageBookmark } from '../src/composables/usePageBookmark'

const auth = useAuth()
const wrappers: any[] = []
const LEGACY = 'myielts_page_bookmarks_v1'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
const DONE_PREFIX = 'myielts_page_bookmark_v2_done:'
const DEL_PREFIX = 'myielts_page_bookmark_v2_del:'
const A = { id: 'a', y: 100, createdAt: 1 }
const B = { id: 'b', y: 900, createdAt: 2 }
const C = { id: 'c', y: 2000, createdAt: 3 }
const OPENAI = 'https://api.openai.com/v1'
const hive = AI_PROVIDERS.find(p => p.id === 'hive')!
const openai = AI_PROVIDERS.find(p => p.id === 'openai')!

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: null }) })))
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  reloadPageBookmarks()
  localStorage.clear()
})

function oldTabWrites(items: object[]) {
  localStorage.setItem(LEGACY, JSON.stringify({ '/x': items }))
}

describe('1. the new version never deletes the old table, so no check-then-delete gap exists', () => {
  it('an old tab writing at any moment during reads loses nothing; removeItem is never called on the old table', () => {
    oldTabWrites([A, B])
    const remove = Storage.prototype.removeItem
    const set = Storage.prototype.setItem
    const legacyRemovals: string[] = []
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      if (key === LEGACY)
        legacyRemovals.push(key)
      return remove.call(this, key)
    })
    // 每一次写入之后，旧版页签都立刻再加一条
    let n = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      const r = set.call(this, key, value)
      if (key !== LEGACY && n < 5) {
        n++
        const items = [A, B, ...Array.from({ length: n }, (_, i) => ({ id: `new${i}`, y: 3000 + i * 100, createdAt: 10 + i }))]
        set.call(this, LEGACY, JSON.stringify({ '/x': items }))
      }
      return r
    })
    for (let i = 0; i < 4; i++)
      reloadPageBookmarks()
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(legacyRemovals).toEqual([])
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b', 'new0', 'new1', 'new2', 'new3', 'new4'])
  })
})

describe('2. a tab migrating an entry another tab already migrated and deleted does not bring it back', () => {
  it('tab A passed the “not migrated” check, then tab B migrated and deleted it; A writing it back is ignored', () => {
    oldTabWrites([A, B])
    const set = Storage.prototype.setItem
    let otherTab = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // 本页签（A）正要把 a 写成单条 key 时：页签 B 已迁移并删除了 a
      if (!otherTab && key === `${ITEM_PREFIX}%2Fx|a`) {
        otherTab = true
        set.call(this, `${DONE_PREFIX}%2Fx|a`, '1')
        set.call(this, `${DEL_PREFIX}%2Fx|a`, '1')
      }
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    vi.restoreAllMocks()
    // A 把条目写回来了，但有删除记录，不显示
    expect(localStorage.getItem(`${ITEM_PREFIX}%2Fx|a`)).not.toBeNull()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })

  it('deleting writes the delete record before removing the entry', () => {
    oldTabWrites([A])
    reloadPageBookmarks()
    const order: string[] = []
    const set = Storage.prototype.setItem
    const remove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      order.push(`set ${key}`)
      return set.call(this, key, value)
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      order.push(`remove ${key}`)
      return remove.call(this, key)
    })
    expect(removePageBookmark('/x', 'a')).toBe(true)
    expect(order.indexOf(`set ${DEL_PREFIX}%2Fx|a`)).toBeLessThan(order.indexOf(`remove ${ITEM_PREFIX}%2Fx|a`))
    expect(order.indexOf(`set ${DEL_PREFIX}%2Fx|a`)).toBeGreaterThanOrEqual(0)
  })

  it('bookmarks that never came from the old table leave no delete records', () => {
    localStorage.setItem(`${ITEM_PREFIX}%2Fx|n1`, JSON.stringify({ id: 'n1', y: 10, createdAt: 1 }))
    reloadPageBookmarks()
    expect(removePageBookmark('/x', 'n1')).toBe(true)
    expect(Object.keys(localStorage).filter(k => k.startsWith(DEL_PREFIX))).toEqual([])
    expect(getPageBookmarks('/x')).toEqual([])
  })
})

describe('3. other tabs follow a delete that only wrote a record', () => {
  it('a bookmark that only exists in the old table disappears in other tabs when it is deleted', () => {
    oldTabWrites([A, C])
    // 存储满：迁移写不进 a 的单条 key，a 只在旧表里
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith(ITEM_PREFIX))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'c'])
    // 另一个页签删掉 a：只写了删除记录；本页签收到这条记录的 storage 事件
    set.call(localStorage, `${DEL_PREFIX}%2Fx|a`, '1')
    window.dispatchEvent(new StorageEvent('storage', { key: `${DEL_PREFIX}%2Fx|a` }))
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['c'])
  })
})

describe('4. clearing a saved key and switching provider keeps it cleared', () => {
  it('composable: an empty key is recorded for the old address', () => {
    const saved = { openai: 'sk-fake-old' }
    const form: AISettings = { baseUrl: OPENAI, apiKey: '', model: 'm', apiKeys: { ...saved } }
    const toHive = switchProviderSettings(form, hive, saved)
    expect(toHive.apiKeys?.openai).toBe('')
    expect(switchProviderSettings(toHive, openai, saved).apiKey).toBe('')
  })

  it('settings page: clear OpenAI key, switch to Hive, save, switch back — still empty', async () => {
    localStorage.setItem(aiSettingsKey('alice'), JSON.stringify({ baseUrl: OPENAI, apiKey: 'sk-fake-old', model: 'gpt-4o-mini' }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component: { template: '<p />' } }] })
    await router.push('/settings')
    const Page = (await import('../src/pages/settings.vue')).default
    const w = mount(Page, { attachTo: document.body, global: { plugins: [router], stubs: { RouterLink: true } } })
    wrappers.push(w)
    await flushPromises()
    const key = w.get('input[placeholder="sk-..."]')
    const click = (text: string) => w.findAll('button').find(b => b.text().trim() === text)!.trigger('click')
    await key.setValue('')
    await click('Hive')
    await click('保存')
    expect(getAISettings().apiKeys?.openai).toBe('')
    await click('OpenAI')
    expect((key.element as HTMLInputElement).value).toBe('')
    expect(JSON.stringify(getAISettings())).not.toContain('sk-fake-old')
  })

  it('a pasted new key is still dropped (not saved under the old address)', () => {
    const saved = { openai: 'sk-fake-old' }
    const form: AISettings = { baseUrl: OPENAI, apiKey: 'sk-fake-pasted', model: 'm', apiKeys: { ...saved } }
    expect(switchProviderSettings(form, hive, saved).apiKeys?.openai).toBe('sk-fake-old')
  })
})

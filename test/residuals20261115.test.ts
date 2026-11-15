import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import PageBookmark from '../src/components/PageBookmark.vue'
import {
  addPageBookmark,
  getPageBookmarks,
  reloadPageBookmarks,
  removePageBookmark,
} from '../src/composables/usePageBookmark'

const LEGACY_BOOKMARKS = 'myielts_page_bookmarks_v1'
const SEEN = 'myielts_page_bookmark_v1_seen'
const DONE_PREFIX = 'myielts_page_bookmark_v2_done:'
const DEL_PREFIX = 'myielts_page_bookmark_v2_del:'
const DAY = 24 * 60 * 60 * 1000
const A = { id: 'a', y: 100, createdAt: 1 }
const B = { id: 'b', y: 900, createdAt: 2 }
const C = { id: 'c', y: 2000, createdAt: 3 }
const wrappers: any[] = []

function oldTabWrites(items: object[]) {
  localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify({ '/x': items }))
}
function blockDoneMarkers() {
  const set = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key.startsWith(DONE_PREFIX) || key.startsWith(DEL_PREFIX))
      throw new DOMException('full', 'QuotaExceededError')
    return set.call(this, key, value)
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({
    toFake: ['Date'],
  })
  vi.setSystemTime(new Date('2026-11-15T00:00:00Z'))
  reloadPageBookmarks()
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
  // 把本页签里待重试的标记写掉，不影响下一个用例
  reloadPageBookmarks()
  localStorage.clear()
})

describe('the old bookmark table is never removed', () => {
  it('kept no matter how long it stays unchanged, and the old timer record is cleaned up', () => {
    localStorage.setItem(SEEN, JSON.stringify({ print: 'x', since: 0 }))
    oldTabWrites([A, B])
    reloadPageBookmarks()
    vi.setSystemTime(Date.now() + 365 * DAY)
    reloadPageBookmarks()
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).not.toBeNull()
    expect(localStorage.getItem(SEEN)).toBeNull()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b'])
  })

  it('an old tab writing at any later time loses nothing and resurrects nothing', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    removePageBookmark('/x', 'a')
    vi.setSystemTime(Date.now() + 60 * DAY)
    oldTabWrites([A, B, C])
    window.dispatchEvent(new StorageEvent('storage', { key: LEGACY_BOOKMARKS }))
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'c'])
  })
})

describe('deleting never rewrites the old table, even when storage is full', () => {
  it('the bookmark stays hidden, the old table is untouched, and the marker is written once possible', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    localStorage.removeItem(`${DONE_PREFIX}%2Fx|a`)
    const before = localStorage.getItem(LEGACY_BOOKMARKS)
    blockDoneMarkers()
    expect(removePageBookmark('/x', 'a')).toBe(false)
    expect(localStorage.getItem(LEGACY_BOOKMARKS)).toBe(before)
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
    // 旧版页签写回带着 a 的快照：本页签仍不显示
    oldTabWrites([A, B, C])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'c'])
    // 存储恢复后下一次读取补写标记
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(localStorage.getItem(`${DEL_PREFIX}%2Fx|a`)).toBe('1')
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b', 'c'])
  })

  it('an ordinary delete reports success', () => {
    const item = addPageBookmark('/x', 100)
    expect(item).toBeTruthy()
    expect(removePageBookmark('/x', (item as any).id)).toBe(true)
  })

  it('the bookmark button tells the user when a delete could not be saved', async () => {
    localStorage.setItem(LEGACY_BOOKMARKS, JSON.stringify({
      '/vocabulary': [A],
    }))
    reloadPageBookmarks()
    localStorage.removeItem(`${DONE_PREFIX}%2Fvocabulary|a`)
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
    await nextTick()
    blockDoneMarkers()
    await w.get('button[aria-label="删除书签 1"]').trigger('click')
    expect(w.text()).toContain('刷新页面后可能还会出现')
  })
})

describe('outdated tabs are told to refresh', () => {
  async function freshModule() {
    vi.resetModules()
    return await import('../src/composables/useAppUpdate')
  }
  it('records its own build and flags a newer build written by another tab', async () => {
    const m = await freshModule()
    m.startAppUpdateWatch()
    const mine = Number(localStorage.getItem('myielts_app_build'))
    expect(mine).toBeGreaterThan(0)
    expect(m.appOutdated.value).toBe(false)
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'myielts_app_build',
      newValue: String(mine - 1),
    }))
    expect(m.appOutdated.value).toBe(false)
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'myielts_app_build',
      newValue: String(mine + 1),
    }))
    expect(m.appOutdated.value).toBe(true)
  })
  it('a tab opened from an older cached build is flagged at once and does not lower the stored build', async () => {
    localStorage.setItem('myielts_app_build', String(Number.MAX_SAFE_INTEGER))
    const m = await freshModule()
    m.startAppUpdateWatch()
    expect(m.appOutdated.value).toBe(true)
    expect(localStorage.getItem('myielts_app_build')).toBe(String(Number.MAX_SAFE_INTEGER))
  })
})

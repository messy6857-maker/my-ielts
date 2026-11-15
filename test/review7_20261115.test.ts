import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPageBookmarks, reloadPageBookmarks, removePageBookmark } from '../src/composables/usePageBookmark'

const LEGACY = 'myielts_page_bookmarks_v1'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
const DONE_PREFIX = 'myielts_page_bookmark_v2_done:'
const DEL_PREFIX = 'myielts_page_bookmark_v2_del:'
const A = { id: 'a', y: 100, createdAt: 1 }
const B = { id: 'b', y: 900, createdAt: 2 }

beforeEach(() => {
  localStorage.clear()
  reloadPageBookmarks()
})
afterEach(() => {
  vi.restoreAllMocks()
  reloadPageBookmarks()
  localStorage.clear()
})
function oldTabWrites(items: object[]) {
  localStorage.setItem(LEGACY, JSON.stringify({ '/x': items }))
}

describe('a migrated bookmark the old tab already dropped from the old table stays deleted', () => {
  it('the delete record is written because the migration record shows it came from the old table', () => {
    oldTabWrites([A, B])
    reloadPageBookmarks()
    // 旧版页签删掉了 a（整表写回，不再含 a）；新版页签上 a 仍在（单条 key）
    oldTabWrites([B])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b'])
    expect(removePageBookmark('/x', 'a')).toBe(true)
    expect(localStorage.getItem(`${DEL_PREFIX}%2Fx|a`)).toBe('1')
    // 另一个已通过迁移检查的页签随后把旧条目写回
    localStorage.setItem(`${ITEM_PREFIX}%2Fx|a`, JSON.stringify(A))
    window.dispatchEvent(new StorageEvent('storage', { key: `${ITEM_PREFIX}%2Fx|a` }))
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })

  it('a delete between this tab marking an entry migrated and writing it also sticks', () => {
    oldTabWrites([A, B])
    const set = Storage.prototype.setItem
    let injected = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      const r = set.call(this, key, value)
      // 刚记下 a “已迁移”、还没写单条 key：旧版页签把 a 移出旧表，另一个页签删掉了 a
      if (!injected && key === `${DONE_PREFIX}%2Fx|a`) {
        injected = true
        set.call(this, LEGACY, JSON.stringify({ '/x': [B] }))
        removePageBookmark('/x', 'a')
      }
      return r
    })
    reloadPageBookmarks()
    vi.restoreAllMocks()
    expect(localStorage.getItem(`${DEL_PREFIX}%2Fx|a`)).toBe('1')
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })

  it('an entry whose single key cannot be written is not left marked as migrated', () => {
    oldTabWrites([A])
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith(ITEM_PREFIX))
        throw new DOMException('full', 'QuotaExceededError')
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBeNull()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a'])
    vi.restoreAllMocks()
    reloadPageBookmarks()
    expect(localStorage.getItem(`${ITEM_PREFIX}%2Fx|a`)).not.toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBe('1')
  })
})

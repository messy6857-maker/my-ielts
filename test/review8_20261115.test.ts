import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPageBookmarks, reloadPageBookmarks, removePageBookmark } from '../src/composables/usePageBookmark'

const LEGACY = 'myielts_page_bookmarks_v1'
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
const DONE_PREFIX = 'myielts_page_bookmark_v2_done:'
const SRC_PREFIX = 'myielts_page_bookmark_v2_src:'
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

/** 迁移到某一步时页签崩溃：之后的写入都不发生 */
function crashAfter(match: (key: string) => boolean) {
  const set = Storage.prototype.setItem
  let crashed = false
  class Crash extends Error {}
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (crashed)
      throw new Crash('tab is gone')
    const r = set.call(this, key, value)
    if (match(key))
      crashed = true
    return r
  })
}

describe('a migration interrupted between steps recovers on the next load', () => {
  it('crash right after recording the origin: the bookmark still shows, and the next load finishes migrating it', () => {
    localStorage.setItem(LEGACY, JSON.stringify({
      '/x': [A, B],
    }))
    crashAfter(key => key === `${SRC_PREFIX}%2Fx|a`)
    reloadPageBookmarks()
    vi.restoreAllMocks()
    // 崩溃后的状态：a 只有“来自旧表”，没有单条 key、也没有“迁移完成”
    expect(localStorage.getItem(`${SRC_PREFIX}%2Fx|a`)).toBe('1')
    expect(localStorage.getItem(`${ITEM_PREFIX}%2Fx|a`)).toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBeNull()
    // 刷新（新页签重新加载）
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a', 'b'])
    expect(localStorage.getItem(`${ITEM_PREFIX}%2Fx|a`)).not.toBeNull()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBe('1')
  })

  it('crash right after writing the entry: shown once, and marked complete next time', () => {
    localStorage.setItem(LEGACY, JSON.stringify({
      '/x': [A],
    }))
    crashAfter(key => key === `${ITEM_PREFIX}%2Fx|a`)
    reloadPageBookmarks()
    vi.restoreAllMocks()
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBeNull()
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['a'])
    expect(localStorage.getItem(`${DONE_PREFIX}%2Fx|a`)).toBe('1')
  })

  it('“completed” is only recorded after the entry is written', () => {
    localStorage.setItem(LEGACY, JSON.stringify({
      '/x': [A],
    }))
    const order: string[] = []
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      order.push(key)
      return set.call(this, key, value)
    })
    reloadPageBookmarks()
    expect(order).toEqual([`${SRC_PREFIX}%2Fx|a`, `${ITEM_PREFIX}%2Fx|a`, `${DONE_PREFIX}%2Fx|a`])
  })

  it('deleting an entry that only has the origin record still writes the delete record', () => {
    localStorage.setItem(LEGACY, JSON.stringify({
      '/x': [A, B],
    }))
    crashAfter(key => key === `${SRC_PREFIX}%2Fx|a`)
    reloadPageBookmarks()
    vi.restoreAllMocks()
    // 旧版页签把 a 移出旧表，新版页签删掉 a（a 此时只有“来自旧表”记录）
    localStorage.setItem(LEGACY, JSON.stringify({
      '/x': [B],
    }))
    reloadPageBookmarks()
    removePageBookmark('/x', 'a')
    expect(localStorage.getItem(`${DEL_PREFIX}%2Fx|a`)).toBe('1')
    // 另一个页签把旧条目写回：不显示
    localStorage.setItem(`${ITEM_PREFIX}%2Fx|a`, JSON.stringify(A))
    reloadPageBookmarks()
    expect(getPageBookmarks('/x').map(b => b.id)).toEqual(['b'])
  })
})

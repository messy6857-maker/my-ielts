import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPageBookmark,
  getPageBookmarks,
  jumpToPageBookmark,
  pageBookmarksState,
  reloadPageBookmarks,
  removePageBookmark,
} from '../src/composables/usePageBookmark'

describe('页面位置书签（多个）', () => {
  beforeEach(() => {
    localStorage.clear()
    pageBookmarksState.value = {}
  })

  it('一页可以记多个书签，按位置从上到下排', () => {
    addPageBookmark('/reading/daily', 2400)
    addPageBookmark('/reading/daily', 800)
    expect(getPageBookmarks('/reading/daily').map(b => b.y)).toEqual([800, 2400])
  })
  it('不同页面互不干扰', () => {
    addPageBookmark('/reading/daily', 1200)
    addPageBookmark('/vocabulary', 300)
    expect(getPageBookmarks('/reading/daily')).toHaveLength(1)
    expect(getPageBookmarks('/vocabulary')).toHaveLength(1)
  })
  it('50px 内重复加不产生新书签', () => {
    expect(addPageBookmark('/reading/daily', 1200)).not.toBeNull()
    expect(addPageBookmark('/reading/daily', 1220)).toBeNull()
    expect(getPageBookmarks('/reading/daily')).toHaveLength(1)
    expect(addPageBookmark('/reading/daily', 1400)).not.toBeNull()
    expect(getPageBookmarks('/reading/daily')).toHaveLength(2)
  })
  it('按 id 删除其中一个，不影响别的', () => {
    addPageBookmark('/reading/daily', 800)
    addPageBookmark('/reading/daily', 2400)
    const firstId = getPageBookmarks('/reading/daily')[0].id
    const secondId = getPageBookmarks('/reading/daily')[1].id
    removePageBookmark('/reading/daily', firstId)
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual([secondId])
  })
  it('回到某个书签：平滑滚到它的位置；没有该书签返回 false 且不滚动', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    addPageBookmark('/reading/daily', 800)
    addPageBookmark('/reading/daily', 2400)
    const firstId = getPageBookmarks('/reading/daily')[0].id
    expect(jumpToPageBookmark('/reading/daily', firstId)).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' })
    scrollTo.mockClear()
    expect(jumpToPageBookmark('/reading/daily', 'no-such-id')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
    scrollTo.mockRestore()
  })
  it('存进 localStorage，刷新后还在', () => {
    addPageBookmark('/reading/daily', 1200)
    addPageBookmark('/reading/daily', 2400)
    const raw = localStorage.getItem('myielts_page_bookmarks_v1')
    const parsed = JSON.parse(raw ?? '{}') as Record<string, { y: number }[]>
    expect(parsed['/reading/daily'].map(b => b.y).sort((x, y) => x - y)).toEqual([1200, 2400])
  })
  it('兼容旧版：单个数值自动转成一个书签', () => {
    localStorage.setItem('myielts_page_bookmarks_v1', JSON.stringify({ '/reading/daily': 1200 }))
    reloadPageBookmarks()
    const list = getPageBookmarks('/reading/daily')
    expect(list).toHaveLength(1)
    expect(list[0].y).toBe(1200)
  })
})

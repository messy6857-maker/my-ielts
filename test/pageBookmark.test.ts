import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPageBookmark,
  jumpToPageBookmark,
  pageBookmarksState,
  removePageBookmark,
  savePageBookmark,
} from '../src/composables/usePageBookmark'

describe('页面位置书签', () => {
  beforeEach(() => {
    localStorage.clear()
    pageBookmarksState.value = {}
  })

  it('存了就能取到（按路由分开记）', () => {
    savePageBookmark('/reading/daily', 1200)
    expect(getPageBookmark('/reading/daily')).toBe(1200)
    expect(getPageBookmark('/vocabulary')).toBeNull()
  })
  it('不同页面互不干扰', () => {
    savePageBookmark('/reading/daily', 1200)
    savePageBookmark('/vocabulary', 300)
    expect(getPageBookmark('/reading/daily')).toBe(1200)
    expect(getPageBookmark('/vocabulary')).toBe(300)
  })
  it('同一页面重新记录会覆盖旧位置', () => {
    savePageBookmark('/reading/daily', 1200)
    savePageBookmark('/reading/daily', 2400)
    expect(getPageBookmark('/reading/daily')).toBe(2400)
  })
  it('删除后取不到，也不影响别的页面', () => {
    savePageBookmark('/reading/daily', 1200)
    savePageBookmark('/vocabulary', 300)
    removePageBookmark('/reading/daily')
    expect(getPageBookmark('/reading/daily')).toBeNull()
    expect(getPageBookmark('/vocabulary')).toBe(300)
  })
  it('回到书签：平滑滚到记录的位置；没有书签返回 false 且不滚动', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    savePageBookmark('/reading/daily', 1200)
    expect(jumpToPageBookmark('/reading/daily')).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' })
    scrollTo.mockClear()
    expect(jumpToPageBookmark('/vocabulary')).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
    scrollTo.mockRestore()
  })
  it('存进 localStorage，刷新后还在', () => {
    savePageBookmark('/reading/daily', 1200)
    const raw = localStorage.getItem('myielts_page_bookmarks_v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '{}') as Record<string, number>
    expect(parsed['/reading/daily']).toBe(1200)
  })
})

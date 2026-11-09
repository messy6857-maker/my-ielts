import { ref } from 'vue'

// 页面位置书签：按路由存滚动位置（localStorage，全局，不按账号隔离）。
// 点右下角“书签”记下当前位置，再点一次回到记录的位置；× 删除。
const KEY = 'myielts_page_bookmarks_v1'
export type PageBookmarks = Record<string, number>

function loadBookmarks(): PageBookmarks {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const out: PageBookmarks = {}
    for (const [path, y] of Object.entries(parsed)) {
      if (typeof y === 'number' && Number.isFinite(y) && y >= 0)
        out[path] = Math.round(y)
    }
    return out
  }
  catch {
    return {}
  }
}
function persistBookmarks(map: PageBookmarks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  }
  catch {
    /* 存储满了就丢弃，不打扰用户 */
  }
}

/** 各页面的书签（路由 → 滚动位置），模块级共享状态 */
export const pageBookmarksState = ref<PageBookmarks>(loadBookmarks())

export function getPageBookmark(path: string): number | null {
  const y = pageBookmarksState.value[path]
  return typeof y === 'number' ? y : null
}
export function savePageBookmark(path: string, y: number): void {
  const next = { ...pageBookmarksState.value, [path]: Math.max(0, Math.round(y)) }
  pageBookmarksState.value = next
  persistBookmarks(next)
}
export function removePageBookmark(path: string): void {
  if (!(path in pageBookmarksState.value))
    return
  const next = { ...pageBookmarksState.value }
  delete next[path]
  pageBookmarksState.value = next
  persistBookmarks(next)
}
/** 回到记录的位置：没有书签返回 false */
export function jumpToPageBookmark(path: string): boolean {
  const y = getPageBookmark(path)
  if (y === null)
    return false
  window.scrollTo({ top: y, behavior: 'smooth' })
  return true
}

import { ref } from 'vue'

// 页面位置书签：每页可记多个（localStorage，全局，不按账号隔离）。
// 右下角“＋ 书签”在当前位置增加一个；点某个书签回到它的位置；× 删除单个。
const KEY = 'myielts_page_bookmarks_v1'
/** 同一位置重复点“＋ 书签”时，50px 内视为同一个，不重复加 */
const DEDUP_PX = 50

export interface PageBookmarkItem {
  id: string
  /** 记录时的滚动位置（window.scrollY） */
  y: number
  createdAt: number
}
export type PageBookmarks = Record<string, PageBookmarkItem[]>

function normalizeItem(raw: unknown): PageBookmarkItem | null {
  if (!raw || typeof raw !== 'object')
    return null
  const o = raw as Partial<PageBookmarkItem>
  if (typeof o.y !== 'number' || !Number.isFinite(o.y) || o.y < 0)
    return null
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    y: Math.round(o.y),
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
  }
}

function loadBookmarks(): PageBookmarks {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const out: PageBookmarks = {}
    for (const [path, value] of Object.entries(parsed)) {
      // 兼容旧版：单个数值就是一个书签
      if (typeof value === 'number') {
        const item = normalizeItem({ y: value })
        if (item)
          out[path] = [item]
        continue
      }
      if (!Array.isArray(value))
        continue
      const items = value.map(normalizeItem).filter((x): x is PageBookmarkItem => x !== null)
      if (items.length)
        out[path] = items
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

/** 各页面的书签（路由 → 书签列表），模块级共享状态 */
export const pageBookmarksState = ref<PageBookmarks>(loadBookmarks())
/** 重新从 localStorage 读（测试用；正常使用不需要调） */
export function reloadPageBookmarks(): void {
  pageBookmarksState.value = loadBookmarks()
}

/** 该页的书签，按位置从上到下排 */
export function getPageBookmarks(path: string): PageBookmarkItem[] {
  return [...(pageBookmarksState.value[path] ?? [])].sort((a, b) => a.y - b.y)
}
/** 在当前位置增加一个书签；50px 内已有书签时不重复加，返回 null */
export function addPageBookmark(path: string, y: number): PageBookmarkItem | null {
  const rounded = Math.max(0, Math.round(y))
  const existing = pageBookmarksState.value[path] ?? []
  if (existing.some(b => Math.abs(b.y - rounded) <= DEDUP_PX))
    return null
  const item: PageBookmarkItem = {
    id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    y: rounded,
    createdAt: Date.now(),
  }
  const next = { ...pageBookmarksState.value, [path]: [...existing, item] }
  pageBookmarksState.value = next
  persistBookmarks(next)
  return item
}
export function removePageBookmark(path: string, id: string): void {
  const existing = pageBookmarksState.value[path]
  if (!existing)
    return
  const next = existing.filter(b => b.id !== id)
  const map = { ...pageBookmarksState.value }
  if (next.length)
    map[path] = next
  else
    delete map[path]
  pageBookmarksState.value = map
  persistBookmarks(map)
}
/** 回到某个书签的位置：没有该书签返回 false */
export function jumpToPageBookmark(path: string, id: string): boolean {
  const item = (pageBookmarksState.value[path] ?? []).find(b => b.id === id)
  if (!item)
    return false
  window.scrollTo({ top: item.y, behavior: 'smooth' })
  return true
}

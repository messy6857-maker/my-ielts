import { ref } from 'vue'

// 页面位置书签：每页可记多个（localStorage，全局，不按账号隔离）。
// 右下角“＋ 书签”在当前位置增加一个；点某个书签回到它的位置；× 删除单个。
const KEY = 'myielts_page_bookmarks_v1'
/** 同一位置重复点“＋ 书签”时，50px 内视为同一个，不重复加 */
const DEDUP_PX = 50

interface BookmarkAnchor {
  article: string
  paragraph: number
  offset: number
}

export interface PageBookmarkItem {
  id: string
  /** 记录时的滚动位置（window.scrollY） */
  y: number
  createdAt: number
  anchor?: BookmarkAnchor
}
export type PageBookmarks = Record<string, PageBookmarkItem[]>

function normalizeItem(raw: unknown): PageBookmarkItem | null {
  if (!raw || typeof raw !== 'object')
    return null
  const o = raw as Partial<PageBookmarkItem>
  if (typeof o.y !== 'number' || !Number.isFinite(o.y) || o.y < 0)
    return null
  const anchor = o.anchor
  const validAnchor = anchor && /^(?:vocab|news-\d+)$/.test(anchor.article)
    && Number.isInteger(anchor.paragraph) && anchor.paragraph >= 0
    && Number.isFinite(anchor.offset)
  return {
    ...(validAnchor
      ? { anchor }
      : {}),
    // 没有 id 的旧书签用位置和创建时间生成固定 id：每次改书签都会重读存储，
    // 随机 id 会让界面上拿着的 id 对不上，删不掉这个书签
    id: typeof o.id === 'string' && o.id
      ? o.id
      : `bm-legacy-${Math.round(o.y)}-${typeof o.createdAt === 'number'
        ? o.createdAt
        : 0}`,
    y: Math.round(o.y),
    createdAt: typeof o.createdAt === 'number'
      ? o.createdAt
      : 0,
  }
}

// 存储：每条书签单独一个 key（myielts_page_bookmark_v2:<页面>|<id>），加/删只动自己那一条，
// 多个页签同时保存不同书签时不会互相覆盖。旧版把整张表存在 KEY 里，读取时迁移成单条 key，
// 迁完删掉旧表；迁移没完成（如存储满）前两边合并显示，按 id 去重。
const ITEM_PREFIX = 'myielts_page_bookmark_v2:'
function itemKey(path: string, id: string): string {
  return `${ITEM_PREFIX}${encodeURIComponent(path)}|${encodeURIComponent(id)}`
}
function parseItemKey(key: string): { path: string, id: string } | null {
  if (!key.startsWith(ITEM_PREFIX))
    return null
  const rest = key.slice(ITEM_PREFIX.length)
  const sep = rest.indexOf('|')
  if (sep < 0)
    return null
  try {
    return {
      path: decodeURIComponent(rest.slice(0, sep)),
      id: decodeURIComponent(rest.slice(sep + 1)),
    }
  }
  catch {
    return null
  }
}
/** 旧版整表（KEY）；没有或读不出时为 {} */
function readLegacyTable(): PageBookmarks {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const out: PageBookmarks = {}
    for (const [path, value] of Object.entries(parsed)) {
      // 兼容更旧版：单个数值就是一个书签
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
/** 把旧整表迁成单条 key：全部写成功才删旧表，否则保留旧表下次再迁 */
function migrateLegacyTable(): void {
  let hasLegacy = false
  try {
    hasLegacy = localStorage.getItem(KEY) !== null
  }
  catch {
    return
  }
  if (!hasLegacy)
    return
  let allWritten = true
  for (const [path, items] of Object.entries(readLegacyTable())) {
    for (const item of items) {
      try {
        if (localStorage.getItem(itemKey(path, item.id)) === null)
          localStorage.setItem(itemKey(path, item.id), JSON.stringify(item))
      }
      catch {
        allWritten = false
      }
    }
  }
  if (allWritten) {
    try {
      localStorage.removeItem(KEY)
    }
    catch {}
  }
}
/** 从 localStorage 读最新书签；存储本身不可读时返回 null（调用方回退到内存里的列表） */
function readStoredBookmarks(): PageBookmarks | null {
  migrateLegacyTable()
  let keys: string[]
  try {
    keys = Object.keys(localStorage)
  }
  catch {
    return null
  }
  const out: PageBookmarks = {}
  for (const key of keys) {
    const parsedKey = parseItemKey(key)
    if (!parsedKey)
      continue
    try {
      const item = normalizeItem({
        ...JSON.parse(localStorage.getItem(key) ?? 'null'),
        id: parsedKey.id,
      })
      if (item)
        (out[parsedKey.path] ??= []).push(item)
    }
    catch {}
  }
  // 迁移没完成时，旧表里还没迁过去的书签也要显示（按 id 去重）
  for (const [path, items] of Object.entries(readLegacyTable())) {
    for (const item of items) {
      const list = (out[path] ??= [])
      if (!list.some(b => b.id === item.id))
        list.push(item)
    }
  }
  for (const list of Object.values(out))
    list.sort((a, b) => a.createdAt - b.createdAt)
  return out
}
function loadBookmarks(): PageBookmarks {
  return readStoredBookmarks() ?? {}
}
/** 写入单条书签；存储满等原因失败时返回 false */
function writeItem(path: string, item: PageBookmarkItem): boolean {
  try {
    localStorage.setItem(itemKey(path, item.id), JSON.stringify(item))
    return true
  }
  catch {
    return false
  }
}
/** 删除单条书签（连同还没迁走的旧表里的同一条） */
function deleteItem(path: string, id: string): void {
  try {
    localStorage.removeItem(itemKey(path, id))
  }
  catch {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw)
      return
    const table = readLegacyTable()
    const list = table[path]
    if (!list?.some(b => b.id === id))
      return
    const rest = list.filter(b => b.id !== id)
    if (rest.length)
      table[path] = rest
    else
      delete table[path]
    localStorage.setItem(KEY, JSON.stringify(table))
  }
  catch {}
}

/** 各页面的书签（路由 → 书签列表），模块级共享状态 */
export const pageBookmarksState = ref<PageBookmarks>(loadBookmarks())
/** 改书签前先取存储里的最新列表（多个页签各有一份内存列表）；存储不可读时退回内存列表 */
function latestBookmarks(): PageBookmarks {
  const stored = readStoredBookmarks()
  if (stored)
    pageBookmarksState.value = stored
  return pageBookmarksState.value
}
// 其他页签改了书签：跟着更新（key 为 null 是整个 localStorage 被清空）
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === KEY || event.key.startsWith(ITEM_PREFIX))
      pageBookmarksState.value = loadBookmarks()
  })
}
/** 重新从 localStorage 读（测试用；正常使用不需要调） */
export function reloadPageBookmarks(): void {
  pageBookmarksState.value = loadBookmarks()
}

/** 该页的书签，按位置从上到下排（锚点书签按当前布局下的位置排） */
export function getPageBookmarks(path: string): PageBookmarkItem[] {
  return [
    ...(pageBookmarksState.value[path] ?? []),
  ].sort((a, b) => resolveBookmarkY(a) - resolveBookmarkY(b))
}
/** 锚点书签在当前布局下的滚动位置（与 jumpToPageBookmark 同公式）；解析不到时用记录时的 y */
export function resolveBookmarkY(item: PageBookmarkItem): number {
  if (!item.anchor)
    return item.y
  return anchorTop(item.anchor) ?? item.y
}

/**
 * 锚点在当前布局下的滚动位置；文章或段落不存在返回 undefined，调用方回退到记录时的 y。
 * Item 8：零高度段落（空段落/内容被折叠）本身没高度、位置是两段边界，按它算会落错地方——
 * 往后找第一个有高度的段落，找不到再往前找；offset 只对原段落有效，换段落后按段首算。
 * 都没有有高度的段落时按原段落位置算（与原来一致）。
 */
function anchorTop(anchor: BookmarkAnchor): number | undefined {
  const { article, paragraph, offset } = anchor
  const passage = Array.from(document.querySelectorAll<HTMLElement>('.passage-text[data-article]'))
    .find(el => el.dataset.article === article)
  if (!passage)
    return undefined
  const paragraphs = Array.from(passage.querySelectorAll<HTMLElement>(':scope > p'))
  const target = paragraphs[paragraph]
  if (!target)
    return undefined
  const rect = target.getBoundingClientRect()
  if (rect.height > 0)
    return Math.max(0, window.scrollY + rect.top + Math.min(offset, rect.height) - 90)
  for (let i = paragraph + 1; i < paragraphs.length; i++) {
    const next = paragraphs[i].getBoundingClientRect()
    if (next.height > 0)
      return Math.max(0, window.scrollY + next.top - 90)
  }
  for (let i = paragraph - 1; i >= 0; i--) {
    const prev = paragraphs[i].getBoundingClientRect()
    if (prev.height > 0)
      return Math.max(0, window.scrollY + prev.top - 90)
  }
  return Math.max(0, window.scrollY + rect.top - 90)
}

/**
 * 登录时把本设备游客的书签迁到账号名下（Item 6/L11）。
 * 游客书签按 [日期, 设备 id] 分 scope，登录后 scope 变成 [日期, 账号]，旧书签就看不见了。
 * 找到所有 scope 第二项是该设备 id 的 daily 书签，按日期合并进对应的账号 scope（按位置去重，与 M1 同规则），
 * 再删掉游客 scope。localStorage 是设备级的，这里的游客书签只可能是本设备的，放心迁。
 * 没有游客书签时什么都不做。
 */
export function migrateGuestPageBookmarks(guestId: string, username: string): void {
  if (!guestId || !username || guestId === username)
    return
  // 11-09 有一版用 [日期, null] 存游客书签；它们同样是本设备游客的，一并迁过去
  moveDailyBookmarks(owner => owner === guestId || owner === null, username)
}
/**
 * 兼容旧游客书签：11-09 有一版游客 scope 是 [日期, null]，之后改成 [日期, 设备 id]，
 * 旧书签还在本机却显示不出来。把它们并入本设备游客的 scope（按位置去重）。没有旧书签时什么都不做。
 */
export function adoptLegacyGuestPageBookmarks(guestId: string): void {
  if (!guestId)
    return
  moveDailyBookmarks(owner => owner === null, guestId)
}
/** 把 scope 第二项满足 match 的 daily 书签按日期并入 [日期, to]，按位置去重后删掉原 scope */
function moveDailyBookmarks(match: (owner: unknown) => boolean, to: string): void {
  const map = latestBookmarks()
  let changed = false
  const next: PageBookmarks = { ...map }
  for (const [path, items] of Object.entries(map)) {
    if (!path.startsWith('/reading/daily:'))
      continue
    const scopeRaw = path.slice('/reading/daily:'.length)
    let scope: unknown
    try {
      scope = JSON.parse(scopeRaw)
    }
    catch {
      continue
    }
    if (!Array.isArray(scope) || scope.length !== 2 || scope[1] === to || !match(scope[1]))
      continue
    const targetPath = `/reading/daily:${JSON.stringify([scope[0], to])}`
    const merged = [
      ...(next[targetPath] ?? []),
    ]
    // 逐条迁：先写到目标，写成功（或目标已有同位置书签）才删原条目；写失败的留在原处，不会丢
    for (const item of items) {
      const dup = merged.some(b => (
        item.anchor && b.anchor
          ? b.anchor.article === item.anchor.article
          && b.anchor.paragraph === item.anchor.paragraph
          && Math.abs(b.anchor.offset - item.anchor.offset) <= DEDUP_PX
          : Math.abs(b.y - item.y) <= DEDUP_PX
      ))
      if (!dup) {
        if (!writeItem(targetPath, item))
          continue
        merged.push(item)
      }
      deleteItem(path, item.id)
      changed = true
    }
    next[targetPath] = merged
  }
  if (changed)
    pageBookmarksState.value = loadBookmarks()
}
/** 阅读页当前位置的段落锚点（找不到返回 undefined） */
export function readingBookmarkAnchor(): BookmarkAnchor | undefined {
  const top = 90
  for (const passage of Array.from(document.querySelectorAll<HTMLElement>('.passage-text[data-article]'))) {
    const paragraphs = Array.from(passage.querySelectorAll<HTMLElement>(':scope > p'))
    const paragraph = paragraphs.findIndex((p) => {
      const rect = p.getBoundingClientRect()
      return rect.bottom > top && rect.top < window.innerHeight
    })
    const article = passage.dataset.article
    if (article && paragraph >= 0) {
      const offset = top - paragraphs[paragraph].getBoundingClientRect().top
      return { article, paragraph, offset }
    }
  }
}

/**
 * 在当前位置增加一个书签。50px 内已有书签时不重复加，返回 null；
 * 写入存储失败（如存储满）时不加进列表，返回 false，由调用方提示用户。
 */
export function addPageBookmark(path: string, y: number, anchor?: BookmarkAnchor): PageBookmarkItem | null | false {
  const rounded = Math.max(0, Math.round(y))
  const latest = latestBookmarks()
  const existing = latest[path] ?? []
  // M1：去重不能只在锚点状态一致时比较——有锚点/无锚点混用时也按记录位置比较，
  // 否则同一位置会同时存一个有锚点和一个无锚点书签。两边都有锚点才按锚点比较。
  if (existing.some((b) => {
    if (anchor && b.anchor) {
      return b.anchor.article === anchor.article
        && b.anchor.paragraph === anchor.paragraph
        && Math.abs(b.anchor.offset - anchor.offset) <= DEDUP_PX
    }
    return Math.abs(b.y - rounded) <= DEDUP_PX
  })) {
    return null
  }
  const item: PageBookmarkItem = {
    id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    y: rounded,
    createdAt: Date.now(),
    ...(anchor
      ? { anchor }
      : {}),
  }
  // 先写存储，写成功才显示：避免失败后书签先出现、下次重读又消失
  if (!writeItem(path, item))
    return false
  pageBookmarksState.value = loadBookmarks()
  return item
}
export function removePageBookmark(path: string, id: string): void {
  deleteItem(path, id)
  pageBookmarksState.value = loadBookmarks()
}
/** 回到某个书签的位置：没有该书签返回 false */
export function jumpToPageBookmark(path: string, id: string): boolean {
  const item = (pageBookmarksState.value[path] ?? []).find(b => b.id === id)
  if (!item)
    return false
  let top = item.y
  if (item.anchor) {
    // L2：段落找不到了（文章改版/篇数变化）回退到记录时的 y，不精确但比完全不跳好。
    // Item 8：零高度段落由 anchorTop 跳到最近的有高度段落，不直接按零高度位置算。
    top = anchorTop(item.anchor) ?? item.y
  }
  window.scrollTo({
    top: Math.max(0, top),
    behavior: 'instant',
  })
  return true
}

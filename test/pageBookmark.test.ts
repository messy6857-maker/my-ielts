import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import PageBookmark from '../src/components/PageBookmark.vue'
import {
  addPageBookmark,
  getPageBookmarks,
  jumpToPageBookmark,
  pageBookmarksState,
  reloadPageBookmarks,
  removePageBookmark,
  resolveBookmarkY,
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
  it('回到某个书签：立刻跳到它的位置（跟阅读 1/2 一样不用动画）；没有该书签返回 false 且不滚动', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    addPageBookmark('/reading/daily', 800)
    addPageBookmark('/reading/daily', 2400)
    const firstId = getPageBookmarks('/reading/daily')[0].id
    expect(jumpToPageBookmark('/reading/daily', firstId)).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'instant' })
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
  it('M1：有锚点/无锚点混用时同一位置不重复加', () => {
    expect(addPageBookmark('/reading/daily', 1200)).not.toBeNull()
    expect(addPageBookmark('/reading/daily', 1200, { article: 'news-0', paragraph: 0, offset: 30 })).toBeNull()
    expect(getPageBookmarks('/reading/daily')).toHaveLength(1)
    // 反过来：先有锚点，再在同一位置加无锚点，也去重
    expect(addPageBookmark('/vocabulary', 800, { article: 'vocab', paragraph: 2, offset: 10 })).not.toBeNull()
    expect(addPageBookmark('/vocabulary', 800)).toBeNull()
    expect(getPageBookmarks('/vocabulary')).toHaveLength(1)
  })
  it('L2：锚点段落找不到了回退到记录时的 y，而不是不跳', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    addPageBookmark('/reading/daily', 1200, { article: 'news-0', paragraph: 0, offset: 30 })
    const id = getPageBookmarks('/reading/daily')[0].id
    // jsdom 里没有 .passage-text 段落，锚点解析不到
    expect(jumpToPageBookmark('/reading/daily', id)).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'instant' })
    scrollTo.mockRestore()
  })
  it('L3：resolveBookmarkY 段落在时按当前布局算，找不到时回退到记录时的 y', () => {
    const item = { id: 'x', y: 1200, createdAt: 0, anchor: { article: 'news-0', paragraph: 0, offset: 30 } }
    expect(resolveBookmarkY(item)).toBe(1200)
    const passage = document.createElement('div')
    passage.className = 'passage-text'
    passage.setAttribute('data-article', 'news-0')
    const p = document.createElement('p')
    passage.appendChild(p)
    document.body.appendChild(passage)
    const previous = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240, height: 40, left: 0, right: 100, width: 100, x: 0, y: 200, toJSON: () => ({}) } as DOMRect)
    try {
      // 500 + 200 + min(30, 40) - 90 = 640
      expect(resolveBookmarkY(item)).toBe(640)
    }
    finally {
      document.body.removeChild(passage)
      if (previous)
        Object.defineProperty(window, 'scrollY', previous)
    }
  })
  it('L3：列表按锚点当前布局位置排序，而不是记录时的旧 y', () => {
    const passage = document.createElement('div')
    passage.className = 'passage-text'
    passage.setAttribute('data-article', 'news-0')
    const p0 = document.createElement('p')
    const p1 = document.createElement('p')
    passage.appendChild(p0)
    passage.appendChild(p1)
    document.body.appendChild(passage)
    const previous = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    vi.spyOn(p0, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 140, height: 40, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) } as DOMRect)
    vi.spyOn(p1, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 340, height: 40, left: 0, right: 100, width: 100, x: 0, y: 300, toJSON: () => ({}) } as DOMRect)
    try {
      // A 记录时 y=1000（段落 0），B 记录时 y=500（段落 1）；当前布局下 A 在 40，B 在 220
      addPageBookmark('/reading/daily', 1000, { article: 'news-0', paragraph: 0, offset: 30 })
      addPageBookmark('/reading/daily', 500, { article: 'news-0', paragraph: 1, offset: 10 })
      expect(getPageBookmarks('/reading/daily').map(b => b.y)).toEqual([1000, 500])
    }
    finally {
      document.body.removeChild(passage)
      if (previous)
        Object.defineProperty(window, 'scrollY', previous)
    }
  })
})

describe('「＋ 书签」按钮（文章未加载时禁用，L1）', () => {
  async function mountBookmark(props: Record<string, unknown> = {}) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: PageBookmark }],
    })
    await router.push('/')
    await router.isReady()
    return mount(PageBookmark, { props, global: { plugins: [router] } })
  }

  it('addDisabled 时按钮禁用', async () => {
    const w = await mountBookmark({ addDisabled: true })
    expect(w.find('[aria-label="增加书签"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('addDisabled 为 false 时按钮可用', async () => {
    const w = await mountBookmark({ addDisabled: false })
    expect(w.find('[aria-label="增加书签"]').attributes('disabled')).toBeUndefined()
    w.unmount()
  })
})

describe('回到顶部按钮（与书签同一列右下角）', () => {
  async function mountBookmark() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: PageBookmark }],
    })
    await router.push('/')
    await router.isReady()
    const w = mount(PageBookmark, { global: { plugins: [router] } })
    return w
  }
  function setScrollY(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  }

  it('滚过 300px 才出现，没滚到不出现', async () => {
    const w = mountBookmark()
    const wrapper = await w
    expect(wrapper.find('[aria-label="回到顶部"]').exists()).toBe(false)
    setScrollY(500)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="回到顶部"]').exists()).toBe(true)
    setScrollY(100)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="回到顶部"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点一下立刻回顶（不用动画），与书签跳转一致', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const wrapper = await mountBookmark()
    setScrollY(800)
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="回到顶部"]').trigger('click')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    scrollTo.mockRestore()
    wrapper.unmount()
  })

  it('按钮在书签列的最下面（右下角），书签增减不影响它的位置', async () => {
    const wrapper = await mountBookmark()
    setScrollY(800)
    await wrapper.vm.$nextTick()
    addPageBookmark('/', 1200)
    await wrapper.vm.$nextTick()
    const buttons = wrapper.findAll('button')
    const last = buttons[buttons.length - 1]
    expect(last.attributes('aria-label')).toBe('回到顶部')
    wrapper.unmount()
  })
})

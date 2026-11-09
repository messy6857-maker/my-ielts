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

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setToken } from '../src/composables/syncClient'
import { useAuth } from '../src/composables/useAuth'
import { useMistakes } from '../src/composables/useStudyData'

const auth = useAuth()
const wrappers: any[] = []

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // 通知各数据模块存储已清空，重新读取（否则内存里还是上一个用例的错题）
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn(),
  })
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function seed(dictation: number, typing: number) {
  const m = useMistakes()
  // 注意：vocabulary: 开头的键会被当成旧版词汇错题归到别的组，这里用听写错题
  for (let i = 0; i < dictation; i++)
    m.addMistake('dictation', { key: `dictation:cam18-test1:part1:${i}`, title: `sentence ${i}` })
  for (let i = 0; i < typing; i++)
    m.addMistake('typing', { key: `typing:t${i}`, title: `t${i}` })
  return m
}
async function open() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/mistakes',
        component: { template: '<p />' },
      },
    ],
  })
  await router.push('/mistakes')
  const Page = (await import('../src/pages/mistakes.vue')).default
  const w = mount(Page, {
    global: {
      plugins: [router],
      stubs: { RouterLink: true },
    },
  })
  wrappers.push(w)
  await flushPromises()
  return w
}
const rows = (w: any) => w.findAll('tbody tr').length
const button = (w: any, text: RegExp) => w.findAll('button').find((b: any) => text.test(b.text()))

describe('mistakes page shows mistakes in batches', () => {
  it('renders the first 100, group headers still count everything', async () => {
    seed(80, 170)
    const w = await open()
    expect(rows(w)).toBe(100)
    const headers = w.findAll('h4').map((h: any) => h.text())
    expect(headers.some((t: string) => t.includes('（80）'))).toBe(true)
    expect(headers.some((t: string) => t.includes('（170）'))).toBe(true)
    expect(w.text()).toContain('还有 150 条未显示')
  })

  it('“再显示” adds 100, “全部显示” shows the rest, and the bar disappears', async () => {
    seed(80, 170)
    const w = await open()
    await button(w, /再显示 100 条/).trigger('click')
    expect(rows(w)).toBe(200)
    expect(button(w, /再显示 50 条/)).toBeTruthy()
    await button(w, /全部显示/).trigger('click')
    expect(rows(w)).toBe(250)
    expect(w.text()).not.toContain('未显示')
  })

  it('few mistakes: everything shows and there is no bar', async () => {
    seed(3, 2)
    const w = await open()
    expect(rows(w)).toBe(5)
    expect(w.text()).not.toContain('未显示')
  })

  it('changing the filter starts from the first batch again and counts only the filtered ones', async () => {
    seed(80, 170)
    const w = await open()
    await button(w, /全部显示/).trigger('click')
    expect(rows(w)).toBe(250)
    ;(w.vm as any).$.setupState.filterModule = 'typing'
    await nextTick()
    expect(rows(w)).toBe(100)
    expect(w.text()).toContain('还有 70 条未显示')
    ;(w.vm as any).$.setupState.filterModule = 'dictation'
    await nextTick()
    expect(rows(w)).toBe(80)
    expect(w.text()).not.toContain('未显示')
  })

  it('removing a shown mistake pulls the next hidden one up, review still covers all', async () => {
    const m = seed(80, 170)
    const w = await open()
    const s = (w.vm as any).$.setupState
    await w.find('tbody tr button[title="已掌握，从错词本移除"]').trigger('click')
    await flushPromises()
    expect(m.mistakes.value).toHaveLength(249)
    expect(rows(w)).toBe(100)
    expect(w.text()).toContain('还有 149 条未显示')
    s.startReview()
    expect(s.reviewSnapshot.length).toBe(249)
  })
})

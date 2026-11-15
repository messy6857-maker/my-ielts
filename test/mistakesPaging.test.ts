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
/** 某组（按标题里的总数找）显示了几行、还有几条没显示 */
function group(w: any, total: number) {
  const headers = w.findAll('h4')
  const i = headers.findIndex((h: any) => h.text().includes(`（${total}）`))
  expect(i).toBeGreaterThanOrEqual(0)
  const tables = w.findAll('table')
  const bar = w.findAll('span').filter((sp: any) => sp.text().startsWith('本组还有'))
  return { index: i, rows: tables[i].findAll('tbody tr').length, bars: bar.map((b: any) => b.text()) }
}

describe('mistakes page shows each group in batches', () => {
  it('every group shows its header and total, with the first 50 rows each', async () => {
    seed(80, 170)
    const w = await open()
    expect(group(w, 80).rows).toBe(50)
    expect(group(w, 170).rows).toBe(50)
    expect(rows(w)).toBe(100)
    expect(w.text()).toContain('本组还有 30 条未显示')
    expect(w.text()).toContain('本组还有 120 条未显示')
  })

  it('“再显示” and “全部显示” only affect their own group', async () => {
    seed(80, 170)
    const w = await open()
    const typing = group(w, 170).index
    const moreButtons = () => w.findAll('button').filter((b: any) => /再显示/.test(b.text()))
    const allButtons = () => w.findAll('button').filter((b: any) => /全部显示/.test(b.text()))
    // 两组各有一套按钮，按组的顺序排列
    await moreButtons()[typing].trigger('click')
    expect(group(w, 170).rows).toBe(100)
    expect(group(w, 80).rows).toBe(50)
    await allButtons()[typing].trigger('click')
    expect(group(w, 170).rows).toBe(170)
    expect(group(w, 80).rows).toBe(50)
    expect(w.text()).not.toContain('本组还有 70')
    expect(w.text()).toContain('本组还有 30 条未显示')
  })

  it('few mistakes: everything shows and there is no bar', async () => {
    seed(3, 2)
    const w = await open()
    expect(rows(w)).toBe(5)
    expect(w.text()).not.toContain('未显示')
  })

  it('changing the filter starts from the first batch again', async () => {
    seed(80, 170)
    const w = await open()
    await button(w, /全部显示/).trigger('click')
    const s = (w.vm as any).$.setupState
    s.filterModule = 'typing'
    await nextTick()
    expect(rows(w)).toBe(50)
    expect(w.text()).toContain('本组还有 120 条未显示')
    s.filterModule = 'dictation'
    await nextTick()
    expect(rows(w)).toBe(50)
    s.filterModule = 'all'
    await nextTick()
    expect(rows(w)).toBe(100)
  })

  it('removing a shown mistake pulls the next hidden one up; review and counts still cover all', async () => {
    const m = seed(80, 170)
    const w = await open()
    const s = (w.vm as any).$.setupState
    await w.find('tbody tr button[title="已掌握，从错词本移除"]').trigger('click')
    await flushPromises()
    expect(m.mistakes.value).toHaveLength(249)
    expect(rows(w)).toBe(100)
    expect(w.findAll('h4').map((h: any) => h.text()).join(' ')).toMatch(/（79）|（169）/)
    s.startReview()
    expect(s.reviewSnapshot.length).toBe(249)
  })
})

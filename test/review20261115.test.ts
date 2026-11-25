import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import AppDialog from '../src/components/AppDialog.vue'
import { setToken } from '../src/composables/syncClient'
import { accountNotice, newPasswordProblem, useAuth } from '../src/composables/useAuth'
import {
  chooseDialog,
  confirmDialog,
  dialogQueue,
  registerDialogHost,
  settleDialog,
} from '../src/composables/useDialog'
import { getMockHistory, isUnanswered, saveMockRecord } from '../src/composables/useMockHistory'
import { useMockMistakeSave } from '../src/composables/useMockMistakeSave'
import {
  adoptLegacyGuestPageBookmarks,
  getPageBookmarks,
  migrateGuestPageBookmarks,
  reloadPageBookmarks,
} from '../src/composables/usePageBookmark'
import { useMistakes } from '../src/composables/useStudyData'

const wrappers: any[] = []
const stubs = {
  RouterLink: true,
  ReadingTabs: true,
  ListeningTabs: true,
}
const auth = useAuth()
let offHost: (() => void) | null = null

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  accountNotice.value = ''
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn(),
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  offHost?.()
  offHost = null
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** 模拟 App.vue 里挂着 AppDialog 的情况：弹窗走站内队列，不再退回原生 confirm */
function useHost() {
  offHost = registerDialogHost()
}

async function show(Page: any, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: path.split('?')[0], component: Page },
      {
        path: '/outside',
        component: { template: '<p>outside</p>' },
      },
    ],
  })
  await router.push(path)
  await router.isReady()
  const root = mount(defineComponent({
    render: () => h(RouterView),
  }), {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs,
    },
  })
  wrappers.push(root)
  await flushPromises()
  const state = ((root.findComponent(Page) as any).vm as any).$.setupState
  // 套题是按需 import 的，机器慢时一轮 flushPromises 还没加载完：等到加载结束
  for (let i = 0; i < 100 && (state.loading === true || state.testPair === null); i++) {
    await new Promise(resolve => setTimeout(resolve, 20))
    await flushPromises()
  }
  return { root, state, router }
}

async function mockPage(kind: 'listening' | 'reading') {
  const Page = kind === 'reading'
    ? (await import('../src/pages/mock/reading-test.vue')).default
    : (await import('../src/pages/mock/listening-test.vue')).default
  return {
    Page,
    ...(await show(Page, `/mock/${kind}-test`)),
  }
}

/** 做一份剩余时间为 0 的草稿：开考、答一题、离开，再把存档里的剩余时间改成 0 */
async function expiredDraft(kind: 'listening' | 'reading') {
  const first = await mockPage(kind)
  first.state.startTest()
  first.state.answers.Q1 = 'kept answer'
  await nextTick()
  first.root.unmount()
  wrappers.splice(wrappers.indexOf(first.root), 1)
  let patched = 0
  for (const key of Object.keys(localStorage)) {
    if (!key.includes(`mock_draft_v1_${kind}_`))
      continue
    try {
      const value = JSON.parse(localStorage.getItem(key)!)
      if (value && typeof value === 'object' && 'timeLeft' in value && !value.submitted) {
        localStorage.setItem(key, JSON.stringify({ ...value, timeLeft: 0 }))
        patched++
      }
    }
    catch {}
  }
  expect(patched).toBeGreaterThan(0)
  const again = await mockPage(kind)
  expect(again.state.recovery.draft.value?.timeLeft).toBe(0)
  expect(again.state.recovery.draft.value?.answers.Q1).toBe('kept answer')
  return again
}

describe('dialog outcomes', () => {
  it('distinguishes the cancel button from closing the dialog', async () => {
    useHost()
    const closed = chooseDialog('pick', { cancelText: 'do the other thing' })
    settleDialog(dialogQueue.value[0].id, 'dismiss')
    expect(await closed).toBe('dismiss')
    const cancelled = chooseDialog('pick')
    settleDialog(dialogQueue.value[0].id, 'cancel')
    expect(await cancelled).toBe('cancel')
    const confirm = confirmDialog('sure?')
    settleDialog(dialogQueue.value[0].id, 'dismiss')
    expect(await confirm).toBe(false)
  })

  it('an account switch dismisses every open dialog', async () => {
    useHost()
    const first = confirmDialog('clear alice?')
    const second = chooseDialog('choose for alice')
    auth.currentUser.value = 'bob'
    expect(dialogQueue.value).toEqual([])
    expect(await first).toBe(false)
    expect(await second).toBe('dismiss')
  })

  it('a stale confirm settled after the switch is still treated as dismissed', async () => {
    useHost()
    const pending = confirmDialog('clear?')
    const request = dialogQueue.value[0]
    // 绕过 watch，直接模拟“结算时账号已不同”
    request.owner = 'someone-else'
    settleDialog(request.id, 'confirm')
    expect(await pending).toBe(false)
  })
})

describe('app dialog keyboard behaviour', () => {
  async function mountDialog() {
    const w = mount(AppDialog, { attachTo: document.body })
    wrappers.push(w)
    await nextTick()
    return w
  }
  function press(key: string, shiftKey = false) {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }))
  }

  it('focuses cancel for dangerous actions and keeps Tab inside the dialog', async () => {
    await mountDialog()
    const pending = confirmDialog('delete everything?', { danger: true, confirmText: '清空' })
    await nextTick()
    await nextTick()
    expect(document.activeElement?.textContent?.trim()).toBe('取消')
    press('Tab')
    expect(document.activeElement?.textContent?.trim()).toBe('清空')
    press('Tab')
    expect(document.activeElement?.textContent?.trim()).toBe('取消')
    press('Tab', true)
    expect(document.activeElement?.textContent?.trim()).toBe('清空')
    press('Escape')
    expect(await pending).toBe(false)
    expect(dialogQueue.value).toEqual([])
  })

  it('focuses the confirm button for ordinary confirms', async () => {
    await mountDialog()
    const pending = confirmDialog('continue?', { confirmText: '继续' })
    await nextTick()
    await nextTick()
    expect(document.activeElement?.textContent?.trim()).toBe('继续')
    const focused = document.activeElement as HTMLButtonElement
    focused.click()
    expect(await pending).toBe(true)
  })

  it('clicking the backdrop closes without choosing either button', async () => {
    await mountDialog()
    const pending = chooseDialog('pick', { cancelText: 'other' })
    await nextTick()
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    backdrop.click()
    expect(await pending).toBe('dismiss')
  })
})

describe.each(['listening', 'reading'] as const)('%s expired draft prompt', (kind) => {
  it('closing the prompt keeps the draft untouched', async () => {
    const page = await expiredDraft(kind)
    useHost()
    page.state.startTest()
    expect(dialogQueue.value).toHaveLength(1)
    settleDialog(dialogQueue.value[0].id, 'dismiss')
    await flushPromises()
    expect(page.state.started).toBe(false)
    expect(page.state.recovery.draft.value?.answers.Q1).toBe('kept answer')
    expect(getMockHistory()).toEqual([])
    // 可以再点一次“开始测试”重新选择
    page.state.startTest()
    expect(dialogQueue.value).toHaveLength(1)
    settleDialog(dialogQueue.value[0].id, 'confirm')
    await flushPromises()
    expect(page.state.submitted).toBe(true)
    expect(getMockHistory()).toHaveLength(1)
  })

  it('the cancel button discards the draft and starts fresh', async () => {
    const page = await expiredDraft(kind)
    useHost()
    page.state.startTest()
    settleDialog(dialogQueue.value[0].id, 'cancel')
    await flushPromises()
    expect(page.state.started).toBe(true)
    expect(page.state.answers).toEqual({})
    expect(getMockHistory()).toEqual([])
  })

  it('an account switch while the prompt is open submits nothing for either account', async () => {
    const page = await expiredDraft(kind)
    useHost()
    page.state.startTest()
    auth.currentUser.value = 'bob'
    await flushPromises()
    expect(dialogQueue.value).toEqual([])
    expect(page.state.started).toBe(false)
    expect(page.state.submitted).toBe(false)
    expect(getMockHistory()).toEqual([])
    auth.currentUser.value = 'alice'
    await flushPromises()
    expect(getMockHistory()).toEqual([])
    expect(page.state.recovery.draft.value?.answers.Q1).toBe('kept answer')
  })

  it('a blank submission shows 未作答 and is stored as unanswered', async () => {
    const page = await mockPage(kind)
    page.state.startTest()
    await page.state.submit()
    await flushPromises()
    expect(page.root.find('p.text-4xl').text()).toBe('未作答')
    expect(page.root.text()).not.toContain('预估 Band')
    const [record] = getMockHistory()
    expect(record.answered).toBe(0)
    expect(isUnanswered(record)).toBe(true)
  })
})

it('clearing mock history does not touch another account after a switch', async () => {
  const Page = (await import('../src/pages/mock/history.vue')).default
  auth.currentUser.value = 'bob'
  saveMockRecord({
    id: 'cam21-test1',
    label: 'B',
    kind: 'listening',
    score: 30,
    total: 40,
    band: 7,
  })
  auth.currentUser.value = 'alice'
  saveMockRecord({
    id: 'cam21-test1',
    label: 'A',
    kind: 'listening',
    score: 30,
    total: 40,
    band: 7,
  })
  useHost()
  const page = await show(Page, '/mock/history')
  const clearing = page.state.handleClear()
  expect(dialogQueue.value).toHaveLength(1)
  auth.currentUser.value = 'bob'
  await clearing
  expect(getMockHistory().map(r => r.label)).toEqual(['B'])
  auth.currentUser.value = 'alice'
  expect(getMockHistory().map(r => r.label)).toEqual(['A'])
})

it('the retry banner stays while entries are still unwritten for an attempt marked as written', () => {
  const records = useMistakes()
  const entry = (key: string) => [
    {
      module: 'mock_reading' as const,
      key,
      title: key,
      detail: '',
      hint: '',
    },
  ]
  const saver = useMockMistakeSave()
  saver.save('attempt-1', entry('first'))
  expect(saver.failed.value).toBe(false)
  const set = Storage.prototype.setItem
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.includes('_mistake_parts_v2__entry_'))
      throw new DOMException('fixture', 'QuotaExceededError')
    return set.call(this, key, value)
  })
  saver.save('attempt-1', entry('second'))
  expect(saver.failed.value).toBe(true)
  blocked.mockRestore()
  saver.retry()
  expect(saver.failed.value).toBe(false)
  expect(records.mistakes.value.map(m => m.key).sort()).toEqual(['first', 'second'])
})

it('old guest daily bookmarks stored under a null owner become visible and migrate on login', () => {
  const date = '2026-11-09'
  localStorage.setItem('myielts_page_bookmarks_v1', JSON.stringify({
    [`/reading/daily:${JSON.stringify([date, null])}`]: [
      { id: 'old', y: 800, createdAt: 1 },
    ],
    [`/reading/daily:${JSON.stringify([date, 'device-1'])}`]: [
      { id: 'dup', y: 820, createdAt: 2 },
    ],
  }))
  reloadPageBookmarks()
  adoptLegacyGuestPageBookmarks('device-1')
  // 820 与 800 相距不到 50px：按位置去重，只留一个
  expect(getPageBookmarks(`/reading/daily:${JSON.stringify([date, 'device-1'])}`)).toHaveLength(1)
  expect(getPageBookmarks(`/reading/daily:${JSON.stringify([date, null])}`)).toEqual([])
  // 登录时游客书签（含残留的 null 版）一并迁到账号名下（换一套干净数据）
  localStorage.clear()
  localStorage.setItem('myielts_page_bookmarks_v1', JSON.stringify({
    [`/reading/daily:${JSON.stringify([date, null])}`]: [
      { id: 'old', y: 100, createdAt: 1 },
    ],
    [`/reading/daily:${JSON.stringify([date, 'device-1'])}`]: [
      { id: 'g', y: 900, createdAt: 2 },
    ],
  }))
  reloadPageBookmarks()
  migrateGuestPageBookmarks('device-1', 'alice')
  expect(getPageBookmarks(`/reading/daily:${JSON.stringify([date, 'alice'])}`).map(b => b.y)).toEqual([100, 900])
  expect(getPageBookmarks(`/reading/daily:${JSON.stringify([date, null])}`)).toEqual([])
  expect(getPageBookmarks(`/reading/daily:${JSON.stringify([date, 'device-1'])}`)).toEqual([])
})

it('new passwords count characters by code point and stay within 72 bytes', () => {
  expect(newPasswordProblem('😀😀😀😀')).toMatch(/至少 8 个字符/)
  expect(newPasswordProblem('😀'.repeat(8))).toBeNull()
  expect(newPasswordProblem('密码密码密码密码')).toBeNull()
  expect(newPasswordProblem('a'.repeat(72))).toBeNull()
  expect(newPasswordProblem('a'.repeat(73))).toMatch(/72 字节/)
  expect(newPasswordProblem('😀'.repeat(19))).toMatch(/72 字节/)
})

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import AppDialog from '../src/components/AppDialog.vue'
import { setToken } from '../src/composables/syncClient'
import {
  aiSettingsKey,
  claimLegacyAISettings,
  getAISettings,
  legacyClaimConflicts,
} from '../src/composables/useAISettings'
import { accountNotice, useAuth } from '../src/composables/useAuth'
import {
  confirmDialog,
  dialogQueue,
  dismissDialogsNotOn,
  registerDialogHost,
  settleDialog,
} from '../src/composables/useDialog'
import { getMockHistory, saveMockRecord } from '../src/composables/useMockHistory'
import {
  addPageBookmark,
  getPageBookmarks,
  pageBookmarksState,
  reloadPageBookmarks,
  removePageBookmark,
} from '../src/composables/usePageBookmark'

const wrappers: any[] = []
const stubs = { RouterLink: true, ReadingTabs: true, ListeningTabs: true }
const auth = useAuth()
let offHost: (() => void) | null = null

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
  accountNotice.value = ''
  reloadPageBookmarks()
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

async function show(Page: any, path: string, withDialog = false) {
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
    render: () => h('div', [
      h(RouterView),
      withDialog
        ? h(AppDialog)
        : null,
    ]),
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
  return show(Page, `/mock/${kind}-test`)
}

/** 剩余时间为 0 的草稿（与 review20261115 同一做法） */
async function expiredDraft(kind: 'listening' | 'reading') {
  const first = await mockPage(kind)
  first.state.startTest()
  first.state.answers.Q1 = 'old answer'
  await nextTick()
  first.root.unmount()
  wrappers.splice(wrappers.indexOf(first.root), 1)
  for (const key of Object.keys(localStorage)) {
    if (!key.includes(`mock_draft_v1_${kind}_`))
      continue
    try {
      const value = JSON.parse(localStorage.getItem(key)!)
      if (value && typeof value === 'object' && 'timeLeft' in value && !value.submitted)
        localStorage.setItem(key, JSON.stringify({ ...value, timeLeft: 0 }))
    }
    catch {}
  }
  const again = await mockPage(kind)
  expect(again.state.recovery.draft.value?.answers.Q1).toBe('old answer')
  return again
}

/** 模拟另一页签保存了同一份草稿的新答案 */
function updateDraftElsewhere(versionId: string) {
  const value = JSON.parse(localStorage.getItem(versionId)!)
  localStorage.setItem(versionId, JSON.stringify({
    ...value,
    answers: { ...value.answers, Q1: 'newer answer' },
    revision: (value.revision ?? 0) + 1,
    updatedAt: value.updatedAt + 1000,
    editedAt: (value.editedAt ?? value.updatedAt) + 1000,
  }))
}

describe.each(['listening', 'reading'] as const)('%s expired draft changed in another tab', (kind) => {
  it('submitting re-reads the draft, keeps the newer answers and asks again', async () => {
    const page = await expiredDraft(kind)
    offHost = registerDialogHost()
    const versionId = page.state.recovery.draft.value.versionId
    page.state.startTest()
    updateDraftElsewhere(versionId)
    settleDialog(dialogQueue.value[0].id, 'confirm')
    await flushPromises()
    expect(page.state.submitted).toBe(false)
    expect(getMockHistory()).toEqual([])
    expect(dialogQueue.value.map(d => d.kind)).toEqual(['alert'])
    expect(page.state.recovery.draft.value?.answers.Q1).toBe('newer answer')
    expect(JSON.parse(localStorage.getItem(versionId)!).answers.Q1).toBe('newer answer')
    settleDialog(dialogQueue.value[0].id, 'confirm')
    // 用户看过最新内容后再确认：按最新答案交卷
    page.state.startTest()
    settleDialog(dialogQueue.value[0].id, 'confirm')
    await flushPromises()
    expect(page.state.submitted).toBe(true)
    expect(page.state.answers.Q1).toBe('newer answer')
    expect(getMockHistory()).toHaveLength(1)
  })

  it('discarding re-reads the draft and does not retire newer answers', async () => {
    const page = await expiredDraft(kind)
    offHost = registerDialogHost()
    const versionId = page.state.recovery.draft.value.versionId
    page.state.startTest()
    updateDraftElsewhere(versionId)
    settleDialog(dialogQueue.value[0].id, 'cancel')
    await flushPromises()
    expect(page.state.started).toBe(false)
    expect(Object.keys(localStorage).some(k => k.includes('__completed_'))).toBe(false)
    expect(JSON.parse(localStorage.getItem(versionId)!).answers.Q1).toBe('newer answer')
  })
})

describe('dialogs close when their page is left', () => {
  it('leaving mock history closes its clear dialog without clearing', async () => {
    saveMockRecord({
      id: 'cam21-test1',
      label: 'A',
      kind: 'listening',
      score: 30,
      total: 40,
      band: 7,
    })
    const Page = (await import('../src/pages/mock/history.vue')).default
    const page = await show(Page, '/mock/history', true)
    const clearing = page.state.handleClear()
    await nextTick()
    expect(dialogQueue.value).toHaveLength(1)
    await page.router.push('/outside')
    await flushPromises()
    await clearing
    expect(dialogQueue.value).toEqual([])
    expect(getMockHistory().map(r => r.label)).toEqual(['A'])
  })

  it('only dialogs opened on another path are dismissed', async () => {
    let path = '/a'
    offHost = registerDialogHost(() => path)
    const onA = confirmDialog('on a')
    path = '/b'
    const onB = confirmDialog('on b')
    dismissDialogsNotOn('/b')
    expect(await onA).toBe(false)
    expect(dialogQueue.value.map(d => d.message)).toEqual(['on b'])
    settleDialog(dialogQueue.value[0].id, 'confirm')
    expect(await onB).toBe(true)
  })
})

describe('claiming the old shared AI setting merges keys', () => {
  function setLegacy(value: object) {
    localStorage.setItem('myielts_ai_settings_v1', JSON.stringify(value))
  }
  function setCurrent(value: object) {
    localStorage.setItem(aiSettingsKey('alice'), JSON.stringify(value))
  }

  it('keeps keys of other providers when the chosen provider has none', () => {
    // 当前身份选的是 Hive 但没填 Hive Key，OpenAI 已有 Key（旧界面会认为“没有设置”而直接覆盖）
    setCurrent({
      baseUrl: 'https://api-cdn.thehive.ai/api/v3',
      apiKey: '',
      model: 'deepseek-ai/deepseek-v4.1-flash-1017',
      apiKeys: { openai: 'sk-alice-openai' },
    })
    setLegacy({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-legacy-deepseek', model: 'deepseek-flash' })
    expect(legacyClaimConflicts()).toEqual([])
    expect(claimLegacyAISettings()).toBe('claimed')
    const merged = getAISettings()
    expect(merged.apiKeys).toMatchObject({ openai: 'sk-alice-openai', deepseek: 'sk-legacy-deepseek' })
    // 当前身份没配好：沿用旧设置选中的服务商
    expect(merged.baseUrl).toBe('https://api.deepseek.com')
    expect(merged.apiKey).toBe('sk-legacy-deepseek')
  })

  it('keeps the current provider selection when it is fully configured', () => {
    setCurrent({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-alice-openai', model: 'gpt-4o-mini' })
    setLegacy({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-legacy-deepseek', model: 'deepseek-flash' })
    expect(claimLegacyAISettings()).toBe('claimed')
    const merged = getAISettings()
    expect(merged.baseUrl).toBe('https://api.openai.com/v1')
    expect(merged.apiKey).toBe('sk-alice-openai')
    expect(merged.apiKeys?.deepseek).toBe('sk-legacy-deepseek')
  })

  it('reports a conflict only when the same provider has two different keys', () => {
    setCurrent({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-new-2222', model: 'gpt-4o-mini' })
    setLegacy({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-old-1111', model: 'gpt-4o-mini' })
    const conflicts = legacyClaimConflicts()
    expect(conflicts.map(({ provider, label, legacyTail, currentTail }) => ({
      provider,
      label,
      legacyTail,
      currentTail,
    }))).toEqual([
      {
        provider: 'openai',
        label: 'OpenAI',
        legacyTail: '1111',
        currentTail: '2222',
      },
    ])
    expect(claimLegacyAISettings({ openai: 'current' }, conflicts)).toBe('claimed')
    expect(getAISettings().apiKey).toBe('sk-new-2222')
  })

  it('uses the old key for a conflicting provider when the user picks it', () => {
    setCurrent({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-new-2222', model: 'gpt-4o-mini' })
    setLegacy({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-old-1111', model: 'gpt-4o-mini' })
    expect(claimLegacyAISettings({ openai: 'legacy' }, legacyClaimConflicts())).toBe('claimed')
    expect(getAISettings().apiKey).toBe('sk-old-1111')
    expect(localStorage.getItem('myielts_ai_settings_v1')).toBeNull()
  })
})

describe('bookmarks from two tabs', () => {
  /** 模拟另一个页签：只写它自己那一条书签的 key */
  function otherTabSaves(path: string, id: string, y: number) {
    localStorage.setItem(
      `myielts_page_bookmark_v2:${encodeURIComponent(path)}|${encodeURIComponent(id)}`,
      JSON.stringify({ id, y, createdAt: 2 }),
    )
  }

  it('adding in one tab keeps a bookmark another tab just saved', () => {
    addPageBookmark('/reading/daily:["2026-11-14","alice"]', 100)
    otherTabSaves('/reading/daily:["2026-11-15","alice"]', 'other-tab', 500)
    addPageBookmark('/reading/daily:["2026-11-14","alice"]', 900)
    reloadPageBookmarks()
    expect(getPageBookmarks('/reading/daily:["2026-11-15","alice"]').map(b => b.id)).toEqual(['other-tab'])
    expect(getPageBookmarks('/reading/daily:["2026-11-14","alice"]')).toHaveLength(2)
  })

  it('removing in one tab keeps another tab’s new bookmark on the same page', () => {
    const mine = addPageBookmark('/reading/daily', 100)
    expect(mine).toBeTruthy()
    otherTabSaves('/reading/daily', 'other-tab', 900)
    removePageBookmark('/reading/daily', (mine as { id: string }).id)
    expect(getPageBookmarks('/reading/daily').map(b => b.id)).toEqual(['other-tab'])
  })

  it('follows changes saved by other tabs', () => {
    otherTabSaves('/x', 'a', 1)
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_page_bookmark_v2:%2Fx|a' }))
    expect(pageBookmarksState.value['/x'].map(b => b.id)).toEqual(['a'])
  })

  it('old bookmarks without an id keep a stable id, so they can still be removed', () => {
    localStorage.setItem('myielts_page_bookmarks_v1', JSON.stringify({ '/reading/daily': 1200 }))
    reloadPageBookmarks()
    const [item] = getPageBookmarks('/reading/daily')
    removePageBookmark('/reading/daily', item.id)
    expect(getPageBookmarks('/reading/daily')).toEqual([])
  })
})

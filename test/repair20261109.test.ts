import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { apiPull, collectSyncData, getQuarantinedKeys, handleRejectedKeys, setToken } from '../src/composables/syncClient'
import { useMockMistakeSave } from '../src/composables/useMockMistakeSave'
import { useMistakes } from '../src/composables/useStudyData'
import { accountKey, entryKey, saveValue } from '../src/utils/storage'
import { addPageBookmark, getPageBookmarks, reloadPageBookmarks } from '../src/composables/usePageBookmark'
import * as ai from '../src/composables/useAISettings'

const auth = useAuth()
const wrappers: ReturnType<typeof mount>[] = []
const rect = { left: 50, top: 60, right: 100, bottom: 100, width: 50, height: 40, x: 50, y: 60, toJSON: () => ({}) }
function deferred<T>() {
  let complete!: (v: T) => void
  const promise = new Promise<T>((resolve) => {
    complete = resolve
  })
  return { promise, resolve: complete }
}
async function page(Page: any, path = '/') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: Page }] })
  await router.push(path)
  const w = mount(Page, { attachTo: document.body, global: { plugins: [router], stubs: { RouterLink: true } } })
  wrappers.push(w)
  await flushPromises()
  return { w, s: (w.vm as any).$.setupState }
}
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = null
  auth.currentUser.value = 'alice'
  setToken('audit-only', 'alice')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: null }) })))
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function entries(key: string) {
  return [{ module: 'mock_reading' as const, key, title: key, detail: '', hint: '' }]
}

it('retries both failed mock submissions, including one saved in the old single slot', () => {
  const records = useMistakes()
  localStorage.setItem(accountKey('mock_mistake_pending_v1', 'alice'), JSON.stringify({
    owner: 'alice', attemptId: 'older', entries: entries('first'),
  }))
  const set = Storage.prototype.setItem
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.includes('_mistake_parts_v2__entry_'))
      throw new DOMException('fixture', 'QuotaExceededError')
    return set.call(this, key, value)
  })
  const saver = useMockMistakeSave()
  saver.save('newer', entries('second'))
  expect(saver.failed.value).toBe(true)
  blocked.mockRestore()
  const reentered = useMockMistakeSave()
  auth.currentUser.value = 'bob'
  reentered.retry()
  expect(records.mistakes.value).toHaveLength(0)
  auth.currentUser.value = 'alice'
  reentered.retry()
  saver.retry()
  expect(records.mistakes.value.map(({ key, count }) => [key, count]).sort()).toEqual([['first', 1], ['second', 1]])
  expect(reentered.failed.value).toBe(false)
  expect(localStorage.getItem(accountKey('mock_mistake_pending_v1', 'alice'))).toBeNull()
})

it('resumes new-table quarantines only when their own capability is advertised', async () => {
  const row = entryKey('listening179_done_v1', '100', 'alice')
  const goal = entryKey('study_daily_goal_v1', 'goal', 'alice')
  const invalid = entryKey('listening179_done_v1', '101', 'alice')
  const writing = accountKey('aigrade_v2_test', 'alice')
  for (const key of [row, goal, invalid, writing])
    saveValue(key, {})
  handleRejectedKeys('alice', {
    ok: true,
    rejected: [
      ...[row, goal, writing].map(key => ({ key, reason: 'unknown-base' as const })),
      { key: invalid, reason: 'decode-failed' },
    ],
  })
  const result = { ok: true, data: null, protocolVersion: 2, studyExtensions: true, studyProgressEntries: false }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...result }) })))
  await apiPull('alice')
  expect(getQuarantinedKeys('alice').sort()).toEqual([row, goal, invalid].sort())
  result.studyProgressEntries = true
  await apiPull('alice')
  expect(getQuarantinedKeys('alice')).toEqual([invalid])
  expect(Object.keys(collectSyncData('alice'))).toEqual(expect.arrayContaining([row, goal, writing]))
})

it('renders async word translation, and aborts the old private popup on account changes', async () => {
  const translation = deferred<string>()
  const translate = vi.spyOn(ai, 'translateWithAI').mockReturnValue(translation.promise)
  const { w, s } = await page((await import('../src/pages/reading/daily.vue')).default)
  const done = s.openWordPopup('zzqauditnonword', [], rect)
  await flushPromises()
  expect(w.get('[role=dialog]').find('[role=status]').exists()).toBe(true)
  translation.resolve('测试释义')
  await done
  await nextTick()
  expect(w.get('[role=dialog]').text()).toContain('测试释义')

  const stale = deferred<string>()
  translate.mockReturnValue(stale.promise)
  s.openSelectionPopup('Private vocabulary sentence', rect)
  const pending = s.runAITranslate()
  const signal = translate.mock.calls.at(-1)?.[1]
  auth.currentUser.value = 'bob'
  await nextTick()
  expect(signal?.aborted).toBe(true)
  stale.resolve('旧账号译文')
  await pending
  expect(w.find('[role=dialog]').exists()).toBe(false)
})

it('uses the standard caret method and closes the translation on a date change', async () => {
  const { w, s } = await page((await import('../src/pages/reading/daily.vue')).default)
  const node = document.createTextNode('sample word')
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: () => ({ offsetNode: node, offset: 2 }),
  })
  const range = document.createRange()
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => rect })
  vi.spyOn(document, 'createRange').mockReturnValue(range)
  try {
    expect(s.wordAtPoint(60, 70)?.word).toBe('sample')
    await s.openWordPopup('sample', [{ word: 'sample', meaning: '样本', pos: 'n.' }], rect)
    expect(w.get('[role=dialog]').text()).toContain('样本')
    s.selectedDate = s.dates[1]
    await nextTick()
    expect(w.find('[role=dialog]').exists()).toBe(false)
  }
  finally {
    Reflect.deleteProperty(document, 'caretPositionFromPoint')
  }
})

it('discards a stale AI provider response after editing the Key and accepts a fresh response', async () => {
  const waiting = deferred<ai.AIDetectResult>()
  const detect = vi.spyOn(ai, 'detectAIProvider').mockReturnValueOnce(waiting.promise)
  const { s } = await page((await import('../src/pages/settings.vue')).default)
  s.form.apiKey = 'fake-deepseek-original'
  const done = s.onDetect()
  s.form.apiKey = 'fake-openai-new'
  waiting.resolve({ provider: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' })
  await done
  expect(detect).toHaveBeenCalledWith('fake-deepseek-original')
  expect(s.form.apiKeys?.deepseek).toBeUndefined()
  expect(s.form.baseUrl).not.toBe('https://api.deepseek.com')
  detect.mockResolvedValueOnce({ provider: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' })
  await s.onDetect()
  expect(s.form.apiKeys.openai).toBe('fake-openai-new')
})

it('daily bookmarks follow a paragraph after layout changes and stay scoped to their date', async () => {
  reloadPageBookmarks()
  addPageBookmark('/reading/daily', 1200)
  const { w, s } = await page((await import('../src/pages/reading/daily.vue')).default, '/reading/daily')
  for (let i = 0; i < 30 && s.dailyLoading; i++)
    await flushPromises()
  expect(s.dailyLoading).toBe(false)
  const paragraph = w.get('.passage-text > p').element
  vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue(rect)
  const previous = Object.getOwnPropertyDescriptor(window, 'scrollY')
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 350 })
  try {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    await w.get('button[aria-label="增加书签"]').trigger('click')
    const key = `/reading/daily:${JSON.stringify([s.selectedDate, 'alice'])}`
    expect(getPageBookmarks(key)[0]?.anchor).toEqual({ article: 'news-0', paragraph: 0, offset: 30 })
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue({ ...rect, top: 90, bottom: 130 })
    await w.get('button[aria-label="回到书签 1"]').trigger('click')
    expect(scrollTo).toHaveBeenCalledWith({ top: 380, behavior: 'instant' })
    s.selectedDate = s.dates[1]
    await flushPromises()
    expect(w.find('button[aria-label="回到书签 1"]').exists()).toBe(false)
    await w.get('button[aria-expanded=false]').trigger('click')
    expect(w.find('button[aria-label="回到书签 1"]').exists()).toBe(true)
  }
  finally {
    if (previous)
      Object.defineProperty(window, 'scrollY', previous)
  }
})

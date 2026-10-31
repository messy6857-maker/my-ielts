// Audit-only reproductions: passing assertions describe current defects/limitations.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { accountNotice, useAuth } from '../src/composables/useAuth'
import { setToken } from '../src/composables/syncClient'
import { storageFailures } from '../src/utils/storage'
import * as registry from '../src/pages/mock/registry'
import { useSync } from '../src/composables/useSync'
import { useStudyTimer } from '../src/composables/useStudyTimer'

const auth = useAuth()
const wrappers: any[] = []
beforeEach(() => {
  localStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = 'alice'
  setToken('audit-only-token', 'alice')
  accountNotice.value = ''
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function page(Page: any) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  })
  await router.push('/')
  await router.isReady()
  const w = mount(Page, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        AIGradePanel: true,
        TaskChart: true,
        ReadingTabs: true,
        ListeningTabs: true,
      },
    },
  })
  wrappers.push(w)
  await flushPromises()
  const s = (w.vm as any).$.setupState
  await ready(s)
  return { w, s, router }
}
async function ready(s: any) {
  for (let i = 0; s.loading && i < 80; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
}
it('paper changes reset listening media and hint state', async () => {
  const Page = (await import('../src/pages/mock/listening-test.vue')).default
  const { s, router } = await page(Page)
  s.partImageFailed[1] = true
  s.mediaErrors[1] = 'old paper failed'
  s.mapLabelHints.Q11 = 'old hint'
  await router.replace({ query: { test: 'cam20-test4' } })
  await flushPromises()
  await ready(s)
  expect(s.testPair.id).toBe('cam20-test4')
  expect(s.partImageFailed[1]).toBeUndefined()
  expect(s.mediaErrors[1]).toBeUndefined()
  expect(s.mapLabelHints.Q11).toBeUndefined()
})
it('transcript failures offer a visible retry', async () => {
  vi.spyOn(registry, 'loadMockTranscript').mockResolvedValue(null)
  const Page = (await import('../src/pages/mock/listening-test.vue')).default
  const { s, w } = await page(Page)
  s.startTest()
  await s.submit()
  expect(s.submitted).toBe(true)
  expect(s.testPair.listening.parts.every((p: any) => !p.transcript)).toBe(
    true,
  )
  expect(s.recovery.error.value).toBe('')
  await nextTick()
  expect(w.text()).toContain('脚本加载失败')
})
it('malformed draft dates retain answers with a safe label', async () => {
  localStorage.setItem(
    'myielts_u_alice_mock_draft_v1_reading_cam21-test1__session_old',
    JSON.stringify({
      version: 1,
      kind: 'reading',
      testId: 'cam21-test1',
      answers: {},
      timeLeft: 123,
    }),
  )
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const { s, w } = await page(Page)
  expect(s.recovery.availableDrafts.value).toHaveLength(1)
  s.recovery.selectDraft(s.recovery.availableDrafts.value[0].versionId)
  expect(s.recovery.draft.value).not.toBeNull()
  expect(w.text()).not.toContain('Invalid Date')
})
it('successful pulls reset failure notification suppression', async () => {
  const sync = useSync()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await sync.pullNow()
  expect(accountNotice.value).not.toBe('')
  accountNotice.value = ''
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
      }),
  )
  await sync.pullNow()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await sync.pullNow()
  expect(accountNotice.value).not.toBe('')
})
it('failed synonym imports can be retried', async () => {
  // Run the source function verbatim, substituting only its import dependency.
  // Vue/Vite module mocks do not reliably intercept this SFC dynamic import.
  const source = readFileSync('src/pages/vocabulary/flashcard.vue', 'utf8')
  const body = source
    .match(/function ensureSynonymPos\(\) \{([\s\S]*?)\n\}/)![1]
    .replace('import(\'./synonymPos\')', 'loader()')
  const loader = vi.fn().mockRejectedValue(new Error('audit chunk failure'))
  // eslint-disable-next-line no-new-func
  const ensure = new Function(
    'loader',
    `let synonymPosPromise = null; const synonymPosLazy = { value: null }; const synonymPosError = {value:false}; return function ensureSynonymPos() { ${body} }`,
  )(loader)
  const first = ensure()
  expect(await first).toBeNull()
  expect(await ensure()).toBeNull()
  expect(loader).toHaveBeenCalledTimes(2)
})
it('study timer includes only the unsaved tail once', async () => {
  vi.useFakeTimers()
  const timer = useStudyTimer()
  timer.start()
  await vi.advanceTimersByTimeAsync(15000)
  expect(timer.elapsed.value).toBe(15)
  expect(timer.dailySeconds.value).toBe(15)
  timer.dispose()
})
it('reading highlights keep escaped text safe', async () => {
  const Component = (await import('../src/components/TextHighlights.vue'))
    .default
  const text = '<img src=x onerror=alert(1)> alpha & beta'
  const w = mount(Component, {
    props: { text, words: ['alpha'], marking: true },
  })
  wrappers.push(w)
  expect(w.text()).toBe(text)
  expect(w.find('img').exists()).toBe(false)
  expect(w.findAll('mark')).toHaveLength(1)
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { readDraft } from '../src/utils/drafts'
import { readValue } from '../src/utils/storage'
import { setToken } from '../src/composables/syncClient'

const wrappers: any[] = []
const stubs = {
  RouterLink: true,
  ReadingTabs: true,
  ListeningTabs: true,
  AIGradePanel: true,
  TaskChart: true,
  ModelEssayView: true,
}
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuth().currentUser.value = 'alice'
  setToken('token', 'alice')
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function show(Page: any, options: any = {}) {
  const w = mount(Page, { global: { stubs, ...options.global }, ...options })
  wrappers.push(w)
  return w
}
async function routerFor(Page: any, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component: Page },
      { path: '/outside', component: { template: '<div>outside</div>' } },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  show(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router], stubs },
  })
  await flushPromises()
  return router
}
it('179 checks its final item and accepts lowercase TV/Internet synonyms', async () => {
  const Page = (await import('../src/pages/listening/179practice.vue')).default
  const w = show(Page)
  const state = (w.vm as any).$.setupState
  for (const i of [23, 24, 178]) {
    state.ws[i].form.word = state.ws[i].word
    state.ws[i].form.replaceStr = state.ws[i].replace.join(', ').toLowerCase()
    state.next(i)
    expect(state.ws[i].result.checked).toBe(true)
    expect(state.ws[i].result.errorWords).toEqual([])
  }
})
it('flushes a just-typed writing draft on pagehide without waiting two seconds', async () => {
  const { TASK1_PROMPTS } = await import('../src/pages/writing/task1/prompts')
  const Page = (await import('../src/pages/writing/task1/TaskOne.vue')).default
  const w = show(Page)
  const state = (w.vm as any).$.setupState
  state.startWrite(TASK1_PROMPTS[0])
  state.essayText = 'last keystrokes'
  await nextTick()
  window.dispatchEvent(new Event('pagehide'))
  expect(readDraft('task1', 'alice', TASK1_PROMPTS[0].id)?.text).toBe(
    'last keystrokes',
  )
})
it('switching writing prompts preserves the earlier unfinished draft', async () => {
  const { TASK1_PROMPTS } = await import('../src/pages/writing/task1/prompts')
  const Page = (await import('../src/pages/writing/task1/TaskOne.vue')).default
  const w = show(Page)
  const state = (w.vm as any).$.setupState
  state.startWrite(TASK1_PROMPTS[0])
  state.essayText = 'first answer'
  state.startWrite(TASK1_PROMPTS[1])
  state.essayText = 'second answer'
  window.dispatchEvent(new Event('pagehide'))
  expect(readDraft('task1', 'alice', TASK1_PROMPTS[0].id)?.text).toBe(
    'first answer',
  )
  expect(readDraft('task1', 'alice', TASK1_PROMPTS[1].id)?.text).toBe(
    'second answer',
  )
})
it.each(['reading', 'listening'])(
  'every %s mock leave route asks before discarding answers',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const router = await routerFor(Page, `/mock/${kind}-test`)
    const w = wrappers.at(-1).findComponent(Page)
    const state = (w.vm as any).$.setupState
    state.started = true
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await router.push('/outside')
    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe(`/mock/${kind}-test`)
    confirm.mockReturnValue(true)
    await router.push('/outside')
    expect(router.currentRoute.value.path).toBe('/outside')
  },
)
it('stale cancelled TTS errors cannot clear the next sentence highlight', async () => {
  const Page = (await import('../src/pages/listening/intensive.vue')).default
  const w = show(Page)
  await flushPromises()
  const state = (w.vm as any).$.setupState
  state.transcript = 'Dr. Smith paid 2.50. Meet me at 2:30 tomorrow.'
  await nextTick()
  state.playSentence(0)
  const old = vi.mocked(speechSynthesis.speak).mock.calls[0][0]
  state.playSentence(1)
  old.onerror?.({} as any)
  expect(state.speakingIndex).toBe(1)
  expect(vi.mocked(speechSynthesis.speak).mock.calls[1][0].text).toBe(
    'Meet me at 2:30 tomorrow.',
  )
})
it('word browsing declarations execute inside setup and audio errors are visible', async () => {
  const Page = (await import('../src/pages/vocabulary/index.vue')).default
  const w = show(Page)
  const state = (w.vm as any).$.setupState
  expect(state.managedAudio).toBeDefined()
  expect(w.text()).not.toContain('const managedAudio')
  state.mediaError = '媒体加载失败'
  await nextTick()
  expect(w.text()).toContain('媒体加载失败')
})
it('a late AI response is discarded after the essay changes', async () => {
  const Page = (await import('../src/pages/writing/AIGradePanel.vue')).default
  localStorage.setItem(
    'myielts_ai_settings_v1',
    JSON.stringify({
      baseUrl: 'https://example.test/v1',
      apiKey: 'local-test',
      model: 'model',
    }),
  )
  let deliver!: (v: any) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<any>((resolve) => { deliver = resolve }),
    ),
  )
  const w = show(Page, {
    props: {
      task: 'task1',
      question: 'question',
      essay: 'original '.repeat(30),
    },
  })
  const state = (w.vm as any).$.setupState
  const pending = state.runAIGrade()
  await w.setProps({ essay: 'changed '.repeat(30) })
  const grade = {
    scores: { ta: 6, cc: 6, lr: 6, gra: 6, overall: 6 },
    comments: { ta: 'a', cc: 'b', lr: 'c', gra: 'd' },
    corrections: [],
    suggestion: 'suggestion',
  }
  deliver({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: { choices: [{ message: { content: JSON.stringify(grade) } }] },
    }),
  })
  await pending
  await flushPromises()
  expect(state.aiResult).toBeNull()
  expect(
    Object.keys(localStorage).some(
      k => k.includes('_aigrade_v1_') && readValue(k, null),
    ),
  ).toBe(false)
})
it('speech AI grading is disabled below ten words', async () => {
  localStorage.setItem(
    'myielts_ai_settings_v1',
    JSON.stringify({
      baseUrl: 'https://example.test/v1',
      apiKey: 'local-test',
      model: 'model',
    }),
  )
  const Page = (await import('../src/pages/speaking/AIGradeSpeaking.vue'))
    .default
  const w = show(Page, { props: { question: 'question', transcript: 'hello' } })
  const button = w.findAll('button').find((b: any) => b.text().includes('评分'))
  expect(button).toBeDefined()
  expect(button!.attributes('disabled')).toBeDefined()
  expect(w.text()).toContain('10')
})

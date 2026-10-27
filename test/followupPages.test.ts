import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { accountNotice, useAuth } from '../src/composables/useAuth'
import { setToken } from '../src/composables/syncClient'
import { accountKey, readRecords } from '../src/utils/storage'
import { readDraft, saveDraft } from '../src/utils/drafts'
import { bandScore } from '../src/pages/mock/types'
import { selectionInOneParagraph, splitSentences } from '../src/utils/text'

const wrappers: any[] = []
const stubs = {
  RouterLink: true,
  ReadingTabs: true,
  ListeningTabs: true,
  AIGradePanel: true,
  TaskChart: true,
  ModelEssayView: true,
}
const auth = useAuth()
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
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
  document.body.innerHTML = ''
})
async function show(Page: any, path = '/exercise') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component: Page },
      { path: '/outside', component: { template: '<p>outside</p>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const root = mount(defineComponent({ render: () => h(RouterView) }), {
    attachTo: document.body,
    global: { plugins: [router], stubs },
  })
  wrappers.push(root)
  await flushPromises()
  const state = (root.findComponent(Page).vm as any).$.setupState
  for (let i = 0; state.loading && i < 50; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    await flushPromises()
  }
  expect(state.loading).not.toBe(true)
  return { root, router, w: root.findComponent(Page), state }
}
it.each(['reading', 'listening'])(
  '%s mock keeps interrupted answers under their original identity and resumes them',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    let session = await show(Page, `/mock/${kind}-test`)
    session.state.startTest()
    session.state.answers.Q1 = 'valuable answer'
    session.state.timeLeft = 321
    const otherKey = `${accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')}__session_other`
    localStorage.setItem(otherKey, JSON.stringify({ version: 1, kind, testId: 'cam21-test1', answers: { Q1: 'other tab answer' }, timeLeft: 100, updatedAt: Date.now() + 10000 }))
    // Simulate another tab replacing the token; the authentication storage listener invalidates this account.
    setToken('bob-token', 'bob')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'myielts_sync_token_v1' }),
    )
    await nextTick()
    expect(session.state.answers.Q1).toBe('valuable answer')
    expect(accountNotice.value).toContain('已暂停')
    expect(session.state.recovery.blocked.value).toBe(true)
    session.state.submit()
    expect(readRecords('mock_history_v1', null)).toEqual({})
    session.root.unmount()
    wrappers.splice(wrappers.indexOf(session.root), 1)
    auth.currentUser.value = 'bob'
    const other = await show(Page, `/mock/${kind}-test`)
    expect(other.state.recovery.draft.value).toBeNull()
    other.root.unmount()
    wrappers.splice(wrappers.indexOf(other.root), 1)
    auth.currentUser.value = 'alice'
    setToken('token', 'alice')
    session = await show(Page, `/mock/${kind}-test`)
    expect(session.w.text()).toContain('继续上次作答')
    session.state.startTest()
    expect(session.state.answers.Q1).toBe('valuable answer')
    expect(JSON.parse(localStorage.getItem(otherKey)!).answers.Q1).toBe('other tab answer')
    expect(session.state.timeLeft).toBeGreaterThan(0)
  },
)
it.each(['task1', 'task2'])(
  '%s timed-out drafts can continue without resetting the original clock',
  async (task) => {
    const { TASK1_PROMPTS } = await import('../src/pages/writing/task1/prompts')
    const { CAMBRIDGE_WRITING } = await import('../src/pages/writing/cambridge')
    const prompt
      = task === 'task1'
        ? TASK1_PROMPTS[0]
        : CAMBRIDGE_WRITING.find(p => p.task === 2)!
    saveDraft(task as any, 'alice', {
      promptId: prompt.id,
      text: 'original answer',
      secondsLeft: 0,
    })
    const Page
      = task === 'task1'
        ? (await import('../src/pages/writing/task1/TaskOne.vue')).default
        : (await import('../src/pages/writing/task2/TaskTwo.vue')).default
    let session = await show(Page)
    expect(session.w.get('textarea').attributes('disabled')).toBeDefined()
    session.state.continueOvertime()
    await nextTick()
    expect(session.w.get('textarea').attributes('disabled')).toBeUndefined()
    expect(session.state.essayText).toBe('original answer')
    expect(session.state.secondsLeft).toBe(0)
    session.state.essayText = 'original answer continued'
    window.dispatchEvent(new Event('pagehide'))
    expect(readDraft(task as any, 'alice', prompt.id)?.overtime).toBe(true)
    session.root.unmount()
    wrappers.splice(wrappers.indexOf(session.root), 1)
    session = await show(Page)
    expect(session.state.essayText).toBe('original answer continued')
    expect(session.state.overtime).toBe(true)
    expect(session.state.secondsLeft).toBe(0)
  },
)
it('accepts nested-mark selections within a paragraph and rejects selections spanning paragraphs', () => {
  document.body.innerHTML
    = '<article data-passage><p>First <mark>paragraph</mark> text.</p><p>Second paragraph.</p></article>'
  const paragraphs = document.querySelectorAll('p')
  const range = document.createRange()
  const sel = window.getSelection()!
  range.setStart(paragraphs[0].firstChild!, 0)
  range.setEnd(paragraphs[1].firstChild!, 6)
  sel.removeAllRanges()
  sel.addRange(range)
  expect(selectionInOneParagraph(sel)).toBe(false)
  range.setEnd(paragraphs[0].querySelector('mark')!.firstChild!, 4)
  sel.removeAllRanges()
  sel.addRange(range)
  expect(selectionInOneParagraph(sel)).toBe(true)
})
it('a cross-paragraph highlight gives feedback without adding an invisible entry', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  // Router initialization uses promises, not the exercise countdown.
  const session = await show(Page, '/mock/reading-test')
  vi.useFakeTimers()
  session.state.startTest()
  await nextTick()
  const paragraphs = session.w
    .findAll('[data-passage] p')
    .filter(p => p.text().length > 40)
  expect(paragraphs.length).toBeGreaterThan(1)
  const range = document.createRange()
  const sel = window.getSelection()!
  range.selectNodeContents(paragraphs[0].element)
  range.setEnd(paragraphs[1].element, 1)
  sel.removeAllRanges()
  sel.addRange(range)
  session.state.handleSelect(0)
  vi.advanceTimersByTime(20)
  await nextTick()
  expect(session.w.text()).toContain('同一个段落')
  expect(session.state.selPopup).toBeNull()
  expect(session.state.highlights.size).toBe(0)
})
it('keeps U.S.A. and Ph.D. in their containing sentence', () =>
  expect(
    splitSentences(
      'She has a Ph.D. from the U.S.A. and works here. Another sentence.',
    ),
  ).toEqual([
    'She has a Ph.D. from the U.S.A. and works here.',
    'Another sentence.',
  ]))
it('listening display table and scoring function agree for every raw score', async () => {
  const Page = (await import('../src/pages/listening/index.vue')).default
  const { state } = await show(Page)
  for (let score = 0; score <= 40; score++) {
    const row = state.scoreTable.find(([range]: string[]) => {
      const [min, max] = range.split('-').map(Number)
      return score >= min && score <= max
    })
    expect(Number(row[1])).toBe(bandScore(score))
  }
})
it('keyword searches include replacement words such as TV', async () => {
  const Page = (await import('../src/pages/listening/keyword.vue')).default
  const { state } = await show(Page)
  state.keyword = 'TV'
  await nextTick()
  expect(state.filteredWs.some((x: any) => x.word === 'press')).toBe(true)
})
it('a failed MP3 playback invokes the TTS fallback once, including a later error event', async () => {
  const Page = (await import('../src/pages/listening/179practice.vue')).default
  const { state } = await show(Page)
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
    new Error('missing'),
  )
  state.play('missing word')
  await flushPromises()
  state.audio.onerror?.(new Event('error'))
  expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
})
it('does not attach a late AI grade to a different account', async () => {
  const Page = (await import('../src/pages/writing/AIGradePanel.vue')).default
  localStorage.setItem(
    'myielts_ai_settings_v1',
    JSON.stringify({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test',
      model: 'test',
    }),
  )
  let deliver!: (v: any) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((resolve) => {
          deliver = resolve
        }),
    ),
  )
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const w = mount(Page, {
    props: { task: 'task1', question: 'question', essay: 'word '.repeat(150) },
    global: { plugins: [router] },
  })
  wrappers.push(w)
  const state = (w.vm as any).$.setupState
  const pending = state.runAIGrade()
  auth.currentUser.value = 'bob'
  setToken('bob-token', 'bob')
  await nextTick()
  const grade = {
    scores: { ta: 6, cc: 6, lr: 6, gra: 6, overall: 6 },
    comments: { ta: 'a', cc: 'b', lr: 'c', gra: 'd' },
    corrections: [],
    suggestion: 's',
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
  expect(state.aiResult).toBeNull()
  expect(
    Object.keys(localStorage).some(k => k.includes('_aigrade_v1_')),
  ).toBe(false)
})
it('reading searches find a replacement even when it is absent from the main word', async () => {
  const Page = (await import('../src/pages/reading/index.vue')).default
  const { state } = await show(Page)
  const category = state.ws.find((c: any) =>
    c.words.some(
      (w: any) =>
        w[4]?.length
        && !String(w[1]).toLowerCase().includes(String(w[4][0]).toLowerCase()),
    ),
  )
  const word = category.words.find(
    (w: any) =>
      w[4]?.length
      && !String(w[1]).toLowerCase().includes(String(w[4][0]).toLowerCase()),
  )
  state.keywords[category.title] = word[4][0]
  await nextTick()
  expect(
    state.filteredCats
      .find((c: any) => c.title === category.title)
      .words.some((w: any) => w[0] === word[0]),
  ).toBe(true)
})
it('corpus search keeps the original one-based source row number', async () => {
  const Page = (await import('../src/pages/listening/corpus.vue')).default
  const { state, w } = await show(Page)
  const target = state.curChapter.rows[10]
  const original = state.curChapter.rows.indexOf(target) + 1
  state.keyword = String(Array.isArray(target[0]) ? target[0][0] : target[0])
  await nextTick()
  const index = state.filteredRows.indexOf(target)
  expect(index).toBeGreaterThanOrEqual(0)
  expect(w.findAll('tbody tr')[index].find('td').text()).toBe(String(original))
})
it('intensive listening ignores an older transcript import arriving last', async () => {
  const Page = (await import('../src/pages/listening/intensive.vue')).default
  const { state } = await show(Page)
  let oldDone!: (v: any) => void, newDone!: (v: any) => void
  state.transcriptModules['cam18-test1'] = () =>
    new Promise((resolve) => {
      oldDone = resolve
    })
  state.transcriptModules['cam18-test2'] = () =>
    new Promise((resolve) => {
      newDone = resolve
    })
  const oldRequest = state.loadTranscript()
  state.selectedTest = 'cam18-test2'
  await nextTick()
  newDone({ cam18Test2ListeningTranscript: { part1: 'New transcript.' } })
  await flushPromises()
  oldDone({ cam18Test1ListeningTranscript: { part1: 'Old transcript.' } })
  await oldRequest
  await nextTick()
  expect(state.transcript).toBe('New transcript.')
})
it('speech scoring becomes enabled at exactly ten words', async () => {
  const Page = (await import('../src/pages/speaking/AIGradeSpeaking.vue'))
    .default
  localStorage.setItem(
    'myielts_ai_settings_v1',
    JSON.stringify({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test',
      model: 'test',
    }),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<p/>' } }],
  })
  await router.push('/')
  const w = mount(Page, {
    props: { question: 'question', transcript: 'word '.repeat(9) },
    global: { plugins: [router] },
  })
  wrappers.push(w)
  let button = w.findAll('button').find(b => b.text().includes('评分'))!
  expect(button.attributes('disabled')).toBeDefined()
  await w.setProps({ transcript: 'word '.repeat(10) })
  button = w.findAll('button').find(b => b.text().includes('评分'))!
  expect(button.attributes('disabled')).toBeUndefined()
})
it.each(['reading', 'listening'])(
  '%s mock allows starting after logging in on the start screen',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    auth.currentUser.value = null
    const session = await show(Page, `/mock/${kind}-test`)
    auth.currentUser.value = 'alice'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(false)
    expect(session.state.recovery.error.value).toBe('')
    session.state.startTest()
    await nextTick()
    expect(session.w.html()).not.toContain('▶ 开始测试')
    expect(session.w.html()).not.toContain('继续上次作答')
  },
)
it.each(['reading', 'listening'])(
  '%s mock blocked test switch keeps content and URL on the running test',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const session = await show(Page, `/mock/${kind}-test`)
    session.state.startTest()
    await nextTick()
    const titleBefore = session.w.find('h2').text()
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(true)
    await session.router.push(`/mock/${kind}-test?test=cam21-test2`)
    for (let i = 0; i < 10; i++) {
      await nextTick()
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(session.router.currentRoute.value.query.test).toBe('cam21-test1')
    expect(session.w.find('h2').text()).toBe(titleBefore)
    expect(session.state.recovery.blocked.value).toBe(true)
  },
)
it.each(['reading', 'listening'])(
  '%s mock discard draft restarts fresh instead of resuming',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const session = await show(Page, `/mock/${kind}-test`)
    session.state.startTest()
    session.state.answers.Q1 = 'valuable answer'
    session.root.unmount()
    wrappers.splice(wrappers.indexOf(session.root), 1)
    const again = await show(Page, `/mock/${kind}-test`)
    expect(again.state.recovery.draft.value).not.toBeNull()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    again.state.discardDraftAndStart()
    await nextTick()
    expect(again.state.recovery.draft.value.answers).toEqual({})
    expect(again.w.html()).not.toContain('继续上次作答')
  },
)
it.each(['reading', 'listening'])(
  '%s mock submitted draft is not offered as resumable',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    localStorage.setItem(
      `${accountKey(`mock_draft_v1_${kind}_cam21-test1`, 'alice')}__session_seed`,
      JSON.stringify({
        version: 1,
        kind,
        testId: 'cam21-test1',
        answers: { Q1: 'submitted answer' },
        timeLeft: 100,
        submitted: true,
        updatedAt: Date.now(),
      }),
    )
    const session = await show(Page, `/mock/${kind}-test`)
    expect(session.state.recovery.draft.value.submitted).toBe(true)
    session.state.startTest()
    await nextTick()
    expect(session.state.recovery.draft.value.answers).toEqual({})
    expect(session.state.recovery.draft.value.timeLeft).toBeGreaterThan(100)
  },
)
it.each(['reading', 'listening'])(
  '%s mock pause notice clears when returning to the original identity',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const session = await show(Page, `/mock/${kind}-test`)
    session.state.startTest()
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(true)
    expect(session.state.recovery.error.value).toContain('已暂停')
    auth.currentUser.value = 'alice'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(false)
    expect(session.state.recovery.error.value).toBe('')
    expect(accountNotice.value).toBe('')
  },
)

// ---- 本轮修复回归：阻断解除后计时恢复 / 选项框 / 标题列表 / 输入框 ----
it.each(['reading', 'listening'])(
  '%s mock timer resumes after unblock',
  async (kind) => {
    const Page
      = kind === 'reading'
        ? (await import('../src/pages/mock/reading-test.vue')).default
        : (await import('../src/pages/mock/listening-test.vue')).default
    const session = await show(Page, `/mock/${kind}-test`)
    session.state.startTest()
    auth.currentUser.value = 'bob'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(true)
    const frozen = session.state.timeLeft
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(session.state.timeLeft).toBe(frozen)
    auth.currentUser.value = 'alice'
    await nextTick()
    expect(session.state.recovery.blocked.value).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(session.state.timeLeft).toBeLessThan(frozen)
  },
)

it('listening map-label set shows its options box and allows multi-char input', async () => {
  const Page = (await import('../src/pages/mock/listening-test.vue')).default
  const session = await show(Page, '/mock/listening-test')
  await session.router.push({ query: { test: 'cam20-test2' } })
  // 等切题真正完成：只看 loading 会漏掉 watcher 尚未触发的窗口，
  // 以 testPair.id 为准轮询。
  for (let i = 0; i < 200 && session.state.testPair?.id !== 'cam20-test2'; i++) {
    await nextTick()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  expect(session.state.testPair?.id).toBe('cam20-test2')
  session.state.startTest()
  session.state.activePart = 2
  await nextTick()
  expect(session.w.html()).toContain('The information given about this was too vague.')
  const inputs = session.w.findAll('input[placeholder="输入字母"]')
  expect(inputs.length).toBeGreaterThan(0)
  inputs.forEach((input: any) => expect(input.attributes('maxlength')).toBe('4'))
})

it('cam20-test3 reading shows its heading list', async () => {
  const Page = (await import('../src/pages/mock/reading-test.vue')).default
  const session = await show(Page, '/mock/reading-test')
  await session.router.push({ query: { test: 'cam20-test3' } })
  // 等切题真正完成：只看 loading 会漏掉 watcher 尚未触发的窗口，
  // 以 testPair.id 为准轮询。
  for (let i = 0; i < 200 && session.state.testPair?.id !== 'cam20-test3'; i++) {
    await nextTick()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  expect(session.state.testPair?.id).toBe('cam20-test3')
  session.state.startTest()
  session.state.activePassage = 1
  await nextTick()
  expect(session.w.html()).toContain('标题列表')
  expect(session.w.html()).toContain('Tried and tested solutions')
  expect(session.w.html()).toContain('A warning of further trouble ahead')
})

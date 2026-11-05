import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import routes from 'virtual:generated-pages'
import { useAuth } from '../src/composables/useAuth'
import { collectSyncData, setToken } from '../src/composables/syncClient'
import { useMistakes } from '../src/composables/useStudyData'
import { accountKey, envelope, readValue, saveValue, storageFailures } from '../src/utils/storage'
import { saveAiArchive } from '../src/utils/archives'
import { studyBackup } from '../src/utils/backup'
import { summarizeDictationPart } from '../src/utils/dictationProgress'
import { diffDictation } from '../src/utils/dictationDiff'
import { mockReviewMatches } from '../src/utils/mockMistakes'
import { listWritingDraftSummaries } from '../src/utils/todayTasks'
import * as timings from '../src/pages/listening/timings/loadTimings'
import oldTimings from '../src/pages/listening/timings/cam18-test1.json'
import newTimings from '../src/pages/listening/timings/cam21-test2.json'

const auth = useAuth()
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  storageFailures.value = []
  auth.currentUser.value = 'alice'
  setToken('audit-not-a-real-token', 'alice')
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function defer<T>() {
  let complete!: (v: T) => void
  const promise = new Promise<T>((resolve) => {
    complete = resolve
  })
  return { promise, resolve: complete }
}
async function until(ok: () => boolean) {
  for (let i = 0; i < 80; i++) {
    await flushPromises()
    if (ok())
      return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('fixture not ready')
}
async function page(Page: any, props: Record<string, any> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }] })
  await router.push('/')
  const w = mount(Page, {
    props,
    global: { plugins: [router], stubs: { TextHighlights: true, RouterLink: true, TaskChart: true } },
  })
  wrappers.push(w)
  await flushPromises()
  return { s: (w.vm as any).$.setupState, w, router }
}
const grade = {
  scores: { ta: 6, cc: 6, lr: 6, gra: 6, overall: 6 },
  comments: { ta: 'ta', cc: 'cc', lr: 'lr', gra: 'gra' },
  corrections: [],
  suggestion: 'example',
}

it('a server advertising the new fields reopens only unsupported-format quarantines', async () => {
  const { apiPull, getQuarantinedKeys, handleRejectedKeys } = await import('../src/composables/syncClient')
  const key = accountKey('dictation_progress_v1', 'alice')
  const invalid = accountKey('aigrade_v2_bad', 'alice')
  saveValue(key, { 'cam18-test1:part1': { cursor: 1, sentences: {}, updatedAt: 10 } })
  saveValue(invalid, grade)
  handleRejectedKeys('alice', {
    ok: true,
    rejected: [
      { key, reason: 'unknown-base' },
      { key: invalid, reason: 'decode-failed' },
    ],
  })
  expect(collectSyncData('alice')[key]).toBeUndefined()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, protocolVersion: 2, data: null, studyExtensions: true }),
  })))
  expect((await apiPull('alice')).ok).toBe(true)
  expect(getQuarantinedKeys('alice')).toEqual([invalid])
  expect(collectSyncData('alice')[key]).toBeDefined()
})
it('writing AI v2 archives follow retention and survive sync and backup', () => {
  const k = (i: number) => accountKey(`aigrade_v2_${i.toString(36)}`, 'alice')
  for (let i = 0; i < 35; i++) expect(saveAiArchive(k(i), grade, 'alice')).toBe(true)
  expect(Object.keys(localStorage).filter(key => key.includes('_aigrade_v2_'))).toHaveLength(30)
  const payload = collectSyncData('alice')
  expect(payload[k(34)]).toBeDefined()
  expect(studyBackup('alice').data[k(34)]).toBeDefined()
})
it('opening a legacy AI result works even when a new archive cannot be written', async () => {
  const props = { task: 'task1', question: 'Audit prompt', essay: 'An old local essay' }
  const msg = `${props.task}|${props.question}|${props.essay}`
  let h = 0
  for (const ch of msg) h = ((h << 5) - h + ch.charCodeAt(0)) | 0
  const key = accountKey(`aigrade_v1_${h.toString(36)}`, 'alice')
  saveValue(key, grade)
  const setter = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k.includes('_aigrade_v2_'))
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  const P = (await import('../src/pages/writing/AIGradePanel.vue')).default
  const { w } = await page(P, props)
  expect(envelope(localStorage.getItem(key)!).deleted).not.toBe(true)
  expect(Object.keys(localStorage).some(k => k.includes('_aigrade_v2_'))).toBe(false)
  expect(w.text()).toContain('6')
})
it('home writing draft links target the real writing route and exact draft', async () => {
  for (const task of ['task1', 'task2'])
    localStorage.setItem(accountKey(`${task}_draft_v1`, 'alice'), JSON.stringify({ promptId: 'p1', text: 'a draft', secondsLeft: 200, updatedAt: 100 }))

  const router = createRouter({ history: createMemoryHistory(), routes })
  const summaries = listWritingDraftSummaries('alice')
  expect(summaries).toHaveLength(2)
  for (const draft of summaries) {
    const resolved = router.resolve(draft.path)
    expect(resolved.matched.some(record => record.path === '/writing')).toBe(true)
    expect(resolved.query.prompt).toBe('p1')
    expect(resolved.query.draft).toBe(`${draft.task}_draft_v1`)
    expect(resolved.query.tab).toBe(draft.task === 'task1' ? 'essay-small' : 'essay-big')
  }
})
it('a stale timing fetch cannot replace a different real 33-sentence part', async () => {
  const a = defer<any>()
  const b = defer<any>()
  vi.spyOn(timings, 'loadTestTimings').mockImplementation(id => id === 'cam18-test1' ? a.promise : b.promise)
  const P = (await import('../src/pages/listening/intensive.vue')).default
  const { s } = await page(P)
  s.selectedTest = 'cam21-test2'
  s.selectedPart = 'part2'
  await nextTick()
  b.resolve(newTimings)
  await until(() => !s.loading && !s.timingsLoading)
  expect(s.sentenceEntries.length).toBe(33)
  const i = newTimings.part2.findIndex((t, i) => t[2] === 'ok' && oldTimings.part2[i]?.[2] === 'ok' && t[0] !== oldTimings.part2[i][0])
  expect(i).toBeGreaterThanOrEqual(0)
  expect(s.sentenceTiming(i)).toEqual(newTimings.part2[i])
  a.resolve(oldTimings)
  await flushPromises()
  expect(s.selectedTest).toBe('cam21-test2')
  expect(s.sentenceTiming(i)).toEqual(newTimings.part2[i])
})
it('multi-choice review requires exactly the correct options', () => {
  expect(mockReviewMatches('A. Go by train；C. Book ahead', 'A B C D E')).toBe(false)
  expect(mockReviewMatches('A. Go by train；C. Book ahead', 'C, A')).toBe(true)
  expect(mockReviewMatches('A. Go by train；C. Book ahead', 'Book ahead / go by train')).toBe(true)
})
it('dictation review does not clear a sentence from its first letter', async () => {
  const m = useMistakes()
  const key = 'dictation:cam18-test1:part1:0'
  m.addMistake('dictation', { key, title: 'I can tell you about our afternoon classes.' })
  const P = (await import('../src/pages/mistakes.vue')).default
  const { s } = await page(P)
  s.startReview()
  s.reviewInput = 'I'
  s.submitAnswer()
  expect(s.reviewState).toBe('wrong')
  expect(m.mistakes.value.some(x => x.key === key)).toBe(true)
})
it('dictation distinguishes leading digits and ordinal forms', () => {
  expect(diffDictation('My postcode is 0123.', 'My postcode is 123.').perfect).toBe(false)
  expect(diffDictation('I came first.', 'I came one.').perfect).toBe(false)
  expect(diffDictation('I came first.', 'I came 1st.').perfect).toBe(true)
})
it('dictation summary averages the latest score per sentence', () => {
  const s = summarizeDictationPart({
    cursor: 0,
    updatedAt: 10,
    sentences: {
      0: { attempts: 5, perfect: 1, lastAccuracy: 1, lastAt: 10 },
      1: { attempts: 1, perfect: 0, lastAccuracy: 0, lastAt: 10 },
    },
  })
  expect(s).toEqual({ attempted: 6, perfect: 1, accuracy: 0.5 })
})
it('opening and restarting typing preserves stored progress', async () => {
  const { saveRecord, readRecord } = await import('../src/utils/storage')
  saveRecord('progress_v1', 'typing', { done: 70, total: 100, updatedAt: 1 }, 'alice')
  const P = (await import('../src/pages/vocabulary/typing.vue')).default
  const { s } = await page(P)
  await until(() => !s.chapterLoading && !!s.currentWord)
  s.reset()
  expect(readRecord<any>('progress_v1', 'typing', 'alice')?.done).toBe(70)
})
it('an old typing callback cannot write a mistake or progress into the next account', async () => {
  const P = (await import('../src/pages/vocabulary/typing.vue')).default
  const { s } = await page(P)
  await until(() => !s.chapterLoading && !!s.currentWord)
  const word = s.currentWord
  const m = useMistakes()
  s.handleInput({ target: { value: '#' } })
  s.handleInput({ target: { value: word } })
  auth.currentUser.value = 'bob'
  await new Promise(resolve => setTimeout(resolve, 230))
  expect(m.mistakes.value.some(x => x.key === `typing:${word}`)).toBe(false)
  expect(s.currentWordIndex).toBe(0)
})
it('same-day account switch clears private answers but keeps public answers', async () => {
  const reading = (owner: string) => ({
    title: owner,
    passage: 'sample',
    notes: [],
    questions: [{ q: `${owner} question`, options: ['one', 'two'], answer: owner === 'alice' ? 0 : 1 }],
  })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: any) => ({
    ok: true, json: async () => ({ ok: true, reading: reading(options.headers.Authorization.endsWith('bob') ? 'bob' : 'alice') }),
  })))
  const P = (await import('../src/pages/reading/daily.vue')).default
  const { s, w } = await page(P)
  await until(() => s.myVocabReading?.title === 'alice')
  const key = `${s.selectedDate}-vocab-0`
  s.selectOption(key, 0)
  const publicKey = `${s.selectedDate}-news0-0`
  s.selectOption(publicKey, 0)
  setToken('audit-bob', 'bob')
  auth.currentUser.value = 'bob'
  await until(() => s.myVocabReading?.title === 'bob' && !s.dailyLoading)
  s.selectOption(key, 1)
  expect(s.answers[key]).toBe(1)
  expect(s.answers[publicKey]).toBe(0)
  expect(w.text()).toContain('bob question')
})
it('P2 local speaking self-rubric result is intentionally excluded from normal backup', () => {
  const key = accountKey('speaking_self_rubric_v1_audit', 'alice')
  saveValue(key, { scores: { fluency: 6 }, notes: 'my local note', savedAt: 1 })
  expect(readValue(key, null)).toBeTruthy()
  expect(JSON.stringify(studyBackup('alice'))).not.toContain(key)
})

it.each(['reading', 'listening'])('%s mock protects memory answers on failed save and switches after a successful retry', async (kind) => {
  const P = kind === 'reading'
    ? (await import('../src/pages/mock/reading-test.vue')).default
    : (await import('../src/pages/mock/listening-test.vue')).default
  const { s, router } = await page(P)
  await until(() => !s.loading && !!s.testPair)
  s.startTest()
  expect(s.started).toBe(true)
  const key = Object.keys(localStorage).find(k => k.includes('mock_draft_v1_') && k.includes('__session_'))!
  const durable = localStorage.getItem(key)
  expect(durable).toBeTruthy()
  const setter = Storage.prototype.setItem
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k === key)
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  s.answers.q1 = 'this answer has not reached disk'
  await router.push({ query: { test: 'cam21-test2' } })
  await until(() => !s.loading && s.testId === 'cam21-test1')
  expect(s.started).toBe(true)
  expect(s.answers.q1).toBe('this answer has not reached disk')
  expect(localStorage.getItem(key)).toBe(durable)
  expect(storageFailures.value).toContain(key)
  quota.mockRestore()
  await router.push({ query: { test: 'cam21-test2' } })
  await until(() => !s.loading && s.testId === 'cam21-test2')
  expect(s.answers).toEqual({})
  expect(JSON.parse(localStorage.getItem(key)!).answers.q1).toBe('this answer has not reached disk')
})

it('speaking keeps the active recording when a topic change is cancelled', async () => {
  class FakeRecorder {
    mimeType = 'audio/webm'
    start() {}
    stop() {}
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  const track = { stop: vi.fn() }
  const savedMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
  })
  try {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const P = (await import('../src/pages/speaking/index.vue')).default
    const { s, w } = await page(P)
    const [a, b] = s.p1Filtered
    s.toggleP1(a.id)
    await nextTick()
    await w.findAll('button').find(button => button.text().includes('录音回答'))!.trigger('click')
    await flushPromises()
    const { isRecorderBusy } = await import('../src/composables/useRecorder')
    expect(isRecorderBusy()).toBe(true)
    s.toggleP1(b.id)
    await nextTick()
    expect(confirm).toHaveBeenCalledOnce()
    expect(s.p1Expanded).toBe(a.id)
    expect(track.stop).not.toHaveBeenCalled()
    expect(isRecorderBusy()).toBe(true)
    confirm.mockReturnValue(true)
    s.toggleP1(b.id)
    await nextTick()
    expect(s.p1Expanded).toBe(b.id)
    expect(track.stop).toHaveBeenCalled()
  }
  finally {
    if (savedMediaDevices)
      Object.defineProperty(navigator, 'mediaDevices', savedMediaDevices)
    else delete (navigator as any).mediaDevices
  }
})

it('dictation reports a failed mistake write and allows retry', async () => {
  const P = (await import('../src/pages/listening/intensive.vue')).default
  const { s } = await page(P)
  s.mode = 'dictation'
  await until(() => !s.loading && !s.timingsLoading && !!s.currentDictationEntry)
  const setter = Storage.prototype.setItem
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k.includes('_mistake_parts_v2__entry_'))
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  const m = useMistakes()
  s.dictationInput = 'unrelated answer'
  s.checkDictation()
  expect(s.dictationPerfect).toBe(false)
  s.addDictationMistake()
  expect(s.dictationAddedMistake).toBe(false)
  expect(s.dictationMistakeError).toBe(true)
  expect(m.mistakes.value.some(x => x.key.startsWith('dictation:'))).toBe(false)
  quota.mockRestore()
  s.addDictationMistake()
  expect(s.dictationAddedMistake).toBe(true)
  expect(m.mistakes.value.some(x => x.key.startsWith('dictation:'))).toBe(true)
})

it('a stale 179 audio rejection cannot speak over the next clip', async () => {
  const old = defer<void>()
  let rejectOld!: (reason: Error) => void
  const failing = new Promise<void>((_resolve, reject) => {
    rejectOld = reject
  })
  vi.mocked(HTMLMediaElement.prototype.play)
    .mockImplementationOnce(() => failing)
    .mockImplementationOnce(() => old.promise)
  const spoken: string[] = []
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    constructor(public text: string) {}
  })
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn(u => spoken.push(u.text)),
  })
  const P = (await import('../src/pages/listening/keyword.vue')).default
  const { s } = await page(P)
  s.play('first')
  s.play('second')
  old.resolve(undefined)
  await flushPromises()
  rejectOld(new Error('old media interrupted'))
  await flushPromises()
  expect(spoken).toEqual([])
})

it('the writing grader stops a role phrase at the next independent clause', async () => {
  const { analyzeEssay } = await import('../src/pages/writing/task1/grader')
  expect(analyzeEssay('He worked and students improved.').complexRatio).toBe(0)
  expect(analyzeEssay('He worked as a teacher and students improved.').complexRatio).toBe(0)
})

it('vocabulary grades are disabled while the selected chapter loads', async () => {
  const loader = await import('../src/pages/vocabulary/loadVocabulary')
  const P = (await import('../src/pages/vocabulary/flashcard.vue')).default
  const { s } = await page(P)
  await until(() => s.vocabReady && !!s.current)
  const card = s.current
  const next = loader.listVocabularyChapters().find(c => c !== s.category)!
  const selected = defer<any>()
  vi.spyOn(loader, 'loadVocabularyChapter').mockReturnValueOnce(selected.promise)
  s.category = next
  await nextTick()
  expect(s.vocabReady).toBe(false)
  expect(s.current.id).toBe(card.id)
  s.grade(0)
  expect(useMistakes().mistakes.value.some(x => x.key === `flashcard:${card.id}`)).toBe(false)
  selected.resolve(await loader.loadVocabularyChapter(next))
  await flushPromises()
})

it('opening one legacy writing result keeps unrelated scores in the sync payload', async () => {
  const props = { task: 'task1', question: 'Legacy to v2 migration', essay: 'Open this prior result' }
  const msg = `${props.task}|${props.question}|${props.essay}`
  let h = 0
  for (const ch of msg) h = ((h << 5) - h + ch.charCodeAt(0)) | 0
  const key = accountKey(`aigrade_v1_${h.toString(36)}`, 'alice')
  const unrelated = accountKey('aigrade_speaking_v1_part2_independent', 'alice')
  saveValue(unrelated, { independent: true })
  saveValue(key, grade)
  const P = (await import('../src/pages/writing/AIGradePanel.vue')).default
  await page(P, props)
  expect(envelope(localStorage.getItem(key)!).deleted).not.toBe(true)
  expect(readValue(unrelated, null)).toEqual({ independent: true })
  const payload = collectSyncData('alice')
  expect(localStorage.getItem(unrelated)).not.toBeNull()
  expect(payload[accountKey('archive_retention_v2', 'alice')]).toBeUndefined()
  expect(payload[unrelated]).toBeDefined()
})

it('the old AI watermark cannot erase a preexisting v2 archive, including after backup restoration', async () => {
  const key = accountKey('aigrade_v2_existing', 'alice')
  const marker = accountKey('archive_retention_v2', 'alice')
  const { saveEnvelope } = await import('../src/utils/storage')
  const { previewStudyBackup, restoreStudyBackup } = await import('../src/utils/backup')
  saveEnvelope(key, { __ielts: 2, stamp: [5, 'test'], value: grade })
  saveEnvelope(marker, { __ielts: 2, stamp: [60, 'test'], value: { cutoff: [50, 'test', accountKey('aigrade_v1_legacy', 'alice')] } })
  expect(collectSyncData('alice')[key]).toBeDefined()
  const preview = previewStudyBackup(JSON.stringify(studyBackup('alice')))
  restoreStudyBackup(preview, 'bob')
  expect(collectSyncData('bob')[accountKey('aigrade_v2_existing', 'bob')]).toBeDefined()
})

it('partial mock mistake writes retry only unsaved questions and stay with their owner', async () => {
  const { useMockMistakeSave } = await import('../src/composables/useMockMistakeSave')
  const { hasWrittenMockMistakes } = await import('../src/utils/mockMistakes')
  const records = useMistakes()
  const save = useMockMistakeSave()
  const entries = ['q1', 'q2'].map(key => ({
    module: 'mock_reading' as const, key, title: key, detail: '', hint: '',
  }))
  const setter = Storage.prototype.setItem
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k.includes('_mistake_parts_v2__entry_') && JSON.parse(v).value.key === 'q2')
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  save.save('pending-exam', entries)
  expect(save.failed.value).toBe(true)
  expect(hasWrittenMockMistakes('pending-exam')).toBe(false)
  expect(records.mistakes.value.find(x => x.key === 'q1')?.count).toBe(1)
  quota.mockRestore()
  auth.currentUser.value = 'bob'
  save.retry()
  expect(records.mistakes.value).toHaveLength(0)
  auth.currentUser.value = 'alice'
  save.retry()
  expect(save.failed.value).toBe(false)
  expect(hasWrittenMockMistakes('pending-exam')).toBe(true)
  expect(records.mistakes.value.find(x => x.key === 'q1')?.count).toBe(1)
  expect(records.mistakes.value.find(x => x.key === 'q2')?.count).toBe(1)
})

it('the home draft link restores the specific writing version through the writing page', async () => {
  const { TASK1_PROMPTS } = await import('../src/pages/writing/task1/prompts')
  const [target, other] = TASK1_PROMPTS
  const prefix = accountKey('task1_draft_v1', 'alice')
  for (const [p, text, time] of [[target, 'selected version', 10], [other, 'more recent version', 20]] as const) {
    localStorage.setItem(`${prefix}__prompt_${p.id}__session_test`, JSON.stringify({
      promptId: p.id, text, secondsLeft: 400, updatedAt: time,
    }))
  }
  const router = createRouter({ history: createMemoryHistory(), routes })
  const selected = listWritingDraftSummaries('alice').find(d => d.promptId === target.id)!
  await router.push(selected.path)
  const w = mount({ render: () => h(RouterView) }, {
    global: { plugins: [router], stubs: { TaskChart: true } },
  })
  wrappers.push(w)
  await until(() => w.findAll('textarea').some(t => t.element.value === 'selected version'))
  expect(w.findAll('textarea').some(t => t.element.value === 'more recent version')).toBe(false)
})

it('an ordinary route leave blocks if current exam answers cannot be saved', async () => {
  const P = (await import('../src/pages/mock/reading-test.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/exam', component: P },
      { path: '/outside', component: { render: () => h('div', 'outside') } },
    ],
  })
  await router.push('/exam')
  const w = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  wrappers.push(w)
  const s = (w.findComponent(P).vm as any).$.setupState
  await until(() => !s.loading && !!s.testPair)
  s.startTest()
  s.answers.q1 = 'must stay here'
  const setter = Storage.prototype.setItem
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k.includes('mock_draft_v1_reading_'))
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await router.push('/outside')
  expect(router.currentRoute.value.path).toBe('/exam')
  expect(s.answers.q1).toBe('must stay here')
  quota.mockRestore()
  await router.push('/outside')
  expect(router.currentRoute.value.path).toBe('/outside')
})

it('restoring a different account’s backup does not import its global AI deletion cutoff', async () => {
  const { saveEnvelope } = await import('../src/utils/storage')
  const { previewStudyBackup, restoreStudyBackup } = await import('../src/utils/backup')
  const target = accountKey('aigrade_v2_bob', 'bob')
  const source = accountKey('archive_retention_writing_v3', 'alice')
  saveEnvelope(target, { __ielts: 2, stamp: [5, 'test'], value: grade })
  saveEnvelope(source, { __ielts: 2, stamp: [60, 'test'], value: { cutoff: [50, 'test', accountKey('aigrade_v2_removed', 'alice')] } })
  restoreStudyBackup(previewStudyBackup(JSON.stringify(studyBackup('alice'))), 'bob')
  expect(collectSyncData('bob')[target]).toBeDefined()
  expect(localStorage.getItem(accountKey('archive_retention_writing_v3', 'bob'))).toBeNull()
})

it('a failed typing chapter switch keeps the previous chapter on screen', async () => {
  const loader = await import('../src/pages/vocabulary/loadVocabulary')
  const P = (await import('../src/pages/vocabulary/typing.vue')).default
  const { s } = await page(P)
  await until(() => !s.chapterLoading && s.words.length > 0)
  const firstWord = s.currentWord
  const next = loader.listVocabularyChapters().find(c => c !== s.selectedChapter)!
  vi.spyOn(loader, 'loadVocabularyChapter').mockRejectedValueOnce(new Error('load failed'))
  s.selectedChapter = next
  await until(() => s.chapterError === true)
  expect(s.words.length).toBeGreaterThan(0)
  expect(s.currentWord).toBe(firstWord)
})

it('a failed mock mistake save survives a new save instance and retries', async () => {
  const { useMockMistakeSave } = await import('../src/composables/useMockMistakeSave')
  const { hasWrittenMockMistakes } = await import('../src/utils/mockMistakes')
  const records = useMistakes()
  const entries = ['q1', 'q2'].map(key => ({
    module: 'mock_reading' as const, key, title: key, detail: '', hint: '',
  }))
  const setter = Storage.prototype.setItem
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k.includes('_mistake_parts_v2__entry_') && JSON.parse(v).value.key === 'q2')
      throw new DOMException('full', 'QuotaExceededError')
    return setter.call(this, k, v)
  })
  const first = useMockMistakeSave()
  first.save('pending-exam-remount', entries)
  expect(first.failed.value).toBe(true)
  // 模拟切题/卸载后重建：新实例应从本机存储读回待重试记录。
  const second = useMockMistakeSave()
  expect(second.failed.value).toBe(true)
  quota.mockRestore()
  second.retry()
  expect(second.failed.value).toBe(false)
  expect(hasWrittenMockMistakes('pending-exam-remount')).toBe(true)
  expect(records.mistakes.value.find(x => x.key === 'q1')?.count).toBe(1)
  expect(records.mistakes.value.find(x => x.key === 'q2')?.count).toBe(1)
})

it('a dictation answer survives the current sentence dropping out of the pool', async () => {
  const P = (await import('../src/pages/listening/intensive.vue')).default
  const { s } = await page(P)
  s.mode = 'dictation'
  await until(() => !s.loading && !s.timingsLoading && !!s.currentDictationEntry)
  s.dictationInput = 'some typed answer'
  s.checkDictation()
  expect(s.dictationChecked).toBe(true)
  // 模拟定时重试后当前句被标为 skip：把它从听写池里拿掉。
  const idx = s.currentDictationIdx
  s.partTimings = s.partTimings.map((t: any, i: number) => (i === idx ? [t[0], t[1], 'skip'] : t))
  await until(() => s.dictationChecked === false)
  expect(s.dictationInput).toBe('some typed answer')
})

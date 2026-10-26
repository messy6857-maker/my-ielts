import type { VueWrapper } from '@vue/test-utils'
import type { DraftCollection } from '../src/utils/draftStorage'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('bound credentials', () => {
  it('blocks a stale tab even before a storage event is delivered', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const { useSync } = await import('../src/composables/useSync')
    useAuth().currentUser.value = 'alice'
    setToken('alice-token', 'alice')
    const sync = useSync()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setToken('bob-token', 'bob')
    expect(await sync.pushNow()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not delete Bob shared session when stale Alice logs out', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { getToken, setToken } = await import('../src/composables/syncClient')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    setToken('bob-token', 'bob')
    const session = JSON.stringify({ username: 'bob' })
    localStorage.setItem('myielts_session_v1', session)
    vi.stubGlobal('fetch', vi.fn())
    await auth.logout()
    expect(getToken('bob')).toBe('bob-token')
    expect(localStorage.getItem('myielts_session_v1')).toBe(session)
    expect(auth.currentUser.value).toBeNull()
  })

  it('requires re-login for an old token whose owner cannot be established', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { useSync } = await import('../src/composables/useSync')
    useAuth().currentUser.value = 'alice'
    localStorage.setItem('myielts_sync_token_v1', 'unbound-legacy-token')
    const sync = useSync()
    expect(sync.needsRelogin.value).toBe(true)
    expect(await sync.pushNow()).toBe(false)
  })

  it('does not send an AI request using a different account token', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const { gradeSpeakingWithAI, saveAISettings } = await import('../src/composables/useAISettings')
    useAuth().currentUser.value = 'alice'
    setToken('bob-token', 'bob')
    saveAISettings({ baseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(gradeSpeakingWithAI('fixture question', 'a sufficiently long spoken answer '.repeat(10))).rejects.toThrow('请先登录')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

async function draftStore() {
  const { createAccountData } = await import('../src/composables/useAccountData')
  let store!: ReturnType<typeof createAccountData<DraftCollection>>
  wrappers.push(mount({ setup() { store = createAccountData<DraftCollection>('task1_drafts_v1', () => ({})); return () => null } }))
  return store
}
const essay = (text: string) => ({ text, secondsLeft: 100, updatedAt: 1 })

describe('per-prompt persistence and compatibility', () => {
  it('retains independent records even if the compatibility table is overwritten', async () => {
    const first = await draftStore()
    const second = await draftStore()
    first.state.value.a = essay('first')
    first.flush()
    second.state.value.b = essay('second')
    second.flush()
    // Reproduce an interleaved stale cache write. Per-prompt records survive it.
    localStorage.setItem('myielts_task1_drafts_v1', JSON.stringify({ a: essay('first') }))
    const restored = await draftStore()
    expect(restored.state.value).toEqual({ a: essay('first'), b: essay('second') })
  })

  it('does not resurrect a deleted draft when a stale tab edits another prompt', async () => {
    localStorage.setItem('myielts_task1_drafts_v1', JSON.stringify({ a: essay('legacy') }))
    const first = await draftStore()
    const stale = await draftStore()
    delete first.state.value.a
    first.flush()
    stale.state.value.b = essay('new')
    stale.flush()
    expect((await draftStore()).state.value).toEqual({ b: essay('new') })
  })

  it('merges external draft changes while keeping this tab unsaved edits', async () => {
    const first = await draftStore()
    const second = await draftStore()
    second.state.value.b = essay('unsaved')
    first.state.value.a = essay('external')
    first.flush()
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_task1_drafts_v1', storageArea: localStorage }))
    expect(second.state.value).toEqual({ a: essay('external'), b: essay('unsaved') })
    second.flush()
    expect((await draftStore()).state.value).toEqual({ a: essay('external'), b: essay('unsaved') })
  })

  it('restores a legacy backup over newer per-prompt records', async () => {
    const store = await draftStore()
    store.state.value.a = essay('newer local')
    store.flush()
    const { importBackup } = await import('../src/composables/useBackup')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const result = await importBackup({ size: 100, text: async () => JSON.stringify({ app: 'my-ielts', version: 1, data: { task1_drafts_v1: JSON.stringify({ a: essay('from old backup') }) } }) } as File)
    expect(result.ok).toBe(true)
    expect((await draftStore()).state.value.a.text).toBe('from old backup')
  })

  it('round-trips records and deletion tombstones through portable backup', async () => {
    localStorage.setItem('myielts_task1_drafts_v1', JSON.stringify({ removed: essay('old') }))
    const store = await draftStore()
    delete store.state.value.removed
    store.state.value.kept = essay('current')
    store.flush()
    const { collectBackupData, importBackup } = await import('../src/composables/useBackup')
    const data = collectBackupData()
    localStorage.clear()
    const result = await importBackup({ size: 100, text: async () => JSON.stringify(data) } as File)
    expect(result.ok).toBe(true)
    expect((await draftStore()).state.value).toEqual({ kept: essay('current') })
  })
})

it('keeps the final result of a normal recorder stop, then isolates the next session', async () => {
  const recognizers: { onresult?: ((event: unknown) => void) | null }[] = []
  class Recognition {
    onresult?: ((event: unknown) => void) | null
    start() {}
    stop() {}
    constructor() { recognizers.push(this) }
  }
  class Recorder { start() {}; stop() {} }
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('SpeechRecognition', Recognition)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } })
  const { useRecorder } = await import('../src/composables/useRecorder')
  let recorder!: ReturnType<typeof useRecorder>
  wrappers.push(mount({ setup() { recorder = useRecorder(); return () => null } }))
  await recorder.start()
  recorder.stop()
  const event = { resultIndex: 0, results: [Object.assign([{ transcript: 'current final sentence' }], { isFinal: true })] }
  recognizers[0].onresult?.(event)
  expect(recorder.transcript.value).toBe('current final sentence')
  const queuedOldHandler = recognizers[0].onresult!
  await recorder.start()
  queuedOldHandler(event)
  expect(recorder.transcript.value).toBe('')
})

it('retries a failed lazy writing task load and ignores an obsolete response', async () => {
  const AsyncTask = (await import('../src/pages/writing/AsyncWritingTask.vue')).default
  let finishOld!: (module: { default: { template: string } }) => void
  const pending = vi.fn(() => new Promise<{ default: { template: string } }>(resolve => { finishOld = resolve }))
  const wrapper = mount(AsyncTask, { props: { loader: pending } })
  wrappers.push(wrapper)
  const latest = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: { template: '<div>latest task</div>' } })
  await wrapper.setProps({ loader: latest })
  await flushPromises()
  expect(wrapper.text()).toContain('加载失败')
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('latest task')
  finishOld({ default: { template: '<div>obsolete task</div>' } })
  await flushPromises()
  expect(wrapper.text()).not.toContain('obsolete task')
})

it('persists explicit spelling answers independently of their display label', async () => {
  const { useMistakes } = await import('../src/composables/useStudyData')
  const { collectSyncData } = await import('../src/composables/syncClient')
  const { useAuth } = await import('../src/composables/useAuth')
  useAuth().currentUser.value = 'alice'
  const store = useMistakes()
  store.addMistake('vocabulary', { key: 'vocabulary:20', title: 'UK and US spelling', answers: ['jeopardise', 'jeopardize'] })
  const synced = JSON.parse(collectSyncData('alice').myielts_u_alice_mistakes_v1)
  expect(synced[0].answers).toEqual(['jeopardise', 'jeopardize'])
  const Page = (await import('../src/pages/mistakes.vue')).default
  const wrapper = mount(Page, { global: { stubs: { RouterLink: true } } })
  wrappers.push(wrapper)
  await wrapper.findAll('button').find(b => b.text().includes('开始复习'))!.trigger('click')
  await wrapper.find('input').setValue(' JEOPARDISE ')
  await wrapper.find('input').trigger('keydown', { key: 'Enter' })
  expect(store.totalCount.value).toBe(0)
})

import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import chapter from '../src/data/vocabulary/01.json'

const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('11f1c4f final review probes (expected safe behavior)', () => {
  it('does not upload Alice data using a token replaced by Bob in another tab', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const { useSync } = await import('../src/composables/useSync')
    useAuth().currentUser.value = 'alice'
    setToken('alice-token', 'alice')
    localStorage.setItem('myielts_session_v1', JSON.stringify({ username: 'alice' }))
    localStorage.setItem('myielts_u_alice_task1_drafts_v1', JSON.stringify({ private: { text: 'Alice private essay', secondsLeft: 100, updatedAt: 1 } }))
    const sync = useSync()
    const requests: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      requests.push({ authorization: options.headers.Authorization, data: JSON.parse(options.body).data })
      return { ok: true, json: async () => ({ ok: true }) }
    }))
    // Shared localStorage changes made by a second tab; the first tab keeps its
    // existing reactive account state until it handles the storage event.
    setToken('bob-token', 'bob')
    localStorage.setItem('myielts_session_v1', JSON.stringify({ username: 'bob' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_sync_token_v1', oldValue: 'alice-token', newValue: 'bob-token', storageArea: localStorage }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_session_v1', newValue: JSON.stringify({ username: 'bob' }), storageArea: localStorage }))
    await sync.pushNow()
    // Updating the active identity or blocking the stale tab are both valid.
    const unsafe = requests.filter((r: any) => r.authorization === 'Bearer bob-token' && r.data.myielts_u_alice_task1_drafts_v1)
    expect(unsafe).toEqual([])
  })

  it('accepts a vocabulary spelling variant in the mistake review', async () => {
    const word = chapter.words.flat().find(w => w.id === 20)!
    expect(word.word).toEqual(['jeopardise', 'jeopardize'])
    const { useMistakes } = await import('../src/composables/useStudyData')
    const store = useMistakes()
    store.addMistake('vocabulary', { key: `vocabulary:${word.id}`, title: word.word.join(' / '), detail: word.meaning })
    const Page = (await import('../src/pages/mistakes.vue')).default
    const page = mount(Page, { global: { stubs: { RouterLink: true } } })
    wrappers.push(page)
    await page.findAll('button').find(b => b.text().includes('开始复习'))!.trigger('click')
    await page.find('input').setValue('jeopardize')
    await page.find('input').trigger('keydown', { key: 'Enter' })
    expect(page.text()).toContain('答对了')
    expect(store.totalCount.value).toBe(0)
  })

  it('preserves drafts written by two independent open page stores', async () => {
    const { createAccountData } = await import('../src/composables/useAccountData')
    type Drafts = Record<string, { text: string; secondsLeft: number; updatedAt: number }>
    let first!: ReturnType<typeof createAccountData<Drafts>>
    let second!: ReturnType<typeof createAccountData<Drafts>>
    // Independent stores have the same initial snapshot, as two tabs do.
    wrappers.push(mount({ setup() { first = createAccountData<Drafts>('task1_drafts_v1', () => ({})); return () => null } }))
    wrappers.push(mount({ setup() { second = createAccountData<Drafts>('task1_drafts_v1', () => ({})); return () => null } }))
    first.state.value.promptA = { text: 'essay in tab A', secondsLeft: 100, updatedAt: 1 }
    first.flush()
    window.dispatchEvent(new StorageEvent('storage', { key: 'myielts_task1_drafts_v1', newValue: localStorage.getItem('myielts_task1_drafts_v1'), storageArea: localStorage }))
    second.state.value.promptB = { text: 'essay in tab B', secondsLeft: 100, updatedAt: 2 }
    second.flush()
    const saved = JSON.parse(localStorage.getItem('myielts_task1_drafts_v1')!)
    expect(Object.keys(saved).sort()).toEqual(['promptA', 'promptB'])
  })

  it('ignores a final recognition result from a cleared recording session', async () => {
    const recognizers: any[] = []
    class Recognition {
      onresult: any
      onend: any
      start() {}
      stop() {}
      constructor() { recognizers.push(this) }
    }
    class Recorder { start() {}; stop() {} }
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } })
    vi.stubGlobal('SpeechRecognition', Recognition)
    const { useRecorder } = await import('../src/composables/useRecorder')
    let recorder!: ReturnType<typeof useRecorder>
    wrappers.push(mount({ setup() { recorder = useRecorder(); return () => null } }))
    await recorder.start()
    const oldRecognizer = recognizers[0]
    recorder.clear()
    await recorder.start()
    const result = Object.assign([{ transcript: 'previous answer' }], { isFinal: true })
    // stop() can complete recognition asynchronously, after the next session.
    oldRecognizer.onresult?.({ resultIndex: 0, results: [result] })
    expect(recorder.transcript.value).toBe('')
  })
})

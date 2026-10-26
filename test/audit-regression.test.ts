import { mount } from '@vue/test-utils'
// Regression coverage for the October code audit. All external APIs are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('audit regressions: expected correct behavior', () => {
  it('r01: choosing every option must not earn full marks on Choose TWO', async () => {
    const { multiSelectScore } = await import('../src/pages/mock/types')
    const { cam21Test1Listening } = await import('../src/pages/mock/cam21-test1-listening')
    const q = cam21Test1Listening.parts[2].questions[0]
    expect(multiSelectScore(q, '0,1,2,3,4')).toBe(0)
  })

  it('r02: alice sync must exclude a distinct account alice_bob', async () => {
    const { collectSyncData } = await import('../src/composables/syncClient')
    localStorage.setItem('myielts_u_alice_progress_v1', '{}')
    localStorage.setItem('myielts_u_alice_bob_task1_essays_v1', '["private fixture"]')
    expect(Object.keys(collectSyncData('alice'))).toEqual(['myielts_u_alice_progress_v1'])
  })

  it('r03: mock-history save must notify automatic sync', async () => {
    const { onLocalWrite } = await import('../src/composables/useAuth')
    const { saveMockRecord } = await import('../src/composables/useMockHistory')
    const notify = vi.fn()
    onLocalWrite(notify)
    saveMockRecord({ id: 'fixture', label: 'fixture', kind: 'reading', score: 1, total: 40, band: 2.5 })
    expect(notify).toHaveBeenCalled()
  })

  it('r04: cached deck must persist after first component scope is destroyed', async () => {
    const { useDeckStore } = await import('../src/composables/useDeckStore')
    const first = effectScope()
    let deck: ReturnType<typeof useDeckStore>
    first.run(() => {
      deck = useDeckStore('audit_deck')
    })
    const schedule = { ease: 2.5, interval: 1, dueAt: 100, reps: 1, lapses: 0 }
    deck!.setSchedule('a', schedule)
    await nextTick()
    first.stop()
    const second = effectScope()
    second.run(() => {
      deck = useDeckStore('audit_deck')
    })
    deck!.setSchedule('b', schedule)
    await nextTick()
    second.stop()
    const saved = JSON.parse(localStorage.getItem('myielts_audit_deck_sr_v1') || '{}')
    expect(saved['audit_deck:b']).toEqual(schedule)
  })

  it('r05: home Export Backup button must execute without ReferenceError', async () => {
    vi.useFakeTimers()
    const createURL = vi.fn(() => 'blob:fixture')
    const revokeURL = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createURL
      static revokeObjectURL = revokeURL
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const Home = (await import('../src/pages/index.vue')).default
    const { useProgress } = await import('../src/composables/useStudyData')
    useProgress().setProgress('reading', 1, 40)
    const errors: unknown[] = []
    const wrapper = mount(Home, { global: { stubs: { RouterLink: true }, config: { errorHandler: e => errors.push(e) } } })
    const button = wrapper.findAll('button').find(b => b.text().includes('导出备份'))!
    expect(button).toBeDefined()
    await button.trigger('click')
    wrapper.unmount()
    expect(errors.map(e => String(e))).toEqual([])
    expect(click).toHaveBeenCalledOnce()
    expect(createURL).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(revokeURL).toHaveBeenCalledWith('blob:fixture')
  })

  it('r06: unmounting a recorder must stop its microphone tracks', async () => {
    vi.useFakeTimers()
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) } })
    vi.stubGlobal('MediaRecorder', class {
      mimeType = 'audio/webm'
      onstop: (() => void) | null = null
      start() {}
      stop() { this.onstop?.() }
    })
    const { useRecorder } = await import('../src/composables/useRecorder')
    let recorder: ReturnType<typeof useRecorder>
    const wrapper = mount({
      setup() {
        recorder = useRecorder()
        return {}
      },
      template: '<div />',
    })
    await recorder!.start()
    wrapper.unmount()
    const released = stopTrack.mock.calls.length
    // Manual cleanup of the defective implementation after measuring.
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fixture', revokeObjectURL: vi.fn() })
    recorder!.stop()
    expect(released).toBeGreaterThan(0)
  })

  it('r07: global audio coordination must include detached audio used by pages', async () => {
    const { initSingleAudio, createManagedAudio } = await import('../src/composables/useSingleAudio')
    initSingleAudio()
    const oldAudio = createManagedAudio()
    Object.defineProperty(oldAudio, 'paused', { value: false })
    const pause = vi.spyOn(oldAudio, 'pause').mockImplementation(() => {})
    oldAudio.dispatchEvent(new Event('play'))
    const newAudio = document.createElement('audio')
    document.body.appendChild(newAudio)
    newAudio.dispatchEvent(new Event('play'))
    expect(pause).toHaveBeenCalled()
  })

  it('r08: AI response missing criterion scores must be rejected before rendering', async () => {
    const { setToken } = await import('../src/composables/syncClient')
    setToken('fixture-token')
    const { saveAISettings, gradeEssayWithAI } = await import('../src/composables/useAISettings')
    saveAISettings({ baseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { choices: [{ message: { content: '{"scores":{"overall":6.5}}' } }] } }) })))
    await expect(gradeEssayWithAI('task1', 'fixture question', Array.from({length: 25}).fill('word').join(' '))).rejects.toThrow()
  })

  it('r09: listening 179 audio must resolve under the GitHub Pages project base', async () => {
    const Practice = (await import('../src/pages/listening/179practice.vue')).default
    const original = document.createElement.bind(document)
    const audio = original('audio')
    vi.spyOn(audio, 'play').mockResolvedValue(undefined)
    const wrapper = mount(Practice)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, opts?: ElementCreationOptions) => tag === 'audio' ? audio : original(tag, opts)) as typeof document.createElement)
    await wrapper.findAll('button').find(b => b.text().includes('开始'))!.trigger('click')
    // Assert the requested path before unmount deliberately clears the resource.
    expect(audio.getAttribute('src')).toContain('/179_audios/reserve.mp3')
    const { resolveAudioUrl } = await import('../src/composables/useAudio')
    vi.stubEnv('BASE_URL', './')
    const base = document.createElement('base')
    base.href = 'https://messy6857-maker.github.io/my-ielts/'
    document.head.appendChild(base)
    expect(new URL(resolveAudioUrl('/179_audios/reserve.mp3')).pathname).toContain('/my-ielts/179_audios/')
    base.remove()
    wrapper.unmount()
  })

  it('r10: failed cloud GET must not be treated as an empty cloud and trigger PUT', async () => {
    localStorage.setItem('myielts_u_alice_progress_v1', '{"reading":{"done":1}}')
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      requests.push(`${options.method} ${url}`)
      if (url.endsWith('/login'))
        return { ok: true, status: 200, json: async () => ({ ok: true, token: 'fixture-token' }) }
      if (options.method === 'GET')
        return { ok: false, status: 500, json: async () => ({ ok: false, message: 'fixture read failure' }) }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }))
    const { useAuth } = await import('../src/composables/useAuth')
    await useAuth().login('alice', 'fixture-password', true)
    expect(requests.filter(r => r.startsWith('PUT '))).toEqual([])
  })
})

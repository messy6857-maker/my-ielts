import { mount } from '@vue/test-utils'
// Regression coverage for the seven follow-up audit findings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('additional review regressions', () => {
  it('sync must upload edits made while the previous upload is pending', async () => {
    vi.useFakeTimers()
    const { useAuth, writeJson } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    useAuth().currentUser.value = 'alice'
    setToken('fixture', 'alice')
    let finish!: (value: unknown) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    })).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { useSync } = await import('../src/composables/useSync')
    useSync().ensureWired()
    writeJson('myielts_u_alice_progress_v1', { reading: { done: 1, total: 40, updatedAt: 1 } })
    await vi.advanceTimersByTimeAsync(8000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    writeJson('myielts_u_alice_progress_v1', { reading: { done: 2, total: 40, updatedAt: 2 } })
    finish({ ok: true, json: async () => ({ ok: true }) })
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(8000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(JSON.parse(body.data.myielts_u_alice_progress_v1).reading.done).toBe(2)
  })

  it('vocabulary daily count must reset at midnight without an account switch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59))
    localStorage.setItem('myielts_flashcard_daily_new_v1', JSON.stringify({ date: '2026-10-26', count: 30 }))
    const { useDailyGoal } = await import('../src/composables/useSpacedRepetition')
    const daily = useDailyGoal()
    vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1))
    daily.recordNewWord()
    expect(daily.dailyCount.value).toBe(1)
  })

  it('shared deck daily count must reset at midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59))
    localStorage.setItem('myielts_listening179_daily_new_v1', JSON.stringify({ date: '2026-10-26', count: 30 }))
    const { useDeckStore } = await import('../src/composables/useDeckStore')
    const daily = useDeckStore('listening179')
    vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1))
    daily.recordNewWord()
    expect(daily.dailyCount.value).toBe(1)
  })

  it('logging out during study must settle elapsed time to the original account', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    const { useStudyTimer, getDeviceId } = await import('../src/composables/useStudyTimer')
    let timer!: ReturnType<typeof useStudyTimer>
    const wrapper = mount({
      setup() {
        timer = useStudyTimer()
        return {}
      },
      template: '<div />',
    })
    timer.start()
    await vi.advanceTimersByTimeAsync(60000)
    auth.currentUser.value = null
    await nextTick()
    wrapper.unmount()
    const key = `myielts_u_alice_study_time_v1_${getDeviceId()}`
    expect(JSON.parse(localStorage.getItem(key) || '{"seconds":0}').seconds).toBe(60)
  })

  it('midnight study settlement must not copy yesterday total into today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 50))
    const { useStudyTimer, getDeviceId } = await import('../src/composables/useStudyTimer')
    const key = `myielts_study_time_v1_${getDeviceId()}`
    localStorage.setItem(key, JSON.stringify({ date: '2026-10-26', seconds: 1000 }))
    let timer!: ReturnType<typeof useStudyTimer>
    const wrapper = mount({
      setup() {
        timer = useStudyTimer()
        return {}
      },
      template: '<div />',
    })
    timer.start()
    await vi.advanceTimersByTimeAsync(20000)
    timer.pause()
    wrapper.unmount()
    expect(JSON.parse(localStorage.getItem(key)!).seconds).toBe(10)
  })

  it('backup import must reject JSON values with invalid module shapes', async () => {
    const { importBackup } = await import('../src/composables/useBackup')
    const file = { size: 100, text: async () => JSON.stringify({ app: 'my-ielts', version: 1, data: { mistakes_v1: 'null' } }) } as File
    expect((await importBackup(file)).ok).toBe(false)
  })

  it('cloud import must reject malformed module shapes before writing', async () => {
    const { applySyncData } = await import('../src/composables/syncClient')
    expect(() => applySyncData({ myielts_u_alice_mistakes_v1: 'null' }, 'alice')).toThrow()
  })

  it('typing must cancel a pending next-word callback after the input becomes wrong', async () => {
    vi.useFakeTimers()
    const vocabulary = (await import('../src/pages/vocabulary/vocabulary')).default as any
    const first = vocabulary[Object.keys(vocabulary)[0]].words.flat()[0].word[0]
    const Typing = (await import('../src/pages/vocabulary/typing.vue')).default
    const { useProgress } = await import('../src/composables/useStudyData')
    const wrapper = mount(Typing)
    await vi.dynamicImportSettled()
    await nextTick()
    await wrapper.find('input[type="text"]').setValue(first)
    await wrapper.find('input[type="text"]').setValue(`${first}x`)
    await vi.advanceTimersByTimeAsync(200)
    const done = useProgress().getProgress('typing').done
    wrapper.unmount()
    expect(done).toBe(0)
  })

  it('typing must cancel a pending next-word callback after unmount', async () => {
    vi.useFakeTimers()
    const vocabulary = (await import('../src/pages/vocabulary/vocabulary')).default as any
    const first = vocabulary[Object.keys(vocabulary)[0]].words.flat()[0].word[0]
    const Typing = (await import('../src/pages/vocabulary/typing.vue')).default
    const { useProgress } = await import('../src/composables/useStudyData')
    const wrapper = mount(Typing)
    await vi.dynamicImportSettled()
    await nextTick()
    await wrapper.find('input[type="text"]').setValue(first)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(200)
    expect(useProgress().getProgress('typing').done).toBe(0)
  })

  it('timer migration must retain legacy data when the replacement write fails', async () => {
    const { useStudyTimer } = await import('../src/composables/useStudyTimer')
    const now = new Date()
    const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    localStorage.setItem('myielts_device_id', 'fixture-device')
    const original = JSON.stringify({ date, seconds: 1000 })
    localStorage.setItem('myielts_study_time_v1', original)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('fixture quota')
    })
    let timer!: ReturnType<typeof useStudyTimer>
    const wrapper = mount({
      setup() {
        timer = useStudyTimer()
        return {}
      },
      template: '<div />',
    })
    timer.start()
    wrapper.unmount()
    expect(localStorage.getItem('myielts_study_time_v1')).toBe(original)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function response(ok = true) {
  return { ok, json: async () => ({ ok }) }
}

describe('Upload coordination', () => {
  it('coalesces manual pushes and ignores a response from the previous account', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    useAuth().currentUser.value = 'alice'
    setToken('alice-token')
    let finish!: (result: ReturnType<typeof response>) => void
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { useSync } = await import('../src/composables/useSync')
    const sync = useSync()
    const first = sync.pushNow()
    expect(sync.pushNow()).toBe(first)
    await Promise.resolve()
    await Promise.resolve()
    useAuth().currentUser.value = 'bob'
    setToken('bob-token')
    finish(response())
    expect(await first).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(sync.status.value).toBe('idle')
    expect(sync.lastSyncAt.value).toBe(0)
  })

  it('serializes API uploads under the credential captured when called', async () => {
    const { apiPush, setToken } = await import('../src/composables/syncClient')
    setToken('alice-token')
    let finish!: (result: ReturnType<typeof response>) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    })).mockResolvedValue(response())
    vi.stubGlobal('fetch', fetchMock)
    const first = apiPush({ first: '{}' })
    const second = apiPush({ second: '{}' })
    setToken('bob-token')
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledOnce()
    finish(response())
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer alice-token')
  })

  it('retains edits after an upload error so a retry sends the latest snapshot', async () => {
    const { useAuth, writeJson } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    useAuth().currentUser.value = 'alice'
    setToken('fixture')
    const fetchMock = vi.fn().mockResolvedValueOnce(response(false)).mockResolvedValue(response())
    vi.stubGlobal('fetch', fetchMock)
    const { useSync } = await import('../src/composables/useSync')
    const sync = useSync()
    sync.ensureWired()
    writeJson('myielts_u_alice_progress_v1', {})
    expect(await sync.pushNow()).toBe(false)
    expect(sync.status.value).toBe('error')
    expect(await sync.pushNow()).toBe(true)
    expect(sync.status.value).toBe('ok')
    useAuth().currentUser.value = null
  })
})

describe('Account and date boundaries', () => {
  it('includes the settled timer in the logout upload and stops the session', async () => {
    vi.useFakeTimers()
    const { useAuth } = await import('../src/composables/useAuth')
    const { setToken } = await import('../src/composables/syncClient')
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    setToken('fixture')
    const fetchMock = vi.fn().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetchMock)
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
    await auth.logout()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const key = `myielts_u_alice_study_time_v1_${getDeviceId()}`
    expect(JSON.parse(body.data[key]).seconds).toBe(60)
    expect(timer.running.value).toBe(false)
    expect(auth.currentUser.value).toBeNull()
    wrapper.unmount()
    expect(localStorage.getItem(`myielts_study_time_v1_${getDeviceId()}`)).toBeNull()
  })

  it('refreshes cached daily quotas at midnight without recording a new word', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59))
    localStorage.setItem('myielts_flashcard_daily_new_v1', JSON.stringify({ date: '2026-10-26', count: 30 }))
    const { useDailyGoal } = await import('../src/composables/useSpacedRepetition')
    const daily = useDailyGoal()
    expect(daily.remaining.value).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(daily.dailyCount.value).toBe(0)
    expect(daily.remaining.value).toBe(30)
  })

  it('does not reset another account daily counter during a midnight switch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59))
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    const { useDailyGoal } = await import('../src/composables/useSpacedRepetition')
    const { useDeckStore } = await import('../src/composables/useDeckStore')
    useDailyGoal()
    const deck = useDeckStore('listening179')
    localStorage.setItem('myielts_u_bob_listening179_daily_new_v1', JSON.stringify({ date: '2026-10-27', count: 12 }))
    vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1))
    useAuth().currentUser.value = 'bob'
    expect(deck.dailyCount.value).toBe(12)
  })
})

describe('Study data validation', () => {
  it('keeps malformed stored mistakes and progress from crashing the app', async () => {
    localStorage.setItem('myielts_mistakes_v1', 'null')
    localStorage.setItem('myielts_progress_v1', '{"reading":null}')
    const { useMistakes, useProgress } = await import('../src/composables/useStudyData')
    expect(useMistakes().totalCount.value).toBe(0)
    expect(useProgress().getProgress('reading').done).toBe(0)
    expect(localStorage.getItem('myielts_mistakes_v1')).toBe('null')
  })

  it.each([
    ['mistakes_v1', '[null]'],
    ['progress_v1', '{"reading":{"done":10,"total":1,"updatedAt":1}}'],
    ['flashcard_daily_goal_v1', '0'],
    ['flashcard_daily_new_v1', '{"date":"2026-10-26","count":-1}'],
    ['sr_vocabulary_v1', '{"word":null}'],
    ['task1_essays_v1', '[{"overall":"6"}]'],
    ['study_time_v1', '{"date":"2026-10-26","seconds":-1}'],
    ['mock_history_v1', '[{}]'],
  ])('rejects malformed %s before any cloud data is written', async (base, value) => {
    const { applySyncData } = await import('../src/composables/syncClient')
    expect(() => applySyncData({ myielts_u_alice_progress_v1: '{}', [`myielts_u_alice_${base}`]: value }, 'alice')).toThrow()
    expect(localStorage.length).toBe(0)
  })

  it('accepts valid legacy Task 2 cache fields', async () => {
    const { parseStudyValue } = await import('../src/utils/studySchema')
    const grade = {
      scores: { tr: 6, cc: 6, lr: 6, gra: 6, overall: 6 },
      comments: { tr: 'task', cc: 'cc', lr: 'lr', gra: 'gra' },
      advice: { tr: 'task', cc: 'cc', lr: 'lr', gra: 'gra' },
      corrections: [],
      suggestion: 'fixture',
    }
    expect(() => parseStudyValue('aigrade_v1_fixture', JSON.stringify(grade))).not.toThrow()
  })
})

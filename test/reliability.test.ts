import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.head.querySelectorAll('base').forEach(base => base.remove())
})

function fileWith(data: unknown): File {
  return { size: 100, text: async () => JSON.stringify(data) } as File
}

function backup(data: Record<string, string>) {
  return { app: 'my-ielts', version: 1, data }
}

function response(ok: boolean, data: unknown) {
  return { ok, status: ok ? 200 : 500, json: async () => data }
}

describe('Sync boundaries and failure handling', () => {
  it('HTTP failure takes precedence over a JSON ok flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(false, { ok: true })))
    const { apiPull } = await import('../src/composables/syncClient')
    expect((await apiPull()).ok).toBe(false)
  })

  it('failed login sync preserves the previous token and account', async () => {
    const { setToken, getToken } = await import('../src/composables/syncClient')
    const { useAuth } = await import('../src/composables/useAuth')
    setToken('old-token')
    useAuth().currentUser.value = 'old_user'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/login')
      ? response(true, { ok: true, token: 'new-token' })
      : response(false, { ok: false })))
    expect((await useAuth().login('new_user', 'fixture', true)).ok).toBe(false)
    expect(getToken()).toBe('old-token')
    expect(useAuth().currentUser.value).toBe('old_user')
  })

  it('failed initial upload is not reported as successful login', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/login'))
        return response(true, { ok: true, token: 'fixture' })
      return options.method === 'GET' ? response(true, { ok: true, data: {} }) : response(false, { ok: false })
    }))
    const { useAuth } = await import('../src/composables/useAuth')
    expect((await useAuth().login('alice', 'fixture', true)).ok).toBe(false)
    expect(useAuth().currentUser.value).toBeNull()
  })

  it('missing cloud data is an error, not permission to overwrite it', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      calls.push(options.method!)
      return url.endsWith('/login') ? response(true, { ok: true, token: 'fixture' }) : response(true, { ok: true })
    }))
    const { useAuth } = await import('../src/composables/useAuth')
    expect((await useAuth().login('alice', 'fixture', true)).ok).toBe(false)
    expect(calls).toEqual(['POST', 'GET'])
  })

  it('underscore usernames keep their existing keys without matching their parent', async () => {
    const { collectSyncData } = await import('../src/composables/syncClient')
    localStorage.setItem('myielts_u_alice_bob_progress_v1', '{}')
    expect(Object.keys(collectSyncData('alice_bob'))).toEqual(['myielts_u_alice_bob_progress_v1'])
    expect(collectSyncData('alice')).toEqual({})
  })

  it('sync collection excludes credentials and unknown module suffixes', async () => {
    const { collectSyncData } = await import('../src/composables/syncClient')
    localStorage.setItem('myielts_sync_token_v1', 'fixture')
    localStorage.setItem('myielts_u_alice_ai_settings_v1', '{}')
    localStorage.setItem('myielts_u_alice_study_time_v1_device-1', '{}')
    expect(Object.keys(collectSyncData('alice'))).toEqual(['myielts_u_alice_study_time_v1_device-1'])
  })

  it('sync import validates the entire payload before writing', async () => {
    const { applySyncData } = await import('../src/composables/syncClient')
    expect(() => applySyncData({
      myielts_u_alice_progress_v1: '{}',
      myielts_u_alice_bob_progress_v1: '{}',
    }, 'alice')).toThrow()
    expect(localStorage.length).toBe(0)
  })

  it('valid sync data imports only the specified account', async () => {
    const { applySyncData } = await import('../src/composables/syncClient')
    localStorage.setItem('myielts_u_bob_progress_v1', '{"old":true}')
    expect(applySyncData({ myielts_u_alice_progress_v1: '{}' }, 'alice')).toBe(1)
    expect(localStorage.getItem('myielts_u_bob_progress_v1')).toBe('{"old":true}')
  })
})

describe('Portable backups', () => {
  it('exports the current account, excluding other accounts and secrets', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    localStorage.setItem('myielts_u_alice_progress_v1', '{}')
    localStorage.setItem('myielts_u_alice_bob_progress_v1', '{}')
    localStorage.setItem('myielts_ai_settings_v1', '{"apiKey":"fixture"}')
    const { collectBackupData } = await import('../src/composables/useBackup')
    expect(collectBackupData().data).toEqual({ progress_v1: '{}' })
  })

  it('guest export excludes account data', async () => {
    localStorage.setItem('myielts_progress_v1', '{}')
    localStorage.setItem('myielts_u_alice_progress_v1', '{}')
    const { collectBackupData } = await import('../src/composables/useBackup')
    expect(collectBackupData().data).toEqual({ progress_v1: '{}' })
  })

  it('restores module data into the currently selected account and notifies sync', async () => {
    const { useAuth, onLocalWrite } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    const notify = vi.fn()
    onLocalWrite(notify)
    const { importBackup } = await import('../src/composables/useBackup')
    expect((await importBackup(fileWith(backup({ mistakes_v1: '[]' })))).ok).toBe(true)
    expect(localStorage.getItem('myielts_u_alice_mistakes_v1')).toBe('[]')
    expect(notify).toHaveBeenCalledOnce()
  })

  it('rejects unknown keys before importing any module', async () => {
    const { importBackup } = await import('../src/composables/useBackup')
    expect((await importBackup(fileWith(backup({ progress_v1: '{}', sync_token_v1: '"fixture"' })))).ok).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('rejects malformed JSON module values before importing any module', async () => {
    const { importBackup } = await import('../src/composables/useBackup')
    expect((await importBackup(fileWith(backup({ progress_v1: '{}', mistakes_v1: 'invalid' })))).ok).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('keeps existing data when overwrite confirmation is cancelled', async () => {
    localStorage.setItem('myielts_progress_v1', '{"original":true}')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { importBackup } = await import('../src/composables/useBackup')
    expect((await importBackup(fileWith(backup({ progress_v1: '{}' })))).ok).toBe(false)
    expect(localStorage.getItem('myielts_progress_v1')).toBe('{"original":true}')
  })

  it('rolls back a partial import if storage fills up', async () => {
    localStorage.setItem('myielts_progress_v1', '{"original":true}')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const original = Storage.prototype.setItem
    let writes = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (++writes === 2)
        throw new Error('fixture quota')
      return original.call(this, key, value)
    })
    const { importBackup } = await import('../src/composables/useBackup')
    expect((await importBackup(fileWith(backup({ progress_v1: '{}', mistakes_v1: '[]' })))).ok).toBe(false)
    expect(localStorage.getItem('myielts_progress_v1')).toBe('{"original":true}')
    expect(localStorage.getItem('myielts_mistakes_v1')).toBeNull()
  })

  it('rejects a backup if the account changes during file reading', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    useAuth().currentUser.value = 'alice'
    let resolveRead!: (text: string) => void
    const file = {
      size: 1,
      text: () => new Promise<string>((resolve) => {
        resolveRead = resolve
      }),
    } as File
    const { importBackup } = await import('../src/composables/useBackup')
    const pending = importBackup(file)
    useAuth().currentUser.value = 'bob'
    resolveRead(JSON.stringify(backup({ progress_v1: '{}' })))
    expect((await pending).ok).toBe(false)
    expect(localStorage.length).toBe(0)
  })
})

describe('Study lifecycle and scoring', () => {
  it('migrates legacy visitor history without assigning it to a future guest account', async () => {
    localStorage.setItem('myielts_u_guest_mock_history_v1', '[{"id":"fixture"}]')
    const { getMockHistory } = await import('../src/composables/useMockHistory')
    expect(getMockHistory()[0].id).toBe('fixture')
    expect(localStorage.getItem('myielts_mock_history_v1')).toBe('[{"id":"fixture"}]')
    expect(localStorage.getItem('myielts_u_guest_mock_history_v1')).toBeNull()
  })

  it('does not migrate a real guest account history into visitor mode', async () => {
    localStorage.setItem('myielts_users_v1', '{"guest":{"hash":"fixture"}}')
    localStorage.setItem('myielts_u_guest_mock_history_v1', '[{"id":"fixture"}]')
    const { getMockHistory } = await import('../src/composables/useMockHistory')
    expect(getMockHistory()).toEqual([])
    expect(localStorage.getItem('myielts_u_guest_mock_history_v1')).not.toBeNull()
  })
  it('clearing mock history persists an empty list and marks sync dirty', async () => {
    const { onLocalWrite } = await import('../src/composables/useAuth')
    const { clearMockHistory } = await import('../src/composables/useMockHistory')
    const notify = vi.fn()
    onLocalWrite(notify)
    clearMockHistory()
    expect(localStorage.getItem('myielts_mock_history_v1')).toBe('[]')
    expect(notify).toHaveBeenCalledOnce()
  })

  it('cached deck keeps switching accounts after its initial page is gone', async () => {
    const { useAuth } = await import('../src/composables/useAuth')
    const { useDeckStore } = await import('../src/composables/useDeckStore')
    localStorage.setItem('myielts_u_alice_listening179_daily_goal_v1', '12')
    localStorage.setItem('myielts_u_bob_listening179_daily_goal_v1', '34')
    useAuth().currentUser.value = 'alice'
    const scope = effectScope()
    const deck = scope.run(() => useDeckStore('listening179'))!
    expect(deck.goal.value).toBe(12)
    scope.stop()
    useAuth().currentUser.value = 'bob'
    await nextTick()
    expect(deck.goal.value).toBe(34)
  })

  it('valid partial multi-select answers retain partial credit, invalid indices get zero', async () => {
    const { multiSelectScore } = await import('../src/pages/mock/types')
    const q = { id: 'fixture', type: 'multi-select' as const, question: 'Choose TWO', options: ['A', 'B', 'C'], answer: [0, 2] }
    expect(multiSelectScore(q, '0,1')).toBe(1)
    expect(multiSelectScore(q, '0,2')).toBe(2)
    expect(multiSelectScore(q, '0,99')).toBe(0)
    expect(multiSelectScore(q, '0,0')).toBe(1)
  })

  it('microphone permission resolving after unmount releases the acquired stream', async () => {
    let resolveStream!: (stream: MediaStream) => void
    const stop = vi.fn()
    const old = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => new Promise<MediaStream>((resolve) => {
          resolveStream = resolve
        }),
      },
    })
    const { useRecorder } = await import('../src/composables/useRecorder')
    let recorder!: ReturnType<typeof useRecorder>
    const wrapper = mount({
      setup() {
        recorder = useRecorder()
        return {}
      },
      template: '<div />',
    })
    const pending = recorder.start()
    wrapper.unmount()
    resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    expect(await pending).toBe(false)
    expect(stop).toHaveBeenCalledOnce()
    if (old)
      Object.defineProperty(navigator, 'mediaDevices', old)
    else
      Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  it('absolute external audio URLs are not prefixed with the site base', async () => {
    const { resolveAudioUrl } = await import('../src/composables/useAudio')
    const url = 'https://dict.youdao.com/dictvoice?audio=word&type=1'
    expect(resolveAudioUrl(url)).toBe(url)
  })
})

describe('AI response schemas', () => {
  function essay() {
    return {
      scores: { tr: 6, cc: 6.5, lr: 7, gra: 6, overall: 6.5 },
      comments: { tr: 'task', cc: 'cohesion', lr: 'lexical', gra: 'grammar' },
      advice: { tr: 'task advice', cc: 'cc', lr: 'lr', gra: 'gra' },
      corrections: [],
      suggestion: 'fixture',
      rewritten: 'fixture',
    }
  }

  it('normalizes Task 2 scores, comments and advice without mutating the input', async () => {
    const { parseAIGradeResult } = await import('../src/utils/aiSchema')
    const original = essay()
    const result = parseAIGradeResult(original, 'task2')
    expect(result.scores.ta).toBe(6)
    expect(result.comments.ta).toBe('task')
    expect(result.advice?.ta).toBe('task advice')
    expect(original.scores.tr).toBe(6)
  })

  it('rejects out-of-range and non-numeric scores', async () => {
    const { parseAIGradeResult } = await import('../src/utils/aiSchema')
    expect(() => parseAIGradeResult({ ...essay(), scores: { ...essay().scores, overall: 100 } }, 'task2')).toThrow()
    expect(() => parseAIGradeResult({ ...essay(), scores: { ...essay().scores, cc: '6.5' } }, 'task2')).toThrow()
  })

  it('rejects malformed corrections and missing speaking criteria', async () => {
    const { parseAIGradeResult, parseAISpeakingResult } = await import('../src/utils/aiSchema')
    expect(() => parseAIGradeResult({ ...essay(), corrections: [{ original: 'fixture' }] }, 'task2')).toThrow()
    expect(() => parseAISpeakingResult({ scores: { overall: 6 } })).toThrow()
  })
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import { useSync } from '../src/composables/useSync'
import { setToken } from '../src/composables/syncClient'

const auth = useAuth()
const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
  })
  vi.stubGlobal('fetch', fetchMock)
  auth.currentUser.value = 'alice'
  setToken('token', 'alice')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function putCalls() {
  return fetchMock.mock.calls.filter(([, init]: any) => init?.method === 'PUT')
}

it('拉取成功且有 pending 时，8 秒后补推一次', async () => {
  localStorage.setItem('myielts_sync_pending_push:alice', '1')
  expect(await useSync().pullNow()).toBe(true)
  expect(putCalls().length).toBe(0)
  await vi.advanceTimersByTimeAsync(8000)
  expect(putCalls().length).toBe(1)
  expect(localStorage.getItem('myielts_sync_pending_push:alice')).toBeNull()
})

it('拉取成功但无 pending 时，不额外补推', async () => {
  expect(await useSync().pullNow()).toBe(true)
  await vi.advanceTimersByTimeAsync(8000)
  expect(putCalls().length).toBe(0)
})

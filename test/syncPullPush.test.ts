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

it('same-user token rotation mid-upload does not interrupt the push (M8)', async () => {
  const { apiPush } = await import('../src/composables/syncClient')
  const big = 'x'.repeat(30000)
  const data: Record<string, string> = {}
  for (let i = 0; i < 10; i++)
    data[`k${i}`] = big
  let puts = 0
  fetchMock.mockImplementation(async (_url: string, init: any) => {
    if (init?.method === 'PUT') {
      puts++
      if (puts === 1)
        setToken('token-rotated', 'alice') // 同用户换 token，继续传
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, protocolVersion: 2, data: {} }) }
  })
  const result = await apiPush(data, 'alice')
  expect(result.ok).toBe(true)
  expect(putCalls().length).toBe(2)
})

it('switching to another user mid-upload stops the push (M8)', async () => {
  const { apiPush } = await import('../src/composables/syncClient')
  const big = 'x'.repeat(30000)
  const data: Record<string, string> = {}
  for (let i = 0; i < 10; i++)
    data[`k${i}`] = big
  let puts = 0
  fetchMock.mockImplementation(async (_url: string, init: any) => {
    if (init?.method === 'PUT') {
      puts++
      if (puts === 1)
        setToken('bob-token', 'bob') // 切到另一账号，必须中断
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, protocolVersion: 2, data: {} }) }
  })
  const result = await apiPush(data, 'alice')
  expect(result.ok).toBe(false)
  expect(result.status).toBe(401)
  expect(putCalls().length).toBe(1)
})

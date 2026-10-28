import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import {
  apiPush,
  applySyncData,
  collectSyncData,
  getQuarantinedKeys,
  getRejectedReason,
  handleRejectedKeys,
  quarantineKeys,
  rejectedKeysOf,
  setToken,
  syncTimeoutMs,
} from '../src/composables/syncClient'
import {
  entryKey,
  envelope,
  saveEnvelope,
  saveValue,
} from '../src/utils/storage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('同步超时随 body 缩放', () => {
  it('基础 30 秒，每 MB 加 10 秒，上限 300 秒', () => {
    expect(syncTimeoutMs(0)).toBe(30000)
    expect(syncTimeoutMs(1)).toBe(40000)
    expect(syncTimeoutMs(1048576)).toBe(40000)
    expect(syncTimeoutMs(5 * 1048576)).toBe(80000)
    expect(syncTimeoutMs(100 * 1048576)).toBe(300000)
  })
})

describe('rejected 兼容与隔离', () => {
  it('rejectedKeysOf 兼容 string[] 旧形状与对象新形状', () => {
    expect(
      rejectedKeysOf([
        'a',
        { key: 'b', reason: 'non-string' },
        { key: 'c' },
        // 旧服务端不会发这种条目，防御性过滤，不抛错。
        null as any,
        { key: 42 } as any,
      ]),
    ).toEqual(['a', 'b', 'c'])
  })
  it('handleRejectedKeys 隔离两种形状并记录原因，失败推送不隔离', () => {
    expect(handleRejectedKeys('alice', { ok: true, rejected: ['k1'] })).toBe(true)
    expect(getQuarantinedKeys('alice')).toEqual(['k1'])
    expect(getRejectedReason('alice', 'k1')).toBeNull()
    expect(
      handleRejectedKeys('alice', {
        ok: true,
        rejected: [
          { key: 'k2', reason: 'decode-failed' },
          { key: 'k3', reason: 'unknown-base' },
        ],
      }),
    ).toBe(true)
    expect(getQuarantinedKeys('alice')).toEqual(['k1', 'k2', 'k3'])
    expect(getRejectedReason('alice', 'k2')).toBe('decode-failed')
    expect(getRejectedReason('alice', 'k3')).toBe('unknown-base')
    expect(handleRejectedKeys('alice', { ok: false, rejected: ['k4'] })).toBe(false)
    expect(getQuarantinedKeys('alice')).not.toContain('k4')
  })
  it('隔离键跳过上传，本地重写后自动解封', () => {
    const key = entryKey('progress_v1', 'word1', 'alice')
    saveValue(key, { done: 1 })
    quarantineKeys('alice', [key])
    expect(collectSyncData('alice')[key]).toBeUndefined()
    expect(getQuarantinedKeys('alice')).toEqual([key])
    saveValue(key, { done: 2 })
    expect(collectSyncData('alice')[key]).toBeDefined()
    expect(getQuarantinedKeys('alice')).toEqual([])
  })
})

describe('stamp-0 legacy 种子键合并', () => {
  it('stats 种子按每项取大合并', () => {
    const key = entryKey('stats_parts_v2', 'legacy', 'alice')
    saveEnvelope(key, {
      __ielts: 2,
      stamp: [0, 'legacy'],
      value: {
        totals: { vocabulary: { known: 3, vague: 0, unknown: 0 } },
        days: {},
      },
    }, 'local')
    applySyncData({
      [key]: JSON.stringify({
        __ielts: 2,
        stamp: [0, 'legacy'],
        value: {
          totals: { vocabulary: { known: 5, vague: 2, unknown: 0 } },
          days: {},
        },
      }),
    }, 'alice')
    const merged = envelope(localStorage.getItem(key)!).value as any
    expect(merged.totals.vocabulary).toEqual({ known: 5, vague: 2, unknown: 0 })
  })
  it('mistake 种子 count 取大、firstAt 取小、lastAt 取大', () => {
    const key = entryKey('mistake_parts_v2', 'vocabulary:apple|legacy', 'alice')
    saveEnvelope(key, {
      __ielts: 2,
      stamp: [0, 'legacy'],
      value: { count: 2, firstAt: 100, lastAt: 200 },
    }, 'local')
    applySyncData({
      [key]: JSON.stringify({
        __ielts: 2,
        stamp: [0, 'legacy'],
        value: { count: 5, firstAt: 50, lastAt: 150 },
      }),
    }, 'alice')
    const merged = envelope(localStorage.getItem(key)!).value as any
    expect(merged).toEqual({ count: 5, firstAt: 50, lastAt: 200 })
  })
})

describe('apiPush 探针与退出推送', () => {
  function mockSyncFetch(probeData: Record<string, string>) {
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      if (init?.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, protocolVersion: 2, data: probeData }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, protocolVersion: 2, data: {}, rejected: [] }),
      }
    })
  }
  it('探针拉取结果顺手应用，不丢弃 data', async () => {
    setToken('probe-token', 'carol')
    const remoteKey = entryKey('progress_v1', 'remote-word', 'carol')
    mockSyncFetch({
      [remoteKey]: JSON.stringify({
        __ielts: 2,
        stamp: [5000, 'other'],
        value: { done: 7 },
      }),
    })
    const result = await apiPush({}, 'carol')
    expect(result.ok).toBe(true)
    const stored = envelope(localStorage.getItem(remoteKey)!)
    expect(stored.stamp).toEqual([5000, 'other'])
    expect((stored.value as any).done).toBe(7)
  })
  it('退出推送全量成功且无 rejected 时清 pending', async () => {
    const auth = useAuth()
    auth.currentUser.value = 'alice'
    setToken('logout-token', 'alice')
    localStorage.setItem('myielts_sync_pending_push:alice', '1')
    mockSyncFetch({})
    const { pushOk } = await auth.logout()
    expect(pushOk).toBe(true)
    expect(localStorage.getItem('myielts_sync_pending_push:alice')).toBeNull()
    expect(auth.currentUser.value).toBeNull()
  })
})

describe('时钟下限持久化', () => {
  it('快钟拉取后重载，本地写仍能赢', async () => {
    const fast = Date.now() + 10 * 60 * 1000
    saveEnvelope('myielts_u_dave_progress_v1', {
      __ielts: 2,
      stamp: [fast, 'fast-device'],
      value: {},
    }, 'remote')
    expect(localStorage.getItem('myielts_clock_floor_v1')).toBe(String(fast))
    // 模拟重载：模块状态归零，但 localStorage 里的下限还在。
    vi.resetModules()
    const fresh = await import('../src/utils/storage')
    fresh.saveValue('myielts_u_dave_progress_v1', { done: 1 })
    const stamp = fresh.envelope(
      localStorage.getItem('myielts_u_dave_progress_v1')!,
    ).stamp[0]
    expect(stamp).toBeGreaterThan(fast)
  })
})

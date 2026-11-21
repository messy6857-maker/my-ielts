import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiPush,
  getQuarantinedKeys,
  getRejectedReason,
  handleRejectedKeys,
  setToken,
} from '../src/composables/syncClient'
import { pastCutoff } from '../src/utils/archives'
import { mergeEntry } from '../src/utils/entryMerge'
import { compareStamp, entryKey, saveValue } from '../src/utils/storage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('写入者 ID 比较不受设备语言影响', () => {
  // 丹麦语把 "aa" 当成 "å"，排在 z 之后。
  const native = String.prototype.localeCompare
  function useDanishLocale() {
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(
      function (this: string, that: string) {
        return native.call(this, that, 'da')
      },
    )
  }
  const aa = 'aaf9e9ba-2347-45b3-9454-5a67f573194a'
  const b = 'b714144d-b039-4597-8414-0b30e4f3d8bc'
  const env = (writer: string, value: unknown) => ({
    __ielts: 2 as const,
    stamp: [1000, writer] as [number, string],
    value,
  })

  it('compareStamp 按码元顺序判胜', () => {
    useDanishLocale()
    expect('aa'.localeCompare('b')).toBeGreaterThan(0)
    expect(compareStamp(env(aa, 1), env(b, 2))).toBeLessThan(0)
    expect(compareStamp(env(b, 2), env(aa, 1))).toBeGreaterThan(0)
  })

  it('同毫秒冲突合并在丹麦语设备上与其他设备结果一致', () => {
    useDanishLocale()
    expect(mergeEntry('progress_v1', env(aa, 'A'), env(b, 'B')).value).toBe('B')
    expect(mergeEntry('progress_v1', env(b, 'B'), env(aa, 'A')).value).toBe('B')
  })

  it('pastCutoff 的写入者比较同样不受语言影响', () => {
    useDanishLocale()
    expect(pastCutoff('k', env(aa, 1), [1000, b, 'k'])).toBe(true)
    expect(pastCutoff('k', env(b, 1), [1000, aa, 'k'])).toBe(false)
  })
})

describe('单条记录 413 不再卡死整次上传', () => {
  it('跳过并隔离该条，其余照常上传', async () => {
    setToken('t', 'dave')
    const big = entryKey('typing_ignore_case_v2', 'x', 'dave')
    const small = entryKey('dictation_progress_v1', 'y', 'dave')
    saveValue(big, true)
    saveValue(small, { n: 1 })
    const data = {
      [big]: localStorage.getItem(big)!,
      [small]: localStorage.getItem(small)!,
    }
    const uploaded: string[] = []
    vi.stubGlobal('fetch', async (_url: any, init: any) => {
      if (init?.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, protocolVersion: 2, data: {} }),
        }
      }
      const keys = Object.keys(JSON.parse(init.body).data)
      if (keys.includes(big)) {
        return {
          ok: false,
          status: 413,
          json: async () => ({ ok: false, message: 'too large' }),
        }
      }
      uploaded.push(...keys)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          protocolVersion: 2,
          data: {},
          rejected: [],
        }),
      }
    })
    const result = await apiPush(data, 'dave')
    expect(result.ok).toBe(true)
    expect(uploaded).toEqual([small])
    expect(handleRejectedKeys('dave', result)).toBe(true)
    expect(getQuarantinedKeys('dave')).toEqual([big])
    expect(getRejectedReason('dave', big)).toBe('entry-too-large')
  })
})

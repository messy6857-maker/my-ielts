import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  batchStorage,
  saveEnvelope,
  saveValue,
  subscribeStorage,
} from '../src/utils/storage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

function batchSources(work: () => void) {
  const seen: Array<'local' | 'remote'> = []
  const off = subscribeStorage((_key, source) => seen.push(source))
  try {
    batchStorage(work)
  }
  finally {
    off()
  }
  return seen
}

describe('批来源 remote 优先', () => {
  it('批内先 remote 写、后 local marker 写，批通知仍为 remote', () => {
    const seen = batchSources(() => {
      saveEnvelope('myielts_u_alice_progress_v1', {
        __ielts: 2,
        stamp: [1, 'a'],
        value: {},
      }, 'remote')
      saveValue('myielts_probe_marker_v1', { cutoff: 1 })
    })
    expect(seen).toEqual(['remote'])
  })
  it('批内先 local 写、后 remote 写，批通知为 remote', () => {
    const seen = batchSources(() => {
      saveValue('myielts_probe_marker_v1', { cutoff: 1 })
      saveEnvelope('myielts_u_alice_progress_v1', {
        __ielts: 2,
        stamp: [1, 'a'],
        value: {},
      }, 'remote')
    })
    expect(seen).toEqual(['remote'])
  })
  it('纯本地批通知仍为 local，不误报 remote', () => {
    const seen = batchSources(() => {
      saveValue('myielts_probe_marker_v1', { cutoff: 1 })
    })
    expect(seen).toEqual(['local'])
  })
})

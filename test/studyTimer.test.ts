import { describe, expect, it } from 'vitest'
import { DAILY_STUDY_GOAL, deviceTimerKey, formatClock, formatDuration, getDeviceId, sumDeviceTimerRecords } from '../src/composables/useStudyTimer'

describe('学习计时', () => {
  it('每日目标为 2 小时', () => {
    expect(DAILY_STUDY_GOAL).toBe(7200)
  })

  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0 秒')
    expect(formatDuration(45)).toBe('45 秒')
    expect(formatDuration(90)).toBe('1 分钟')
    expect(formatDuration(1500)).toBe('25 分钟')
    expect(formatDuration(3720)).toBe('1 小时 2 分钟')
    expect(formatDuration(7200)).toBe('2 小时 0 分钟')
  })

  it('formatClock', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(754)).toBe('12:34')
  })
})

describe('跨设备计时合并', () => {
  it('deviceTimerKey 在账号 key 后追加设备 id', () => {
    expect(deviceTimerKey('myielts_u_messy_study_time_v1', 'abc123'))
      .toBe('myielts_u_messy_study_time_v1_abc123')
  })

  it('sumDeviceTimerRecords 只汇总当日秒数', () => {
    const records = [
      { date: '2026-10-18', seconds: 1800 }, // 本设备
      { date: '2026-10-18', seconds: 1200 }, // 手机
      { date: '2026-10-17', seconds: 7200 }, // 昨天的不计
    ]
    expect(sumDeviceTimerRecords(records, '2026-10-18')).toBe(3000)
    expect(sumDeviceTimerRecords(records, '2026-10-17')).toBe(7200)
  })

  it('sumDeviceTimerRecords 负数和非法值按 0 处理', () => {
    const records = [
      { date: '2026-10-18', seconds: -50 },
      { date: '2026-10-18', seconds: Number.NaN },
      { date: '2026-10-18', seconds: 61.7 },
    ]
    expect(sumDeviceTimerRecords(records, '2026-10-18')).toBe(62)
  })

  it('getDeviceId 稳定且各存储独立', () => {
    const storeA = new Map<string, string>()
    const storageA = { getItem: (k: string) => storeA.get(k) ?? null, setItem: (k: string, v: string) => { storeA.set(k, v) } }
    const first = getDeviceId(storageA)
    expect(first.length).toBeGreaterThan(0)
    expect(getDeviceId(storageA)).toBe(first) // 同设备再次读取不变
    const storeB = new Map<string, string>()
    const storageB = { getItem: (k: string) => storeB.get(k) ?? null, setItem: (k: string, v: string) => { storeB.set(k, v) } }
    expect(getDeviceId(storageB)).not.toBe(first) // 不同设备不同 id
  })
})

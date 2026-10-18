import { describe, expect, it } from 'vitest'
import { DAILY_STUDY_GOAL, formatClock, formatDuration } from '../src/composables/useStudyTimer'

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

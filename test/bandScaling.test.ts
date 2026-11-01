import { expect, it } from 'vitest'
import { bandScore } from '../src/pages/mock/types'

// 非 40 分卷的 band 缩放公式防护：当前实现用 Math.ceil(base/40*t) 缩放
// 阈值。本用例只锁定该公式不被静默改动，不声称与官方换算表对照——
// 仓内没有非 40 分卷的官方换算表，官方表对照仍是开放项。
it('非 40 分卷按 ceil 缩放阈值（公式防护，非官方表对照）', () => {
  expect(bandScore(30, 30)).toBe(9)
  expect(bandScore(29, 30)).toBeLessThan(9)
  expect(bandScore(28, 30)).toBe(8.5)
  expect(bandScore(23, 30)).toBe(7)
  expect(bandScore(12, 30)).toBe(5)
})

it('非 40 分卷换算仍单调', () => {
  let previous = 0
  for (let i = 0; i <= 30; i++) {
    const band = bandScore(i, 30)
    expect(band).toBeGreaterThanOrEqual(previous)
    previous = band
  }
})

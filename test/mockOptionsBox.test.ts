import type { MockQuestion } from '~/pages/mock/types'
import { describe, expect, it } from 'vitest'
import { showOptionsBox } from '~/pages/mock/types'

function q(id: string, type: MockQuestion['type'], options?: string[]): MockQuestion {
  return {
    id,
    type,
    question: id,
    options,
    answer: 0,
  }
}

describe('showOptionsBox（选项框按题组只渲染一次）', () => {
  it('同一选项内容的连续 map-label 组只在首题出框', () => {
    const box = ['Alpha', 'Beta', 'Gamma']
    const qs = [
      q('Q21', 'map-label', [...box]),
      q('Q22', 'map-label', [...box]),
      q('Q23', 'map-label', [...box]),
    ]
    expect(showOptionsBox(qs, 0)).toBe(true)
    expect(showOptionsBox(qs, 1)).toBe(false)
    expect(showOptionsBox(qs, 2)).toBe(false)
  })

  it('选项内容变化、上一题非 map-label 或无选项时重新出框', () => {
    const qs = [
      q('Q1', 'map-label', ['A1', 'A2']),
      q('Q2', 'map-label', ['B1', 'B2']),
      q('Q3', 'multiple-choice', ['B1', 'B2']),
      q('Q4', 'map-label', ['B1', 'B2']),
      q('Q5', 'fill-blank'),
      q('Q6', 'map-label', ['C1']),
    ]
    expect(showOptionsBox(qs, 1)).toBe(true) // 内容变化
    expect(showOptionsBox(qs, 3)).toBe(true) // 上一题非 map-label
    expect(showOptionsBox(qs, 5)).toBe(true) // 上一题无选项
  })

  it('非 map-label、无选项、越界一律不出框', () => {
    const qs = [
      q('Q1', 'multiple-choice', ['A', 'B']),
      q('Q2', 'map-label'),
    ]
    expect(showOptionsBox(qs, 0)).toBe(false)
    expect(showOptionsBox(qs, 1)).toBe(false)
    expect(showOptionsBox(qs, 2)).toBe(false)
    expect(showOptionsBox([], 0)).toBe(false)
  })
})

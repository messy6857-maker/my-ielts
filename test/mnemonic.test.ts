import { describe, expect, it } from 'vitest'
import { getMnemonic } from '../src/pages/vocabulary/mnemonics'

describe('getMnemonic', () => {
  it('手写巧记优先', () => {
    const r = getMnemonic('pest', '害虫', 'The pest destroyed the crops')
    expect(r?.kind).toBe('curated')
    expect(r?.body).toContain('拍死它')
  })

  it('拆词微故事落到词义', () => {
    const r = getMnemonic('prediction', '预测', 'His prediction came true')
    expect(r?.kind).toBe('parts')
    expect(r?.body).toContain('预测')
    expect(r?.parts?.map(p => p.text)).toEqual(['pre-', 'dic', '-tion'])
  })

  it('无词缀时用例句填空', () => {
    const r = getMnemonic('magnet', '磁铁', 'The magnet attracts iron')
    expect(r?.kind).toBe('sentence')
    expect(r?.body).toContain('______')
    expect(r?.answer).toBe('magnet')
  })

  it('太短的词返回 null', () => {
    expect(getMnemonic('go', '去', 'I go home')).toBeNull()
  })
})

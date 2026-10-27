import { describe, expect, it } from 'vitest'
import { parseExtra } from '../src/pages/vocabulary/extraParser'

describe('parseExtra', () => {
  it('空值与占位符返回空数组', () => {
    expect(parseExtra(undefined)).toEqual([])
    expect(parseExtra(null)).toEqual([])
    expect(parseExtra('')).toEqual([])
    expect(parseExtra('-')).toEqual([])
  })

  it('标准派生词：word + pos + 中文释义', () => {
    expect(parseExtra('horizontal adj. 水平的')).toEqual([
      { word: 'horizontal', pos: 'adj.', meaning: '水平的' },
    ])
    expect(parseExtra('erosion n. 侵蚀；腐蚀')).toEqual([
      { word: 'erosion', pos: 'n.', meaning: '侵蚀；腐蚀' },
    ])
  })

  it('。分隔多个并列条目', () => {
    const r = parseExtra(
      'horizontal adj. 水平的。broaden sb.\'s horizons 开阔眼界',
    )
    expect(r).toEqual([
      { word: 'horizontal', pos: 'adj.', meaning: '水平的' },
      { word: 'broaden sb.\'s horizons', pos: '', meaning: '开阔眼界' },
    ])
  })

  it('无词性时 pos 为空', () => {
    expect(parseExtra('a disaster film/movie 灾难片')).toEqual([
      { word: 'a disaster film/movie', pos: '', meaning: '灾难片' },
    ])
  })

  it('；分隔的两个词条都能拆出来', () => {
    const r = parseExtra('boa n. 蟒蛇；prey n. 猎物')
    expect(r).toEqual([
      { word: 'boa', pos: 'n.', meaning: '蟒蛇' },
      { word: 'prey', pos: 'n.', meaning: '猎物' },
    ])
  })

  it('中文开头的补充释义拼接到上一条', () => {
    const r = parseExtra('excel v. 擅长；突出')
    expect(r).toEqual([{ word: 'excel', pos: 'v.', meaning: '擅长；突出' }])
  })

  it('备注与纯英文无释义被丢弃', () => {
    expect(parseExtra('复数形式：phenomena')).toEqual([])
    expect(parseExtra('orginze a compaign')).toEqual([])
    // 备注丢弃，但后面的正常词条保留
    const r = parseExtra('复数形式：phenomena；a natural phenomenon 自然现象')
    expect(r).toEqual([
      { word: 'a natural phenomenon', pos: '', meaning: '自然现象' },
    ])
  })

  it('短语条目', () => {
    expect(parseExtra('have sb. over 邀请某人到家里做客')).toEqual([
      { word: 'have sb. over', pos: '', meaning: '邀请某人到家里做客' },
    ])
    expect(parseExtra('at that precise moment 恰好在那个时刻')).toEqual([
      { word: 'at that precise moment', pos: '', meaning: '恰好在那个时刻' },
    ])
  })
})

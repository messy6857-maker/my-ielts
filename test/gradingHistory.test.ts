// 批改记录：AI 作文批改 + 口语评分的历史列表读取。
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '../src/composables/useAuth'
import { getGradingRecords } from '../src/composables/useGradingHistory'
import { accountKey, saveValue } from '../src/utils/storage'

const auth = useAuth()

const writingResult = {
  scores: {
    ta: 6,
    cc: 6,
    lr: 6.5,
    gra: 6,
    overall: 6,
  },
  comments: {
    ta: 'c-ta',
    cc: 'c-cc',
    lr: 'c-lr',
    gra: 'c-gra',
  },
  corrections: [
    { original: 'a', fixed: 'b', reason: 'r' },
  ],
  suggestion: 'sug',
  advice: {
    ta: 'a-ta',
    cc: 'a-cc',
    lr: 'a-lr',
    gra: 'a-gra',
  },
  rewritten: 'para1\n\npara2',
}

const speakingResult = {
  scores: {
    fluency: 6,
    lexical: 6.5,
    grammar: 6,
    overall: 6,
  },
  comments: { fluency: 'f', lexical: 'l', grammar: 'g' },
  suggestion: 'sug',
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  auth.currentUser.value = 'alice'
})

describe('批改记录列表', () => {
  it('列出 v2 写作、v1 写作与口语，按时间倒序', () => {
    saveValue(accountKey('aigrade_v1_-k3j9', 'alice'), writingResult)
    saveValue(accountKey('aigrade_speaking_v1_part2_abc', 'alice'), speakingResult)
    saveValue(accountKey('aigrade_v2_xyz', 'alice'), writingResult)
    const list = getGradingRecords('alice')
    expect(list).toHaveLength(3)
    expect(list[0].kind).toBe('writing')
    expect(list[0].version).toBe('v2')
    expect(list[0].result.scores.overall).toBe(6)
    expect(list[1].kind).toBe('speaking')
    expect(list[1].part).toBe('part2')
    expect(list[1].result.scores.overall).toBe(6)
    expect(list[2].kind).toBe('writing')
    expect(list[2].version).toBe('v1')
    // 时间戳单调递增，倒序即写入顺序的反序
    expect(list[0].date).toBeGreaterThan(list[1].date)
    expect(list[1].date).toBeGreaterThan(list[2].date)
  })

  it('只读当前账号：切账号与游客均看不到', () => {
    saveValue(accountKey('aigrade_v2_xyz', 'alice'), writingResult)
    expect(getGradingRecords('alice')).toHaveLength(1)
    expect(getGradingRecords('bob')).toHaveLength(0)
    expect(getGradingRecords(null)).toHaveLength(0)
  })

  it('用户名前缀碰撞不越界（alice_bob 的记录不属于 alice）', () => {
    saveValue(accountKey('aigrade_v2_xyz', 'alice_bob'), writingResult)
    saveValue(accountKey('aigrade_v2_xyz', 'alice'), writingResult)
    expect(getGradingRecords('alice')).toHaveLength(1)
  })

  it('形状不合格或损坏的条目跳过，不崩溃', () => {
    saveValue(accountKey('aigrade_v2_bad', 'alice'), { text: 'not a grade' })
    saveValue(accountKey('aigrade_speaking_v1_na_bad', 'alice'), {
      scores: {
        fluency: 6,
        lexical: 6,
        grammar: 6,
        overall: 9,
      },
      comments: { fluency: 'f', lexical: 'l', grammar: 'g' },
      suggestion: '',
    })
    localStorage.setItem(accountKey('aigrade_v2_broken', 'alice'), '{broken')
    saveValue(accountKey('aigrade_v2_ok', 'alice'), writingResult)
    const list = getGradingRecords('alice')
    expect(list).toHaveLength(1)
    expect(list[0].key).toContain('aigrade_v2_ok')
  })

  it('老裸 JSON（无信封）也能读，日期未知、排最后', () => {
    saveValue(accountKey('aigrade_v2_new', 'alice'), writingResult)
    localStorage.setItem(
      accountKey('aigrade_v1_old', 'alice'),
      JSON.stringify(writingResult),
    )
    const list = getGradingRecords('alice')
    expect(list).toHaveLength(2)
    expect(list[0].version).toBe('v2')
    expect(list[1].version).toBe('v1')
    expect(list[1].date).toBe(0)
  })

  it('已删除标记的条目不显示', () => {
    saveValue(accountKey('aigrade_v2_gone', 'alice'), writingResult, true)
    saveValue(accountKey('aigrade_v2_kept', 'alice'), writingResult)
    const list = getGradingRecords('alice')
    expect(list).toHaveLength(1)
    expect(list[0].key).toContain('aigrade_v2_kept')
  })
})

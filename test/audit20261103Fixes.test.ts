import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatMockCorrectAnswer,
  hasWrittenMockMistakes,
  markMockMistakesWritten,
  mockReviewMatches,
} from '../src/utils/mockMistakes'
import { diffDictation, tokenizeDictation } from '../src/utils/dictationDiff'
import {
  readDictationProgress,
  saveDictationPartProgress,
} from '../src/utils/dictationProgress'
import {
  emptyVocabularyShell,
  getCachedChapter,
  listVocabularyChapters,
  loadVocabularyChapter,
} from '../src/pages/vocabulary/loadVocabulary'
import { mergeEntry } from '../src/utils/entryMerge'
import type { Envelope } from '../src/utils/storage'
import { isStudyKey } from '../src/utils/storage'
import { listUnfinishedMocks } from '../src/utils/todayTasks'
import type { MockQuestion } from '../src/pages/mock/types'

const KEY = 'mock_mistakes_written_v1'

beforeEach(() => {
  localStorage.removeItem(KEY)
})

describe('A-1 错题写入幂等标记', () => {
  it('未标记时为 false，标记后为 true，不同 attempt 互不影响', () => {
    expect(hasWrittenMockMistakes('a1')).toBe(false)
    markMockMistakesWritten('a1')
    expect(hasWrittenMockMistakes('a1')).toBe(true)
    expect(hasWrittenMockMistakes('a2')).toBe(false)
  })

  it('空 attemptId 不读写标记（失败时退回旧行为，不崩溃）', () => {
    markMockMistakesWritten('')
    expect(hasWrittenMockMistakes('')).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('损坏的 JSON 不崩溃且可恢复', () => {
    localStorage.setItem(KEY, '{broken')
    expect(hasWrittenMockMistakes('a1')).toBe(false)
    markMockMistakesWritten('a1')
    expect(hasWrittenMockMistakes('a1')).toBe(true)
  })

  it('标记列表有上限 50 条，超限淘汰最早的', () => {
    for (let i = 0; i < 55; i++)
      markMockMistakesWritten(`id-${i}`)
    const list = JSON.parse(localStorage.getItem(KEY)!) as string[]
    expect(list.length).toBe(50)
    expect(hasWrittenMockMistakes('id-0')).toBe(false)
    expect(hasWrittenMockMistakes('id-54')).toBe(true)
  })
})

describe('A-2 TFNG 正确答案显示', () => {
  const tfng = (answer: number): MockQuestion => ({
    id: 'q1',
    type: 'tfng',
    question: 'test',
    options: ['True', 'False', 'Not Given'],
    answer,
  } as MockQuestion)

  it('tfng 显示选项文本而非数字下标', () => {
    expect(formatMockCorrectAnswer(tfng(0))).toBe('A. True')
    expect(formatMockCorrectAnswer(tfng(1))).toBe('B. False')
    expect(formatMockCorrectAnswer(tfng(2))).toBe('C. Not Given')
  })
})

describe('A-3 多选题复习必须全对才清除', () => {
  const title = 'A. xxx；C. yyy'

  it('只答对一个分选项不通过', () => {
    expect(mockReviewMatches(title, 'xxx')).toBe(false)
    expect(mockReviewMatches(title, 'A')).toBe(false)
    expect(mockReviewMatches(title, 'yyy')).toBe(false)
  })

  it('两个分选项都答出才通过（字母或原文均可）', () => {
    expect(mockReviewMatches(title, 'A C')).toBe(true)
    expect(mockReviewMatches(title, 'xxx yyy')).toBe(true)
    expect(mockReviewMatches(title, 'A yyy')).toBe(true)
  })

  it('填空等价变体仍任一通过（/ 分隔不是必全项）', () => {
    expect(mockReviewMatches('colour / color', 'color')).toBe(true)
    expect(mockReviewMatches('colour / color', 'colour')).toBe(true)
  })

  it('含中文分号的普通标题不被误判为多选（仍按任一变体匹配）', () => {
    expect(mockReviewMatches('今天天气不错；适合外出', '今天天气不错')).toBe(true)
    expect(mockReviewMatches('今天天气不错；适合外出', '适合外出')).toBe(true)
  })
})

describe('A-5 听写数字等价写法', () => {
  it('千分位分隔符不切分数字', () => {
    expect(tokenizeDictation('1,800')).toEqual(['1800'])
    expect(tokenizeDictation('1,800,000')).toEqual(['1800000'])
    expect(diffDictation('It costs 1,800 dollars', 'It costs 1800 dollars').perfect).toBe(true)
  })

  it('小数尾零不影响判定', () => {
    expect(tokenizeDictation('3.50')).toEqual(['3.5'])
    expect(tokenizeDictation('3.0')).toEqual(['3'])
    expect(diffDictation('The price is 3.50', 'The price is 3.5').perfect).toBe(true)
  })

  it('保留序数后缀和编号前导零', () => {
    expect(tokenizeDictation('twenty pounds')).toEqual(['20', 'pounds'])
    expect(tokenizeDictation('1st prize')).toEqual(['1st', 'prize'])
    expect(tokenizeDictation('007')).toEqual(['007'])
  })
})

describe('A-6 听写弯引号缩写', () => {
  it('弯引号与直引号、无引号都判为同一词', () => {
    expect(tokenizeDictation('don’t')).toEqual(['dont'])
    expect(tokenizeDictation('don\'t')).toEqual(['dont'])
    expect(tokenizeDictation('dont')).toEqual(['dont'])
    expect(diffDictation('I don’t know', 'I don\'t know').perfect).toBe(true)
  })
})

describe('A-9 听写数字归一化补齐（部分）', () => {
  it('连字符复合数字', () => {
    expect(tokenizeDictation('fifty-one')).toEqual(['51'])
    expect(diffDictation('fifty-one people', '51 people').perfect).toBe(true)
  })

  it('序数词', () => {
    expect(tokenizeDictation('first prize')).toEqual(['1st', 'prize'])
    expect(tokenizeDictation('second place')).toEqual(['2nd', 'place'])
  })

  it('无歧义缩写', () => {
    expect(tokenizeDictation('Dr. Smith')).toEqual(['doctor', 'smith'])
  })
})

describe('A-7 今日任务排除已退役副本', () => {
  function fakeStorage(entries: Record<string, string>): Storage {
    const store: Record<string, string> = { ...entries }
    const fake: Record<string, unknown> = {
      ...store,
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
        fake[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
        delete fake[k]
      },
      clear: () => {
        for (const k of Object.keys(store)) {
          delete store[k]
          delete fake[k]
        }
      },
    }
    return fake as unknown as Storage
  }

  const draft = (testId: string, attemptId?: string) => JSON.stringify({
    version: 1,
    kind: 'listening',
    testId,
    ...(attemptId ? { attemptId } : {}),
    submitted: false,
    updatedAt: 1000,
  })

  it('带 __completed_ 标记的已退役副本不列入未完成', () => {
    const storage = fakeStorage({
      'myielts_mock_draft_v1_listening_cam21-test1__session_a': draft('cam21-test1', 'att1'),
      'myielts_mock_draft_v1_listening_cam21-test1__completed_att1': '1',
      'myielts_mock_draft_v1_listening_cam20-test2__session_b': draft('cam20-test2', 'att2'),
    })
    const list = listUnfinishedMocks(null, storage)
    expect(list.map(x => x.testId)).toEqual(['cam20-test2'])
  })

  it('无 attemptId 的旧草稿保持旧行为（仍列入）', () => {
    const storage = fakeStorage({
      'myielts_mock_draft_v1_listening_cam21-test1__session_a': draft('cam21-test1'),
    })
    expect(listUnfinishedMocks(null, storage)).toHaveLength(1)
  })
})

describe('C-03 自评索引不再同步（仅本机）', () => {
  it('索引 key 不是 study key：不同步、不随登录迁移', () => {
    expect(isStudyKey('myielts_speaking_self_rubric_index_v1')).toBe(false)
    expect(isStudyKey('myielts_u_alice_speaking_self_rubric_index_v1')).toBe(false)
    // 对照：听写进度仍是 study key，不受影响
    expect(isStudyKey('myielts_dictation_progress_v1')).toBe(true)
  })
})

describe('C-02 听写进度同步按 part 合并', () => {
  const env = (stamp: number, writer: string, value: unknown): Envelope => ({
    __ielts: 2,
    stamp: [stamp, writer],
    value,
  })
  const part = (cursor: number, updatedAt: number) => ({
    cursor,
    sentences: {},
    updatedAt,
  })

  it('两设备各练不同 part：合并后两 part 都在', () => {
    const merged = mergeEntry(
      'dictation_progress_v1',
      env(100, 'a', { 'cam21-test1:part1': part(3, 100) }),
      env(200, 'b', { 'cam21-test1:part2': part(0, 200) }),
    )
    const value = merged.value as Record<string, { cursor: number }>
    expect(value['cam21-test1:part1'].cursor).toBe(3)
    expect(value['cam21-test1:part2'].cursor).toBe(0)
  })

  it('同 part 取 updatedAt 更大者（不受信封戳顺序影响）', () => {
    const merged = mergeEntry(
      'dictation_progress_v1',
      env(300, 'a', { 'cam21-test1:part1': part(9, 300) }),
      env(200, 'b', { 'cam21-test1:part1': part(1, 200) }),
    )
    expect((merged.value as Record<string, { cursor: number }>)['cam21-test1:part1'].cursor).toBe(9)
    const merged2 = mergeEntry(
      'dictation_progress_v1',
      env(100, 'a', { 'cam21-test1:part1': part(1, 100) }),
      env(200, 'b', { 'cam21-test1:part1': part(5, 200) }),
    )
    expect((merged2.value as Record<string, { cursor: number }>)['cam21-test1:part1'].cursor).toBe(5)
  })
})

describe('B-5 词汇分章加载器', () => {
  it('22 章目录', () => {
    expect(listVocabularyChapters()).toHaveLength(22)
  })

  it('分章动态 import + 缓存：两次返回同一对象', async () => {
    const a = await loadVocabularyChapter('01_自然地理')
    const b = await loadVocabularyChapter('01_自然地理')
    expect(a).toBe(b)
    expect(a.words.flat().length).toBeGreaterThan(0)
    expect(getCachedChapter('01_自然地理')).toBe(a)
  })

  it('不存在的章节抛错', async () => {
    await expect(loadVocabularyChapter('99_不存在')).rejects.toThrow()
  })

  it('空壳：未缓存章节 words 为空、元数据齐全；已缓存章节带真实 words', () => {
    const shells = emptyVocabularyShell()
    expect(shells['22_时间日期'].words).toEqual([])
    expect(shells['22_时间日期'].label).toBeTruthy()
    expect(shells['22_时间日期'].wordCount).toBeGreaterThan(0)
    expect(shells['01_自然地理'].words.flat().length).toBeGreaterThan(0)
  })
})

describe('A-8 听写进度多页签不互相覆盖', () => {
  it('后保存的 part 不丢掉先保存的其他 part', () => {
    localStorage.clear()
    // 页签 B 先保存 part2
    expect(saveDictationPartProgress(null, 'cam21-test1', 'part2', {
      cursor: 0,
      sentences: {},
      updatedAt: 0,
    })).toBe(true)
    // 页签 A 持旧快照保存 part1：重读合并后 part2 必须还在
    expect(saveDictationPartProgress(null, 'cam21-test1', 'part1', {
      cursor: 3,
      sentences: { 0: { attempts: 1, perfect: 1, lastAccuracy: 1, lastAt: 1 } },
      updatedAt: 0,
    })).toBe(true)
    const all = readDictationProgress(null)
    expect(all['cam21-test1:part2']).toBeDefined()
    expect(all['cam21-test1:part1'].cursor).toBe(3)
    localStorage.clear()
  })
})

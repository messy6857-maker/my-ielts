import { beforeEach, describe, expect, it } from 'vitest'
import { gradeSchedule } from '../src/composables/useSpacedRepetition'
import { useMistakes } from '../src/composables/useStudyData'
import { useAuth } from '../src/composables/useAuth'
import {
  buildMockMistakeEntry,
  collectMockMistakeEntries,
  decodeMockMistakeMeta,
} from '../src/utils/mockMistakes'
import { diffDictation, tokenizeDictation } from '../src/utils/dictationDiff'
import {
  prefersOriginalAudio,
  shouldUseTtsFallback,
} from '../src/pages/listening/timings/loadTimings'
import {
  buildTodayTasks,
  countDueSchedules,
  listUnfinishedMocks,
  pickRecentMistakes,
} from '../src/utils/todayTasks'
import type { MistakeItem } from '../src/composables/useStudyData'
import type { MockQuestion } from '../src/pages/mock/types'

const DAY = 86_400_000

describe('SM-2 gradeSchedule', () => {
  const now = 1_700_000_000_000

  it('认识：拉长间隔并推迟 dueAt', () => {
    const first = gradeSchedule(undefined, 5, now)
    expect(first.reps).toBe(1)
    expect(first.interval).toBe(1)
    expect(first.dueAt).toBe(now + DAY)

    const second = gradeSchedule(first, 5, now)
    expect(second.reps).toBe(2)
    expect(second.interval).toBeGreaterThanOrEqual(1)
    expect(second.dueAt).toBe(now + second.interval * DAY)
    expect(second.ease).toBeGreaterThan(first.ease)
  })

  it('模糊：明天再见，不增加 reps', () => {
    const prev = gradeSchedule(undefined, 5, now)
    const next = gradeSchedule(prev, 3, now)
    expect(next.reps).toBe(prev.reps)
    expect(next.interval).toBe(1)
    expect(next.dueAt).toBe(now + DAY)
    expect(next.ease).toBeLessThan(prev.ease)
  })

  it('不认识：立刻到期并累计 lapses', () => {
    const prev = gradeSchedule(undefined, 5, now)
    const next = gradeSchedule(prev, 0, now)
    expect(next.reps).toBe(0)
    expect(next.interval).toBe(0)
    expect(next.dueAt).toBe(now)
    expect(next.lapses).toBe(prev.lapses + 1)
  })
})

describe('addMistake 合并与去重', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuth().currentUser.value = 'opt-user'
  })

  it('同一 key 多次记错会累加 count，不新增并列条目', () => {
    const m = useMistakes()
    m.addMistake('dictation', {
      key: 'dictation:cam18-test1:part1:0',
      title: 'Hello world',
      detail: '第一次',
    })
    m.addMistake('dictation', {
      key: 'dictation:cam18-test1:part1:0',
      title: 'Hello world',
      detail: '第二次',
    })
    const hits = m.mistakes.value.filter(
      x => x.key === 'dictation:cam18-test1:part1:0',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].count).toBe(2)
    expect(hits[0].module).toBe('dictation')
  })

  it('不同 key 保持独立', () => {
    const m = useMistakes()
    m.addMistake('writing', { key: 'writing:1', title: 'A' })
    m.addMistake('writing', { key: 'writing:2', title: 'B' })
    expect(
      m.mistakes.value.filter(x => x.module === 'writing').length,
    ).toBeGreaterThanOrEqual(2)
  })
})

describe('模考错题入库', () => {
  it('buildMockMistakeEntry 写入套卷/Part/题号与听力音频定位', () => {
    const q: MockQuestion = {
      id: 'q3',
      type: 'fill-blank',
      question: 'What is the price?',
      answer: '15',
    }
    const entry = buildMockMistakeEntry({
      kind: 'listening',
      testId: 'cam18-test1',
      label: '剑18 Test 1',
      part: 'part2',
      question: q,
      userAnswer: '50',
      audio: 'mock/cam18-test1-listening-part2.mp3',
    })
    expect(entry.module).toBe('mock_listening')
    expect(entry.key).toContain('cam18-test1')
    expect(entry.key).toContain('part2')
    expect(entry.key).toContain('q3')
    expect(entry.detail).toContain('剑18 Test 1')
    expect(entry.detail).toContain('part2')
    expect(entry.title).toContain('15')
    const meta = decodeMockMistakeMeta(entry.hint)
    expect(meta?.audio).toBe('mock/cam18-test1-listening-part2.mp3')
    expect(meta?.testId).toBe('cam18-test1')
  })

  it('collectMockMistakeEntries 跳过答对题', () => {
    const qs: MockQuestion[] = [
      {
        id: 'a',
        type: 'fill-blank',
        question: 'A?',
        answer: 'yes',
      },
      {
        id: 'b',
        type: 'fill-blank',
        question: 'B?',
        answer: 'no',
      },
    ]
    const entries = collectMockMistakeEntries({
      kind: 'reading',
      testId: 'cam19-test1',
      label: '剑19 Test 1',
      answers: { a: 'yes', b: 'maybe' },
      parts: [{ part: 'passage1', questions: qs }],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].key).toContain('b')
    expect(entries[0].module).toBe('mock_reading')
  })
})

describe('听写比对算法', () => {
  it('忽略大小写与标点', () => {
    const r = diffDictation('Hello, world!', 'hello world')
    expect(r.perfect).toBe(true)
    expect(r.accuracy).toBe(1)
  })

  it('数字写法互通：twenty ≈ 20', () => {
    expect(tokenizeDictation('twenty pounds')).toEqual(['20', 'pounds'])
    const r = diffDictation('It costs 20 pounds.', 'It costs twenty pounds')
    expect(r.perfect).toBe(true)
  })

  it('高亮缺失与多余词', () => {
    const r = diffDictation('I like green tea', 'I like tea please')
    expect(r.perfect).toBe(false)
    expect(r.tokens.some(t => t.mark === 'missing' && t.expected === 'green')).toBe(
      true,
    )
    expect(r.tokens.some(t => t.mark === 'extra' && t.actual === 'please')).toBe(
      true,
    )
  })
})

describe('精听 ok/weak 不走 TTS', () => {
  it('ok/weak 且有起止时间 → 原音，禁止 TTS', () => {
    expect(prefersOriginalAudio([1.2, 3.4, 'ok'])).toBe(true)
    expect(prefersOriginalAudio([0.5, 1.0, 'weak'])).toBe(true)
    expect(shouldUseTtsFallback([1.2, 3.4, 'ok'])).toBe(false)
    expect(shouldUseTtsFallback([0.5, 1.0, 'weak'])).toBe(false)
  })

  it('tts / 缺时间 / skip 的分流正确', () => {
    expect(prefersOriginalAudio([null, null, 'tts'])).toBe(false)
    expect(shouldUseTtsFallback([null, null, 'tts'])).toBe(true)
    expect(shouldUseTtsFallback([null, null, 'skip'])).toBe(false)
    expect(shouldUseTtsFallback(undefined)).toBe(true)
  })
})

describe('今日任务数据聚合', () => {
  it('统计到期词并挑选最近错题', () => {
    const now = Date.now()
    expect(
      countDueSchedules(
        {
          a: {
            ease: 2.5,
            interval: 1,
            dueAt: now - 1000,
            reps: 1,
            lapses: 0,
          },
          b: {
            ease: 2.5,
            interval: 1,
            dueAt: now + DAY,
            reps: 1,
            lapses: 0,
          },
        },
        now,
      ),
    ).toBe(1)

    const mistakes = [
      { key: '1', lastAt: 10 },
      { key: '2', lastAt: 30 },
      { key: '3', lastAt: 20 },
    ] as MistakeItem[]
    expect(pickRecentMistakes(mistakes, 2).map(m => m.key)).toEqual(['2', '3'])
  })

  it('聚合未完成模考草稿与空状态', () => {
    localStorage.clear()
    // guest prefix: myielts_
    localStorage.setItem(
      'myielts_mock_draft_v1_listening_cam18-test1__session_x',
      JSON.stringify({
        version: 1,
        kind: 'listening',
        testId: 'cam18-test1',
        submitted: false,
        updatedAt: 100,
        answers: {},
        timeLeft: 1000,
      }),
    )
    localStorage.setItem(
      'myielts_mock_draft_v1_listening_cam18-test1__session_y',
      JSON.stringify({
        version: 1,
        kind: 'listening',
        testId: 'cam18-test1',
        submitted: true,
        updatedAt: 200,
        answers: {},
        timeLeft: 0,
      }),
    )

    const unfinished = listUnfinishedMocks(null)
    expect(unfinished).toHaveLength(1)
    expect(unfinished[0].testId).toBe('cam18-test1')
    expect(unfinished[0].path).toContain('listening-test')

    const empty = buildTodayTasks({
      schedules: {},
      mistakes: [],
      owner: null,
      studySeconds: 0,
    })
    // unfinished mock means not empty
    expect(empty.isEmpty).toBe(false)
    expect(empty.unfinishedMocks).toHaveLength(1)

    const trulyEmpty = buildTodayTasks({
      schedules: {},
      mistakes: [],
      owner: 'nobody',
      studySeconds: 0,
    })
    expect(trulyEmpty.isEmpty).toBe(true)
    localStorage.clear()
  })
})

import type { DungeonContext, DungeonWord } from '../src/utils/dungeon'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useWordSchedule } from '../src/composables/useSpacedRepetition'
import { nsKey, useMistakes } from '../src/composables/useStudyData'
import GamePage from '../src/pages/game.vue'
import {
  buildPool,
  buildRun,
  checkSpelling,
  flattenVocabulary,
  phaseScore,
  pickOptions,
  sourceWords,
} from '../src/utils/dungeon'

const DAY = 86400000
const NOW = new Date(2026, 10, 15, 15, 0, 0).getTime()
function word(id: number, w: string, meaning: string, chapter = 'c1', pos = 'n.'): DungeonWord {
  return {
    id,
    word: w,
    variants: [w],
    pos,
    meaning,
    chapter,
  }
}
const WORDS = [
  word(1, 'atmosphere', '大气层'),
  word(2, 'hydrosphere', '水圈'),
  word(3, 'lithosphere', '岩石圈'),
  word(4, 'oxygen', '氧气'),
  word(5, 'glacier', '冰川', 'c2'),
  word(6, 'erode', '侵蚀', 'c2', 'v.'),
  word(7, 'Atmosphere', '大气层（重复）', 'c2'),
]
function ctx(extra: Partial<DungeonContext> = {}): DungeonContext {
  return {
    schedules: {},
    mistakes: [],
    now: NOW,
    ...extra,
  }
}
function mistake(key: string, title: string, count: number, lastAt: number, module = key.split(':')[0]) {
  return {
    key,
    module,
    title,
    detail: '',
    count,
    firstAt: lastAt,
    lastAt,
  } as any
}
/** 可复现的随机数 */
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('word sources', () => {
  it('flattens chapters and skips entries without a word or meaning', () => {
    const flat = flattenVocabulary({
      c1: {
        words: [
          [
            {
              id: 1,
              word: ['colour', 'color'],
              pos: 'n.',
              meaning: '颜色',
            },
            {
              id: 2,
              word: [],
              pos: '',
              meaning: 'x',
            },
          ],
          [
            {
              id: 3,
              word: ['x'],
              pos: '',
              meaning: ' ',
            },
          ],
        ],
      },
    })
    expect(flat).toEqual([
      {
        id: 1,
        word: 'colour',
        variants: ['colour', 'color'],
        pos: 'n.',
        meaning: '颜色',
        chapter: 'c1',
      },
    ])
  })

  it('today = graded in self-test today or added to the mistake book today', () => {
    const c = ctx({
      schedules: {
        'vocab:1': {
          ease: 2.5,
          interval: 1,
          dueAt: NOW - 3600000 + DAY,
          reps: 1,
          lapses: 0,
        }, // 一小时前评“认识”
        'vocab:2': {
          ease: 2.5,
          interval: 3,
          dueAt: NOW + DAY,
          reps: 2,
          lapses: 0,
        }, // 两天前评的
        'vocab:3': {
          ease: 2.3,
          interval: 0,
          dueAt: NOW - 60000,
          reps: 0,
          lapses: 1,
        }, // 一分钟前评“不认识”
      },
      mistakes: [
        mistake('typing:oxygen', 'oxygen', 1, NOW - 1000),
        mistake('typing:glacier', 'glacier', 2, NOW - 2 * DAY),
        mistake('dictation:x', 'erode', 1, NOW),
      ],
    })
    const s = sourceWords(WORDS, c)
    expect(s.today.map(w => w.word)).toEqual(['atmosphere', 'lithosphere', 'oxygen'])
    expect(s.mistakes.map(w => w.word)).toEqual(['oxygen', 'glacier'])
    expect(s.due.map(w => w.word)).toEqual(['lithosphere'])
  })

  it('sources can be combined with chapters; the same word in two chapters appears once', () => {
    const c = ctx({
      mistakes: [
        mistake('flashcard:5', 'glacier', 1, NOW - 5 * DAY),
      ],
    })
    expect(buildPool(WORDS, {
      today: false,
      mistakes: false,
      due: false,
      chapters: [],
    }, c)).toEqual([])
    expect(buildPool(WORDS, {
      today: false,
      mistakes: true,
      due: false,
      chapters: [],
    }, c).map(w => w.id)).toEqual([5])
    expect(buildPool(WORDS, {
      today: false,
      mistakes: true,
      due: false,
      chapters: ['c1'],
    }, c).map(w => w.id)).toEqual([1, 2, 3, 4, 5])
    expect(buildPool(WORDS, {
      today: false,
      mistakes: false,
      due: false,
      chapters: ['c1', 'c2'],
    }, c).map(w => w.id)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('building a run', () => {
  const many = Array.from({ length: 40 }, (_, i) => word(100 + i, `word${String.fromCharCode(97 + (i % 26))}${i}`, `释义${i}`))

  it('ten rooms from a big pool, the last one is the boss; fewer rooms when few words are selected', () => {
    const run = buildRun(many, many, ctx(), seeded())
    expect(run).toHaveLength(10)
    expect(new Set(run.map(m => m.word.id)).size).toBe(10)
    expect(run.at(-1)!.kind).toBe('boss')
    expect(run.slice(0, -1).every(m => m.kind === 'slime' || m.kind === 'bat')).toBe(true)
    expect(buildRun(many.slice(0, 3), many, ctx(), seeded())).toHaveLength(3)
    expect(buildRun(many.slice(0, 1), many, ctx(), seeded()).map(m => m.kind)).toEqual(['boss'])
    expect(buildRun([], many, ctx(), seeded())).toEqual([])
  })

  it('the boss is the most-missed selected word; much-missed words become elites needing both question types', () => {
    const pool = many.slice(0, 6)
    const c = ctx({
      mistakes: [
        mistake(`flashcard:${pool[2].id}`, pool[2].word, 7, NOW),
        mistake(`typing:${pool[4].word}`, pool[4].word, 3, NOW),
      ],
    })
    const run = buildRun(pool, many, c, seeded(7))
    const boss = run.at(-1)!
    expect(boss.word).toBe(pool[2])
    expect(boss.phases).toEqual(['choice', 'spell'])
    expect(boss.wrongCount).toBe(7)
    const elite = run.find(m => m.word === pool[4])!
    expect(elite.kind).toBe('elite')
    expect(elite.phases).toEqual(['choice', 'spell'])
    for (const m of run.filter(m => m.kind === 'slime'))
      expect(m.phases).toEqual(['choice'])
    for (const m of run.filter(m => m.kind === 'bat'))
      expect(m.phases).toEqual(['spell'])
  })

  it('with no mistakes the boss is the longest word', () => {
    const pool = [
      word(1, 'cat', '猫'),
      word(2, 'hippopotamus', '河马'),
      word(3, 'dog', '狗'),
    ]
    expect(buildRun(pool, pool, ctx(), seeded(3)).at(-1)!.word.word).toBe('hippopotamus')
  })

  it('choice options: four distinct words including the answer, no duplicate meanings', () => {
    for (let seed = 1; seed < 30; seed++) {
      const options = pickOptions(WORDS[0], WORDS, seeded(seed))
      expect(options).toHaveLength(4)
      expect(options).toContain(WORDS[0])
      expect(new Set(options.map(o => o.word.toLowerCase())).size).toBe(4)
      expect(options).not.toContain(WORDS[6])
    }
    // 词库太小：有几个给几个
    expect(pickOptions(WORDS[0], WORDS.slice(0, 2), seeded()).map(o => o.id).sort()).toEqual([1, 2])
  })

  it('spelling check ignores case and extra spaces and accepts variants', () => {
    const w: DungeonWord = {
      id: 1,
      word: 'ice cap',
      variants: ['ice cap', 'icecap'],
      pos: '',
      meaning: '',
      chapter: '',
    }
    expect(checkSpelling('  Ice   Cap ', w)).toBe(true)
    expect(checkSpelling('icecap', w)).toBe(true)
    expect(checkSpelling('ice caps', w)).toBe(false)
    expect(checkSpelling('   ', w)).toBe(false)
  })

  it('scoring: 100 base, +10 per combo step up to +100, boss doubles', () => {
    expect(phaseScore(1, 'slime')).toBe(100)
    expect(phaseScore(3, 'bat')).toBe(120)
    expect(phaseScore(50, 'elite')).toBe(200)
    expect(phaseScore(1, 'boss')).toBe(200)
  })
})

describe('the game page', () => {
  const auth = useAuth()
  const wrappers: any[] = []
  beforeEach(() => {
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    auth.currentUser.value = null
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
    })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(public text: string) {}
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  })
  afterEach(() => {
    wrappers.splice(0).forEach(w => w.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  async function open() {
    const w = mount(GamePage, {
      attachTo: document.body,
      global: {
        stubs: { RouterLink: true },
      },
    })
    wrappers.push(w)
    for (let i = 0; w.text().includes('正在加载词库') && i < 200; i++) {
      await new Promise(resolve => setTimeout(resolve, 10))
      await flushPromises()
    }
    return w
  }
  const state = (w: any) => w.vm.$.setupState
  const startButton = (w: any) => w.findAll('button').find((b: any) => b.text() === '进入地牢')
  const continueButton = (w: any) => w.findAll('button').find((b: any) => /^(?:继续|查看结果)$/.test(b.text()))
  async function pickFirstChapter(w: any) {
    await w.find('button[aria-pressed]').trigger('click')
  }
  /** 答当前这道题 */
  async function play(w: any, correct: boolean) {
    const s = state(w)
    const m = s.monster
    if (s.question === 'choice') {
      const target = correct
        ? m.word.word
        : m.options.find((o: any) => o !== m.word).word
      const button = w.findAll('button').find((b: any) => b.text().replace(/^\d/, '').trim() === target)
      await button.trigger('click')
    }
    else {
      await w.find('input[aria-label="拼写"]').setValue(correct
        ? m.word.word.toUpperCase()
        : 'zzzz')
      await w.find('form').trigger('submit')
    }
    await nextTick()
  }

  it('nothing selected: cannot start; picking a chapter starts a 10-room run ending with the boss', async () => {
    const w = await open()
    expect(w.text()).toContain('还没有选中任何词')
    expect(startButton(w).attributes('disabled')).toBeDefined()
    await pickFirstChapter(w)
    expect(w.text()).toContain('每局随机抽 10 个')
    await startButton(w).trigger('click')
    const s = state(w)
    expect(s.stage).toBe('playing')
    expect(s.monsters).toHaveLength(10)
    expect(s.monsters.at(-1).kind).toBe('boss')
    expect(w.text()).toContain('房间 1 / 10')
    // 选择被记住，下次进来还是它
    expect(JSON.parse(localStorage.getItem(nsKey('dungeon_selection_v1'))!).chapters).toHaveLength(1)
  })

  it('clearing every room wins: score, combo and best score are recorded, nothing goes to the mistake book', async () => {
    const w = await open()
    await pickFirstChapter(w)
    await startButton(w).trigger('click')
    const s = state(w)
    let questions = 0
    for (let guard = 0; s.stage === 'playing' && guard < 40; guard++) {
      await play(w, true)
      questions++
      expect(s.result).toBe('right')
      await continueButton(w).trigger('click')
      await nextTick()
    }
    expect(s.stage).toBe('won')
    expect(s.defeated).toBe(10)
    expect(s.hearts).toBe(3)
    expect(s.maxCombo).toBe(questions)
    expect(w.text()).toContain('通关')
    expect(w.text()).toContain('新的最高分')
    expect(JSON.parse(localStorage.getItem(nsKey('dungeon_best_v1'))!)).toEqual({ score: s.score, combo: questions })
    expect(useMistakes().mistakes.value).toHaveLength(0)
  })

  it('three wrong answers lose the run; each missed word goes to the mistake book under the matching module', async () => {
    const w = await open()
    await pickFirstChapter(w)
    await startButton(w).trigger('click')
    const s = state(w)
    const expected: string[] = []
    for (let i = 0; i < 3; i++) {
      const m = s.monster
      expected.push(s.question === 'choice'
        ? `flashcard:${m.word.id}`
        : `typing:${m.word.word}`)
      await play(w, false)
      expect(s.result).toBe('wrong')
      expect(s.hearts).toBe(2 - i)
      expect(s.combo).toBe(0)
      expect(w.text()).toContain(`正确答案：${m.word.word}`)
      await continueButton(w).trigger('click')
      await nextTick()
    }
    expect(s.stage).toBe('lost')
    expect(s.room).toBe(2)
    expect(useMistakes().mistakes.value.map(m => m.key).sort()).toEqual(expected.sort())
    expect(w.text()).toContain('这些词已记进错词本')
  })

  it('only words already being reviewed get their schedule updated; unseen words stay new', async () => {
    const schedules = useWordSchedule()
    const w = await open()
    await pickFirstChapter(w)
    await startButton(w).trigger('click')
    const s = state(w)
    const first = s.monster.word
    const second = s.monsters[1].word
    schedules.set(first.id, {
      ease: 2.5,
      interval: 2,
      dueAt: Date.now() - 1000,
      reps: 2,
      lapses: 0,
    })
    for (let guard = 0; s.room === 0 && guard < 3; guard++) {
      await play(w, true)
      await continueButton(w).trigger('click')
      await nextTick()
    }
    expect(schedules.get(first.id)!.reps).toBe(3)
    expect(schedules.get(first.id)!.dueAt).toBeGreaterThan(Date.now())
    for (let guard = 0; s.room === 1 && guard < 3; guard++) {
      await play(w, true)
      await continueButton(w).trigger('click')
      await nextTick()
    }
    expect(schedules.get(second.id)).toBeUndefined()
  })

  it('a hint on a spelling question shows the meaning and resets the combo', async () => {
    const w = await open()
    await pickFirstChapter(w)
    await startButton(w).trigger('click')
    const s = state(w)
    for (let guard = 0; s.question !== 'spell' && guard < 20; guard++) {
      await play(w, true)
      await continueButton(w).trigger('click')
      await nextTick()
    }
    expect(s.question).toBe('spell')
    s.combo = 4
    await w.findAll('button').find((b: any) => b.text().startsWith('提示'))!.trigger('click')
    expect(s.combo).toBe(0)
    expect(w.text()).toContain(`提示：${s.monster.word.pos} ${s.monster.word.meaning}`)
  })

  it('selecting “错词” uses the mistake book and shows its count', async () => {
    useMistakes().addMistake('flashcard', { key: 'flashcard:1', title: 'atmosphere' })
    const w = await open()
    expect(w.text()).toContain('错词（1）')
    await w.find('input[data-source="mistakes"]').setValue(true)
    expect(w.text()).toContain('选中 1 个词，这局 1 个房间')
    await startButton(w).trigger('click')
    const s = state(w)
    expect(s.monsters.map((m: any) => [m.kind, m.word.word])).toEqual([
      ['boss', 'atmosphere'],
    ])
  })
})

import type { DungeonContext, DungeonSelection, DungeonWord } from '../src/utils/dungeon'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAuth } from '../src/composables/useAuth'
import { useCheckin, useWordSchedule } from '../src/composables/useSpacedRepetition'
import { nsKey, useMistakes } from '../src/composables/useStudyData'
import GamePage from '../src/pages/game.vue'
import {
  buildPool,
  buildRun,
  checkSpelling,
  dailyPool,
  flattenListening,
  flattenReading,
  flattenVocabulary,
  isSynonym,
  offerRelics,
  phaseScore,
  pickOptions,
  pickSynonymOptions,
  RELICS,
  seededRng,
  sourceWords,
} from '../src/utils/dungeon'

const DAY = 86400000
const NOW = new Date(2026, 10, 15, 15, 0, 0).getTime()
function word(id: number, w: string, meaning: string, chapter = 'c1', pos = 'n.'): DungeonWord {
  return {
    id,
    key: `vocab:${id}`,
    deck: 'vocabulary',
    word: w,
    variants: [w],
    pos,
    meaning,
    chapter,
    synonyms: [],
  }
}
function reading(id: number, w: string, meaning: string, synonyms: string[]): DungeonWord {
  return {
    id: `类-${id}`,
    key: `reading538:类-${id}`,
    deck: 'reading538',
    word: w,
    variants: [w],
    pos: 'v.',
    meaning,
    chapter: '',
    synonyms,
  }
}
const NONE: DungeonSelection = {
  today: false,
  mistakes: false,
  due: false,
  custom: false,
  chapters: [],
  decks: [],
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
    expect(run.slice(0, -1).every(m => ['slime', 'bat', 'archer'].includes(m.kind))).toBe(true)
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
    for (const m of run.filter(m => m.kind === 'archer'))
      expect(m.phases).toEqual(['timed'])
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
    // 连击战鼓：连击加分翻倍
    expect(phaseScore(3, 'bat', true)).toBe(140)
    expect(phaseScore(1, 'slime', true)).toBe(100)
  })
})

describe('reading and listening words, synonyms', () => {
  const R = [
    reading(1, 'resemble', '像', ['like', 'look', 'be similar to']),
    reading(2, 'adjust', '调整', ['change', 'modify']),
    reading(3, 'gather', '收集', ['collect', 'accumulate']),
    reading(4, 'decline', '下降', ['drop', 'fall']),
    reading(5, 'alter', '改变', ['change', 'vary']),
    reading(6, 'plain', '没有同义词的词', []),
  ]

  it('flattens the reading and listening lists with the same ids the self-tests use', () => {
    const r = flattenReading([
      {
        title: '第 1 类考点词',
        words: [
          [
            1,
            'that*',
            ['conj.'],
            ['那个', '引导从句'],
            ['which', 'that', ' '],
            '',
          ],
          [
            2,
            '',
            [],
            ['x'],
            [],
            '',
          ],
        ],
      },
    ])
    expect(r).toEqual([
      {
        id: '第 1 类考点词-1',
        key: 'reading538:第 1 类考点词-1',
        deck: 'reading538',
        word: 'that',
        variants: ['that'],
        pos: 'conj.',
        meaning: '那个；引导从句',
        chapter: '',
        synonyms: ['which'],
      },
    ])
    const l = flattenListening([
      {
        index: 7,
        word: 'reserve',
        type: 'v.',
        meaning: '预订',
        replace: ['book'],
      },
      { index: 8, word: 'x', meaning: '' },
    ])
    expect(l).toEqual([
      {
        id: 7,
        key: 'listening179:7',
        deck: 'listening179',
        word: 'reserve',
        variants: ['reserve'],
        pos: 'v.',
        meaning: '预订',
        chapter: '',
        synonyms: ['book'],
      },
    ])
  })

  it('whole decks can be selected; their mistakes and schedules are matched by key', () => {
    const all = [
      ...WORDS,
      ...R,
    ]
    expect(buildPool(all, {
      ...NONE,
      decks: ['reading538'],
    }, ctx()).map(w => w.word)).toEqual(R.map(w => w.word))
    const c = ctx({
      mistakes: [
        mistake('reading538:类-2', 'adjust', 4, NOW - 1000, 'reading'),
        mistake('typing:gather', 'gather', 1, NOW),
      ],
      schedules: {
        'reading538:类-4': {
          ease: 2.5,
          interval: 2,
          dueAt: NOW - 1000,
          reps: 1,
          lapses: 0,
        },
      },
    })
    const s = sourceWords(all, c)
    // 打字错题只对应词汇表里的词，不会算到阅读考点词头上
    expect(s.mistakes.map(w => w.word)).toEqual(['adjust'])
    expect(s.today.map(w => w.word)).toEqual(['adjust'])
    expect(s.due.map(w => w.word)).toEqual(['decline'])
  })

  it('synonym options: exactly one correct, distractors never synonyms of the word or of words sharing a synonym', () => {
    for (let seed = 1; seed < 40; seed++) {
      const options = pickSynonymOptions(R[1], R, seeded(seed))
      expect(options).toHaveLength(4)
      expect(new Set(options).size).toBe(4)
      expect(options.filter(o => isSynonym(o, R[1]))).toHaveLength(1)
      // alter 和 adjust 共享同义词 change：alter 的同义词（vary）也不能当干扰项
      expect(options).not.toContain('vary')
    }
    expect(pickSynonymOptions(R[5], R, seeded())).toEqual([])
    expect(pickSynonymOptions(R[0], R.slice(0, 3), seeded())).toEqual([])
    expect(pickSynonymOptions(WORDS[0], [
      ...WORDS,
      ...R,
    ], seeded())).toEqual([])
  })

  it('words with synonyms can become mimics; the boss then needs all three question types', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      const run = buildRun(R.slice(0, 5), R, ctx(), seeded(seed))
      run.slice(0, -1).forEach(m => kinds.add(m.kind))
      for (const m of run.filter(m => m.kind === 'mimic'))
        expect(m.phases).toEqual(['synonym'])
      expect(run.at(-1)!.phases).toEqual(['choice', 'synonym', 'spell'])
    }
    expect([...kinds].sort()).toEqual(['archer', 'bat', 'mimic', 'slime'])
    // 词汇表的词没有同义替换题
    const plain = buildRun(WORDS.slice(0, 4), WORDS, ctx(), seeded(2))
    expect(plain.every(m => !m.phases.includes('synonym') && m.synonymOptions.length === 0)).toBe(true)
  })
})

describe('custom list, relics and the daily dungeon', () => {
  it('the custom list is a source of its own', () => {
    const c = ctx({
      customKeys: ['vocab:2', 'vocab:6', 'vocab:999'],
    })
    expect(sourceWords(WORDS, c).custom.map(w => w.id)).toEqual([2, 6])
    expect(buildPool(WORDS, { ...NONE, custom: true }, c).map(w => w.id)).toEqual([2, 6])
    expect(buildPool(WORDS, NONE, c)).toEqual([])
  })

  it('relic offers: three different ones not owned yet, fewer when few are left', () => {
    for (let seed = 1; seed < 20; seed++) {
      const offer = offerRelics(['heart'], seeded(seed))
      expect(offer).toHaveLength(3)
      expect(new Set(offer.map(r => r.id)).size).toBe(3)
      expect(offer.map(r => r.id)).not.toContain('heart')
    }
    const all = RELICS.map(r => r.id)
    expect(offerRelics(all.slice(0, 4), seeded()).map(r => r.id).sort()).toEqual(all.slice(4).sort())
    expect(offerRelics(all, seeded())).toEqual([])
  })

  it('the same seed gives the same run; another day gives another', () => {
    const many = Array.from({ length: 60 }, (_, i) => word(100 + i, `w${i}`, `释义${i}`))
    const ids = (seed: string) => buildRun(many, many, ctx(), seededRng(seed)).map(m => `${m.kind}:${m.word.id}`)
    expect(ids('daily:2026-11-15')).toEqual(ids('daily:2026-11-15'))
    expect(ids('daily:2026-11-15')).not.toEqual(ids('daily:2026-11-16'))
    const rng = seededRng('x')
    const values = Array.from({ length: 1000 }, () => rng())
    expect(values.every(v => v >= 0 && v < 1)).toBe(true)
    expect(new Set(values).size).toBeGreaterThan(990)
  })

  it('daily words: today, else due, else mistakes, else the whole vocabulary list', () => {
    const due = {
      ease: 2.5,
      interval: 3,
      dueAt: NOW - 1000,
      reps: 1,
      lapses: 0,
    }
    const today = {
      ease: 2.5,
      interval: 1,
      dueAt: NOW - 60000 + DAY,
      reps: 1,
      lapses: 0,
    }
    const old = mistake('flashcard:4', 'oxygen', 1, NOW - 5 * DAY)
    const all = [
      ...WORDS,
      reading(1, 'resemble', '像', ['like']),
    ]
    expect(dailyPool(all, ctx({
      schedules: { 'vocab:1': today, 'vocab:2': due },
      mistakes: [old],
    }))).toMatchObject({
      from: 'today',
      pool: [
        { id: 1 },
      ],
    })
    expect(dailyPool(all, ctx({
      schedules: { 'vocab:2': due },
      mistakes: [old],
    }))).toMatchObject({
      from: 'due',
      pool: [
        { id: 2 },
      ],
    })
    expect(dailyPool(all, ctx({
      mistakes: [old],
    }))).toMatchObject({
      from: 'mistakes',
      pool: [
        { id: 4 },
      ],
    })
    const fallback = dailyPool(all, ctx())
    expect(fallback.from).toBe('all')
    expect(fallback.pool).toHaveLength(WORDS.length)
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
    if (s.question === 'choice' || s.question === 'synonym') {
      const options = w.findAll('button[data-option]')
      const isRight = (text: string) => s.question === 'choice'
        ? text === m.word.word
        : isSynonym(text, m.word)
      const button = options.find((b: any) => isRight(b.text().replace(/^\d/, '').trim()) === correct)
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
  /** 点“继续”；遇到宝箱就拿指定的遗物（默认第一个） */
  async function proceed(w: any, relic?: string) {
    await continueButton(w).trigger('click')
    await nextTick()
    if (state(w).stage === 'relic') {
      await w.find(relic
        ? `button[data-relic="${relic}"]`
        : 'button[data-relic]').trigger('click')
      await nextTick()
    }
  }
  const over = (w: any) => ['won', 'lost'].includes(state(w).stage)

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
    for (let guard = 0; !over(w) && guard < 60; guard++) {
      await play(w, true)
      questions++
      expect(s.result).toBe('right')
      await proceed(w)
    }
    expect(s.stage).toBe('won')
    expect(s.defeated).toBe(10)
    expect(s.hearts).toBe(s.maxHearts)
    expect(s.maxCombo).toBe(questions)
    // 10 个房间：打完第 3、6、9 间各拿一件遗物
    expect(s.relics).toHaveLength(3)
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
      await proceed(w)
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
      await proceed(w)
    }
    expect(schedules.get(first.id)!.reps).toBe(3)
    expect(schedules.get(first.id)!.dueAt).toBeGreaterThan(Date.now())
    for (let guard = 0; s.room === 1 && guard < 3; guard++) {
      await play(w, true)
      await proceed(w)
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
      await proceed(w)
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
  /** 开一局并把第一只怪物换成指定题型 */
  async function startWith(w: any, phases: string[], pick = (m: any) => !!m) {
    await startButton(w).trigger('click')
    const s = state(w)
    const m = s.monsters.find(pick)
    s.monsters = [
      { ...m, kind: 'slime', phases },
      ...s.monsters.filter((x: any) => x.word.key !== m.word.key),
    ]
    await s.enterQuestion()
    await nextTick()
    return s
  }

  it('a chest appears after every third room; the life charm adds a heart', async () => {
    const w = await open()
    await pickFirstChapter(w)
    await startButton(w).trigger('click')
    const s = state(w)
    for (let guard = 0; guard < 20; guard++) {
      await play(w, true)
      if (s.room === 2 && s.phase + 1 >= s.monster.phases.length)
        break
      await proceed(w)
    }
    await continueButton(w).trigger('click')
    await nextTick()
    expect(s.stage).toBe('relic')
    expect(w.findAll('button[data-relic]')).toHaveLength(3)
    s.offered = RELICS.filter(r => ['heart', 'shield', 'scout'].includes(r.id))
    await nextTick()
    await w.find('button[data-relic="heart"]').trigger('click')
    expect(s.stage).toBe('playing')
    expect(s.room).toBe(3)
    expect(s.hearts).toBe(4)
    expect(s.maxHearts).toBe(4)
    expect(w.text()).toContain('房间 4 / 10')
  })

  it('the shield absorbs one wrong answer, the scout removes a wrong option, the scroll shows the first letter', async () => {
    const w = await open()
    await pickFirstChapter(w)
    const s = await startWith(w, ['choice', 'spell'])
    s.relics = RELICS.filter(r => ['shield', 'scout', 'letter'].includes(r.id))
    s.shieldReady = true
    await nextTick()
    expect(w.findAll('button[data-option]')).toHaveLength(3)
    expect(w.findAll('button[data-option]').some((b: any) => b.text().includes(s.monster.word.word))).toBe(true)
    await play(w, true)
    await proceed(w)
    expect(s.question).toBe('spell')
    expect(w.text()).toContain(`首字母 ${s.monster.word.word[0]}，共 ${s.monster.word.word.length} 个字符`)
    await play(w, false)
    expect(s.hearts).toBe(3)
    expect(s.shieldReady).toBe(false)
    expect(w.text()).toContain('免死金牌挡下了这一击')
    await proceed(w)
    // 第二次答错照常扣心
    for (let guard = 0; s.result === null && guard < 5; guard++)
      await play(w, false)
    expect(s.hearts).toBe(2)
  })

  it('timed spelling: a countdown shows, running out of time counts as a miss', async () => {
    const w = await open()
    await pickFirstChapter(w)
    const s = await startWith(w, ['timed'])
    expect(w.find('[role="timer"]').text()).toContain('15 秒')
    expect(w.text()).toContain(s.monster.word.meaning)
    const missedWord = s.monster.word.word
    s.timeUp()
    await nextTick()
    expect(s.result).toBe('wrong')
    expect(s.hearts).toBe(2)
    expect(w.text()).toContain('时间到')
    expect(useMistakes().mistakes.value.map(m => m.key)).toEqual([`typing:${missedWord}`])
    // 出结果后计时不再生效
    s.timeUp()
    expect(s.hearts).toBe(2)
    await proceed(w)
    // 有沙漏多 5 秒
    s.relics = RELICS.filter(r => r.id === 'hourglass')
    s.monsters[s.room].phases = ['timed']
    await s.enterQuestion()
    await nextTick()
    expect(w.find('[role="timer"]').text()).toContain('20 秒')
  })

  it('reading words: synonym questions, and misses go to the reading mistakes under the self-test key', async () => {
    const w = await open()
    await w.find('button[data-deck="reading538"]').trigger('click')
    expect(w.text()).toContain('每局随机抽 10 个')
    const s = await startWith(w, ['synonym', 'synonym'], (m: any) => m.synonymOptions.length === 4)
    const target = s.monster.word
    expect(target.deck).toBe('reading538')
    expect(w.text()).toContain('的同义替换')
    expect(w.findAll('button[data-option]')).toHaveLength(4)
    await play(w, true)
    expect(s.result).toBe('right')
    await proceed(w)
    await play(w, false)
    expect(s.result).toBe('wrong')
    expect(w.text()).toContain(`同义替换：${target.synonyms.join(' / ')}`)
    const saved = useMistakes().mistakes.value
    expect(saved.map(m => [m.module, m.key])).toEqual([
      ['reading', target.key],
    ])
  })

  it('the daily dungeon is the same run all day, and clearing it checks in', async () => {
    const w = await open()
    expect(w.find('[data-daily]').text()).toContain('词汇表')
    await w.find('[data-daily] button').trigger('click')
    const s = state(w)
    expect(s.isDaily).toBe(true)
    expect(w.text()).toContain('每日地牢 · 房间 1 / 10')
    const first = s.monsters.map((m: any) => `${m.kind}:${m.word.key}`)
    for (let guard = 0; !over(w) && guard < 60; guard++) {
      await play(w, true)
      await proceed(w)
    }
    expect(s.stage).toBe('won')
    expect(w.text()).toContain('今天已打卡')
    expect(useCheckin().dates.value).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(nsKey('dungeon_daily_v1'))!)).toMatchObject({ won: true, score: s.score })
    const score = s.score
    // 再打一次：同一局；输了也不会把“已通关”抹掉
    await w.findAll('button').find((b: any) => b.text() === '再来一局')!.trigger('click')
    expect(s.monsters.map((m: any) => `${m.kind}:${m.word.key}`)).toEqual(first)
    for (let guard = 0; !over(w) && guard < 10; guard++) {
      await play(w, false)
      await proceed(w)
    }
    expect(s.stage).toBe('lost')
    await w.findAll('button').find((b: any) => b.text() === '返回')!.trigger('click')
    expect(w.find('[data-daily]').text()).toContain(`今日已通关 · ${score} 分`)
  })

  it('my word list: search, add, remove; it is remembered and can be fought', async () => {
    const w = await open()
    await w.findAll('button').find((b: any) => b.text() === '编辑词单')!.trigger('click')
    await w.find('input[type="search"]').setValue('atmos')
    const results = w.findAll('button[data-search-result]')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].text()).toContain('atmosphere')
    await results[0].trigger('click')
    expect(w.text()).toContain('我的词单（1）')
    await w.find('input[type="search"]').setValue('预订')
    await w.find('button[data-search-result]').trigger('click')
    expect(w.text()).toContain('我的词单（2）')
    expect(JSON.parse(localStorage.getItem(nsKey('dungeon_wordlist_v1'))!)).toHaveLength(2)
    await w.find('button[data-list-word]').trigger('click')
    expect(w.text()).toContain('我的词单（1）')
    await w.find('input[data-source="custom"]').setValue(true)
    expect(w.text()).toContain('选中 1 个词，这局 1 个房间')
    await startButton(w).trigger('click')
    expect(state(w).monsters).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(nsKey('dungeon_selection_v1'))!).custom).toBe(true)
  })
})

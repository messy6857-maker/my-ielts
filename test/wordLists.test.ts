import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import StudyCardSession from '../src/components/StudyCardSession.vue'
import { useAuth } from '../src/composables/useAuth'
import { useDeckStore } from '../src/composables/useDeckStore'
import { nsKey, useMistakes } from '../src/composables/useStudyData'
import listening179 from '../src/pages/listening/listening179.json'
import LearnPage from '../src/pages/study/learn.vue'
import ListsPage from '../src/pages/study/lists.vue'
import ReviewPage from '../src/pages/study/review.vue'
import { loadDeckCards, loadWordLists } from '../src/utils/loadStudyCards'
import { saveValue } from '../src/utils/storage'
import { listeningCards } from '../src/utils/studyDeck'
import { entryCard, fillMeanings, MAX_LIST_WORDS, mergeEntries, parseImport, readLists, saveLists } from '../src/utils/wordLists'

function entry(word: string, meaning = '', pos = '') {
  return {
    word,
    meaning,
    pos,
    synonyms: [] as string[],
  }
}

describe('importing words', () => {
  it('reads one word per line in the usual ways people write them', () => {
    const { entries, skipped } = parseImport([
      '﻿word,meaning',
      'abandon 放弃',
      'benefit,好处；利益',
      'capture\t捕获',
      'derive v. 得到',
      'elaborate adj. 详尽的',
      'take off - 起飞',
      '7. sustainable',
      'give up：放弃',
      '"in charge of","负责, 主管"',
      'vocabulary 词汇',
      '',
      '第一章',
      '12345',
    ].join('\r\n'))
    expect(entries).toEqual([
      entry('abandon', '放弃'),
      entry('benefit', '好处；利益'),
      entry('capture', '捕获'),
      entry('derive', '得到', 'v.'),
      entry('elaborate', '详尽的', 'adj.'),
      entry('take off', '起飞'),
      entry('sustainable'),
      entry('give up', '放弃'),
      entry('in charge of', '负责， 主管'),
      entry('vocabulary', '词汇'),
    ])
    expect(skipped).toBe(2)
  })

  it('the same word is kept once; a later copy only fills in a missing meaning; a list has a size limit', () => {
    const merged = mergeEntries([
      entry('Apple'),
      entry('pear', '梨'),
    ], [
      entry('apple', '苹果'),
      entry('PEAR', '别的'),
      entry('plum'),
      entry('plum'),
    ])
    expect(merged.words).toEqual([
      entry('Apple', '苹果'),
      entry('pear', '梨'),
      entry('plum'),
    ])
    expect(merged).toMatchObject({ added: 1, filled: 1 })
    const many = Array.from({ length: MAX_LIST_WORDS + 5 }, (_, i) => entry(`w${'a'.repeat(1)}${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26).toString(36).replace(/\d/g, d => 'ghijklmnop'[Number(d)])}`))
    expect(mergeEntries([], many).words.length).toBeLessThanOrEqual(MAX_LIST_WORDS)
  })

  it('missing meanings come from the site’s word lists; unknown words stay blank', () => {
    const site = listeningCards(listening179 as any)
    const [known, unknown, own] = fillMeanings([
      entry('RESERVE'),
      entry('zzqqxx'),
      entry('reserve', '我自己写的'),
    ], site)
    expect(known).toMatchObject({
      word: 'RESERVE',
      meaning: '预订',
      pos: 'v.',
      synonyms: ['book'],
    })
    expect(unknown.meaning).toBe('')
    expect(own.meaning).toBe('我自己写的')
  })

  it('a list word becomes a card of its own deck, keyed by the word itself', () => {
    expect(entryCard(entry('Take  Off', '起飞'))).toMatchObject({
      key: 'custom:take off',
      deck: 'custom',
      id: 'take off',
      word: 'Take Off',
      spellings: ['Take Off'],
      meaning: '起飞',
    })
  })
})

describe('我的词表', () => {
  const wrappers: any[] = []
  beforeEach(() => {
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    useAuth().currentUser.value = null
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [],
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => {
    wrappers.splice(0).forEach(w => w.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  async function until(check: () => boolean) {
    for (let i = 0; i < 300 && !check(); i++) {
      await new Promise(r => setTimeout(r, 5))
      await flushPromises()
    }
    expect(check()).toBe(true)
  }
  async function mountAt(Page: any, path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/:p(.*)*',
          component: { template: '<p />' },
        },
      ],
    })
    await router.push(path)
    const w = mount(Page, {
      attachTo: document.body,
      global: {
        plugins: [router],
      },
    })
    wrappers.push(w)
    await flushPromises()
    return w
  }
  const mine = () => saveLists([
    {
      id: 'a',
      name: '剑 18 生词',
      updatedAt: 1,
      words: [
        entry('serendipity', '意外发现', 'n.'),
        entry('zzqqxx'),
      ],
    },
    {
      id: 'b',
      name: '写作词',
      updatedAt: 2,
      words: [
        entry('Serendipity', '机缘'),
        entry('nevertheless', '然而', 'adv.'),
      ],
    },
  ])

  it('create a list, paste words, fix a meaning, pick from the site, remove a word, delete the list', async () => {
    const w = await mountAt(ListsPage, '/study/lists')
    expect(w.find('[data-empty]').exists()).toBe(true)
    expect(w.find('[data-back]').attributes('href')).toBe('/study')
    expect(w.find('[data-create]').attributes('disabled')).toBeDefined()
    await w.find('input[aria-label="词表名字"]').setValue('  剑 18 生词 ')
    await w.find('form').trigger('submit')
    expect(readLists().map(l => l.name)).toEqual(['剑 18 生词'])
    // 进到这个词表：粘贴导入
    await w.find('textarea[aria-label="粘贴单词"]').setValue('serendipity 意外发现\nreserve\nzzqqxx\nreserve\n???')
    await w.find('[data-import]').trigger('click')
    await until(() => w.find('[data-notice]').exists())
    expect(w.find('[data-notice]').text()).toBe('加了 3 个词，1 个已经在词表里或重复，1 行没认出来，1 个没找到释义，可以在下面自己补。')
    expect(w.find('[data-count]').text()).toBe('3 个词，1 个还没有释义。')
    expect(readLists()[0].words.map(x => [x.word, x.meaning])).toEqual([
      ['serendipity', '意外发现'],
      ['reserve', '预订'],
      ['zzqqxx', ''],
    ])
    const fix = w.find('input[aria-label="zzqqxx 的释义"]')
    await fix.setValue('自己补的')
    await fix.trigger('change')
    expect(readLists()[0].words[2].meaning).toBe('自己补的')
    expect(w.find('[data-count]').text()).toBe('3 个词。')
    // 从网站词库里选
    await w.find('[data-add="site"]').trigger('click')
    await w.find('input[aria-label="搜索网站词库"]').setValue('atmosph')
    await until(() => w.findAll('[data-results] button').length > 0)
    const hit = w.find('[data-results] button')
    expect(hit.text()).toContain('atmosphere')
    await hit.trigger('click')
    expect(readLists()[0].words.map(x => x.word)).toContain('atmosphere')
    expect(w.find('[data-results] button').attributes('disabled')).toBeDefined()
    // 移走一个词
    await w.findAll('[data-words] button').find((b: any) => b.attributes('title') === '从词表里移走 reserve')!.trigger('click')
    expect(readLists()[0].words.map(x => x.word)).toEqual(['serendipity', 'zzqqxx', 'atmosphere'])
    // 去学新词、练拼写的链接带着这个词表
    const id = readLists()[0].id
    expect(w.find('[data-go-learn]').attributes('href')).toBe(`/study/learn?deck=custom&list=${id}`)
    expect(w.find('[data-go-spell]').attributes('href')).toBe(`/study/spell?source=custom&list=${id}`)
    // 返回列表
    await w.find('button[data-back]').trigger('click')
    expect(w.find(`[data-list="${id}"]`).text()).toContain('3 个词')
  })

  it('a file is imported like pasted text', async () => {
    saveLists([
      {
        id: 'a',
        name: 'x',
        updatedAt: 1,
        words: [],
      },
    ])
    const w = await mountAt(ListsPage, '/study/lists')
    await w.find('[data-list="a"]').trigger('click')
    await w.find('[data-add="file"]').trigger('click')
    const input = w.find('input[type="file"]')
    const file = new File(['word,meaning\nabandon,放弃\nbenefit,好处'], 'words.csv', { type: 'text/csv' })
    if (typeof file.text !== 'function')
      (file as any).text = async () => 'word,meaning\nabandon,放弃\nbenefit,好处'
    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
    await until(() => w.find('[data-notice]').exists())
    expect(readLists()[0].words.map(x => [x.word, x.meaning])).toEqual([
      ['abandon', '放弃'],
      ['benefit', '好处'],
    ])
  })

  it('the dungeon’s 我的词单 shows up as a read-only list', async () => {
    saveValue(nsKey('dungeon_wordlist_v1'), ['listening179:1', 'listening179:2'])
    const lists = await loadWordLists()
    expect(lists.map(l => [l.id, l.words.length])).toEqual([
      ['dungeon', 2],
    ])
    expect(lists[0].words[0]).toMatchObject({ word: 'reserve', meaning: '预订' })
    const w = await mountAt(ListsPage, '/study/lists')
    await until(() => w.find('[data-list="dungeon"]').exists())
    await w.find('[data-list="dungeon"]').trigger('click')
    expect(w.find('[data-add]').exists()).toBe(false)
    expect(w.find('[data-words] input').exists()).toBe(false)
    expect(w.find('[data-count]').text()).toContain('在单词地牢的选词页里编辑')
  })

  it('学新词 studies one chosen list; progress, new-word count and mistakes are kept apart from the site’s lists', async () => {
    mine()
    expect((await loadDeckCards('custom')).map(c => c.key)).toEqual(['custom:serendipity', 'custom:zzqqxx', 'custom:nevertheless'])
    const w = await mountAt(LearnPage, '/study/learn?deck=custom&list=b')
    await until(() => w.find('[data-start]').attributes('disabled') === undefined)
    expect(w.find('[data-deck-choice="custom"]').attributes('aria-pressed')).toBe('true')
    expect((w.find('select[aria-label="词表"]').element as HTMLSelectElement).value).toBe('b')
    expect(w.find('[data-preview]').text()).toContain('新词 2 个')
    expect(w.findAll('[data-practice]').map((b: any) => b.attributes('data-practice'))).toEqual(['recognize', 'spell', 'related'])
    await w.find('[data-start]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('学新词 · 我的词表')
    expect(w.find('[data-word]').text()).toBe('Serendipity')
    await w.findAll('button').find((b: any) => b.text().trim() === '不认识')!.trigger('click')
    await flushPromises()
    const store = useDeckStore('custom')
    expect(Object.keys(store.schedules.value)).toEqual(['custom:serendipity'])
    expect(store.dailyCount.value).toBe(1)
    expect(useMistakes().mistakes.value.find(m => m.key === 'custom:serendipity')?.module).toBe('wordlist')
    expect(Object.keys(useDeckStore('listening179').schedules.value)).toHaveLength(0)
    // 同一个词在另一个词表里是同一份进度：复习页里只出一张
    const review = await mountAt(ReviewPage, '/study/review')
    await until(() => review.find('[data-start]').exists())
    expect((review.find('[data-review-deck="custom"]').element as HTMLInputElement).checked).toBe(true)
    expect(review.find('[data-preview]').text()).toContain('这一轮复习 1 个')
    await review.find('[data-start]').trigger('click')
    await flushPromises()
    expect(review.find('[data-deck-label]').text()).toBe('来自 我的词表')
    expect(review.findComponent(StudyCardSession).exists()).toBe(true)
  })

  it('no list yet: 学新词 says so, links to 我的词表 and cannot start; a word without a meaning says so on its card', async () => {
    const w = await mountAt(LearnPage, '/study/learn?deck=custom')
    await until(() => w.text().includes('还没有词表'))
    expect(w.find('[data-manage-lists]').attributes('href')).toBe('/study/lists')
    expect(w.find('[data-start]').attributes('disabled')).toBeDefined()
    w.unmount()
    wrappers.pop()
    saveLists([
      {
        id: 'a',
        name: 'x',
        updatedAt: 1,
        words: [
          entry('zzqqxx'),
        ],
      },
    ])
    const again = await mountAt(LearnPage, '/study/learn?deck=custom')
    await until(() => again.find('[data-start]').attributes('disabled') === undefined)
    await again.find('[data-start]').trigger('click')
    await flushPromises()
    await again.findAll('button').find((b: any) => b.text().trim() === '认识')!.trigger('click')
    await flushPromises()
    expect(again.find('[data-study]').text()).toContain('还没有释义')
  })
})

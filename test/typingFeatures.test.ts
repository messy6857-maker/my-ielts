import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuth } from '../src/composables/useAuth'
import { useMistakes } from '../src/composables/useStudyData'
import { TYPING_SOUND_KEY, useTypingSound } from '../src/composables/useTypingSound'
import daily from '../src/pages/reading/daily/2026-11-25.json'
import TypingPage from '../src/pages/reading/typing.vue'
import SpellPage from '../src/pages/study/spell.vue'
import { checkTyping, normalizeTyped, splitSentences, typingTarget, wordCount } from '../src/utils/articleTyping'
import { addMasteredWord, masteredStorageKey, readMasteredWords, removeMasteredWord, withoutMastered } from '../src/utils/masteredWords'
import { liveLetters } from '../src/utils/spellPractice'
import { isStudyKey } from '../src/utils/storage'

describe('文章分句', () => {
  it('splits on sentence ends but not on abbreviations, initials or decimals', () => {
    expect(splitSentences('Dr. Smith arrived at 3.5 p.m. on Monday. The U.S. team won! Did they? "Yes," she said.')).toEqual([
      'Dr. Smith arrived at 3.5 p.m. on Monday.',
      'The U.S. team won!',
      'Did they?',
      '"Yes," she said.',
    ])
  })
  it('keeps paragraphs apart and joins wrapped lines', () => {
    expect(splitSentences('First line\ncontinues here.\n\nSecond paragraph')).toEqual([
      'First line continues here.',
      'Second paragraph',
    ])
  })
  it('every real daily article splits into reasonable sentences', () => {
    for (const r of daily.newsReadings) {
      const s = splitSentences(r.passage)
      expect(s.length).toBeGreaterThan(3)
      expect(s.join(' ').replace(/\s+/g, ' ')).toBe(r.passage.replace(/\s+/g, ' ').trim())
    }
  })
})

describe('逐字比对', () => {
  it('ignores case, accents, curly quotes and punctuation by default', () => {
    const s = 'Türkiye\'s “bold” plan.'
    expect(checkTyping('turkiyes bold plan', s).done).toBe(true)
    expect(checkTyping('TURKIYES BOLD PLAN', s).done).toBe(true)
    expect(checkTyping('turkiye\'s bold plan.', s).done).toBe(true)
  })
  it('hyphens and dashes count as spaces when punctuation is skipped', () => {
    expect(checkTyping('a well known fact', 'A well-known fact').done).toBe(true)
    expect(checkTyping('a well-known fact', 'A well-known fact').done).toBe(true)
    expect(checkTyping('rain then sun', 'Rain — then sun').done).toBe(true)
  })
  it('strict mode needs the punctuation too', () => {
    const s = 'Yes, it is.'
    expect(checkTyping('yes it is', s, true).done).toBe(false)
    expect(checkTyping('yes, it is.', s, true).done).toBe(true)
  })
  it('marks each typed character and counts extra characters as errors', () => {
    const c = checkTyping('cbt', 'Cat')
    expect(c.chars.map(x => x.state)).toEqual(['ok', 'bad', 'ok'])
    expect(c.chars[1].typed).toBe('b')
    expect(c.errors).toBe(1)
    expect(c.done).toBe(false)
    expect(checkTyping('cats', 'Cat').errors).toBe(1)
    expect(checkTyping('ca', 'Cat').chars.map(x => x.state)).toEqual(['ok', 'ok', 'todo'])
  })
  it('skipped punctuation shows as passed once the typing reaches it', () => {
    const c = checkTyping('hi', 'Hi, you')
    expect(c.chars.map(x => x.state)).toEqual([
      'ok',
      'ok',
      'passed',
      'todo',
      'todo',
      'todo',
      'todo',
    ])
  })
  it('extra spaces are collapsed and trailing spaces are not required', () => {
    expect(normalizeTyped('  the   cat ')).toBe('the cat ')
    expect(typingTarget('the cat ').filter(t => t.need !== null).map(t => t.need).join('')).toBe('the cat')
    expect(checkTyping('the  cat', 'the cat').done).toBe(true)
  })
  it('counts words for speed', () => {
    expect(wordCount('It was 2026 — a big year.')).toBe(6)
  })
})

describe('边打边显示对错', () => {
  it('compares with the spelling that matches best, case-insensitive, and never reveals what is left', () => {
    const card = {
      word: 'colour',
      spellings: ['colour', 'color'],
    }
    expect(liveLetters('Colo', card).map(l => l.ok)).toEqual([true, true, true, true])
    expect(liveLetters('colr', card).map(l => l.ok)).toEqual([true, true, true, false])
    expect(liveLetters('xy', card).map(l => l.ok)).toEqual([false, false])
    expect(liveLetters('', card)).toEqual([])
  })
})

describe('已掌握的词', () => {
  beforeEach(() => localStorage.clear())
  it('is kept per account by word, removable, and filters any deck', () => {
    addMasteredWord('alice', { word: 'Apple' })
    addMasteredWord('alice', { word: 'apple' })
    expect(readMasteredWords('alice')).toEqual(['apple'])
    expect(readMasteredWords('bob')).toEqual([])
    const cards = [
      { word: 'apple' },
      { word: 'pear' },
      { word: 'APPLE ' },
    ]
    expect(withoutMastered(cards, readMasteredWords('alice'))).toEqual([
      { word: 'pear' },
    ])
    removeMasteredWord('alice', 'apple')
    expect(readMasteredWords('alice')).toEqual([])
  })
  it('stays on this device: it is not a study record the sync server would reject', () => {
    expect(isStudyKey(masteredStorageKey('alice'))).toBe(false)
    expect(isStudyKey(masteredStorageKey(null))).toBe(false)
  })
})

describe('打字音效开关', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  it('plays through Web Audio only while switched on', () => {
    let oscillators = 0
    const param = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    }
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator() {
        oscillators++
        return {
          type: '',
          frequency: param,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }
      }

      createGain() {
        return {
          gain: param,
          connect: vi.fn(),
        }
      }
    })
    const sound = useTypingSound()
    sound.play('key')
    expect(oscillators).toBe(1)
    sound.enabled.value = false
    sound.play('done')
    expect(oscillators).toBe(1)
  })
  it('defaults to on and remembers the choice on this device', async () => {
    expect(useTypingSound().enabled.value).toBe(true)
    localStorage.setItem(TYPING_SOUND_KEY, '0')
    expect(useTypingSound().enabled.value).toBe(false)
  })
})

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise(r => setTimeout(r, 5))
    await flushPromises()
  }
  expect(check()).toBe(true)
}
function key(target: EventTarget, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}
const wrappers: any[] = []
function stubSpeech() {
  const speak = vi.fn()
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak,
    getVoices: () => [],
  })
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    lang = ''
    rate = 1
    constructor(public text: string) {}
  })
  return speak
}
async function openPage(component: any, url: string, ready: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/:p(.*)*',
        component: { template: '<p />' },
      },
    ],
  })
  await router.push(url)
  const w = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router],
    },
  })
  wrappers.push(w)
  await until(() => w.find(ready).exists())
  return w
}

describe('练拼写：音效、即时反馈、已掌握、快捷键', () => {
  let mediaPlay: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    localStorage.clear()
    useAuth().currentUser.value = null
    stubSpeech()
    mediaPlay = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => {
    wrappers.splice(0).forEach(w => w.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  async function start(mode = 'dictation') {
    const w = await openPage(SpellPage, '/study/spell', '[data-start]')
    await w.find('[data-source="listening179"]').trigger('click')
    await w.find(`[data-mode="${mode}"]`).trigger('click')
    await w.find('[data-size="10"]').trigger('click')
    await w.find('[data-start]').trigger('click')
    await flushPromises()
    return w
  }
  const current = (w: any) => w.vm.$.setupState.current

  it('shows typed letters right or wrong while typing, and can be switched off', async () => {
    const w = await start()
    const word: string = current(w).word
    await w.find('input[aria-label="拼写"]').setValue(`${word[0]}#`)
    const spans = w.findAll('[data-live] span')
    expect(spans.map((s: any) => s.classes().includes('text-green-600'))).toEqual([true, false])
    expect(w.find('[data-live]').text()).toBe(`${word[0]}#`)
    await w.find('[data-back]').trigger('click')
    await w.find('[data-live-toggle]').setValue(false)
    await w.find('[data-start]').trigger('click')
    await flushPromises()
    await w.find('input[aria-label="拼写"]').setValue('#')
    expect(w.find('[data-live]').exists()).toBe(false)
  })

  it('“mastered” skips the word now and in later rounds, and can be undone', async () => {
    const w = await start()
    const first = current(w)
    await w.find('[data-master]').trigger('click')
    await flushPromises()
    expect(readMasteredWords(null)).toEqual([
      first.word.toLowerCase().trim(),
    ])
    expect(current(w).word).not.toBe(first.word)
    await w.find('[data-back]').trigger('click')
    expect(w.find('[data-preview]').text()).toContain('已跳过 1 个已掌握的词')
    expect((w.vm as any).$.setupState.pool.some((c: any) => c.word === first.word)).toBe(false)
    await w.find('[data-mastered-list] summary').trigger('click')
    await w.find(`[data-unmaster="${readMasteredWords(null)[0]}"]`).trigger('click')
    expect(readMasteredWords(null)).toEqual([])
    expect(w.find('[data-preview]').text()).not.toContain('已跳过')
  })

  it('alt+S shows the answer as a miss; Alt+H shows the hint; Tab in the box replays the sound', async () => {
    const w = await start()
    const input = w.find('input[aria-label="拼写"]').element
    key(input, { key: 'h', code: 'KeyH', altKey: true })
    await flushPromises()
    expect(w.find('[data-hint]').exists()).toBe(true)
    const before = mediaPlay.mock.calls.length
    key(input, { key: 'Tab' })
    expect(mediaPlay.mock.calls.length).toBe(before + 1)
    const word = current(w).word
    key(input, { key: 's', code: 'KeyS', altKey: true })
    await flushPromises()
    expect(w.find('[data-answer]').text()).toContain('没拼对')
    expect(useMistakes().mistakes.value.some(m => m.title === word)).toBe(true)
    // 看过答案后 Alt+M 仍可标为已掌握，并进入下一个
    key(window, { key: 'm', code: 'KeyM', altKey: true })
    await flushPromises()
    expect(readMasteredWords(null)).toContain(word.toLowerCase().trim())
    expect(w.find('[data-answer]').exists()).toBe(false)
  })

  it('the shortcut legend is on the page', async () => {
    const w = await start('typing')
    expect(w.find('[data-shortcuts]').text()).toContain('Alt+M')
    expect(w.find('[data-give-up]').text()).toBe('跳过这个词')
  })
})

describe('文章跟打 / 默写页面', () => {
  let speak: ReturnType<typeof vi.fn>
  const sentences = splitSentences(daily.newsReadings[0].passage)
  beforeEach(() => {
    localStorage.clear()
    speak = stubSpeech()
  })
  afterEach(() => {
    wrappers.splice(0).forEach(w => w.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  const typingUrl = (mode = '') => `/reading/typing?date=2026-11-25&a=0${mode}`

  it('copy mode: typing a sentence moves on to the next one and remembers the place', async () => {
    const w = await openPage(TypingPage, typingUrl(), '[data-typing-input]')
    expect(w.find('[data-typing-progress]').text()).toBe(`第 1 / ${sentences.length} 句`)
    expect(w.find('[data-sentence]').text()).toBe(sentences[0])
    await w.find('[data-typing-input]').setValue(sentences[0].toLowerCase())
    await until(() => w.find('[data-typing-progress]').text().startsWith('第 2 '))
    expect(w.find('[data-sentence]').text()).toBe(sentences[1])
    w.unmount()
    wrappers.splice(0)
    const again = await openPage(TypingPage, typingUrl(), '[data-typing-input]')
    expect(again.find('[data-typing-progress]').text()).toContain('第 2 ')
  })

  it('dictation mode hides letters until they are typed right and reads the sentence aloud', async () => {
    const w = await openPage(TypingPage, typingUrl('&mode=dictation'), '[data-typing-input]')
    expect(speak).toHaveBeenCalled()
    const shown = w.find('[data-sentence]').text()
    expect(shown).not.toContain(sentences[0].split(' ')[1])
    expect(shown).toMatch(/_/)
    const firstWord = sentences[0].split(' ')[0]
    await w.find('[data-typing-input]').setValue(firstWord)
    expect(w.find('[data-sentence]').text().startsWith(firstWord)).toBe(true)
    await w.find('[data-peek]').trigger('click')
    expect(w.find('[data-sentence]').text()).toBe(sentences[0])
  })

  it('alt+S skips a sentence; the last one shows the summary', async () => {
    const w = await openPage(TypingPage, typingUrl(), '[data-typing-input]')
    for (let i = 0; i < sentences.length; i++) {
      key(w.find('[data-typing-input]').element, { key: 's', code: 'KeyS', altKey: true })
      await flushPromises()
    }
    expect(w.find('[data-typing-done]').exists()).toBe(true)
  })
})

import { afterEach, beforeEach, expect, it } from 'vitest'
import { accountKey } from '../src/utils/storage'
import {
  readChapterPreference,
  writeChapterPreference,
} from '../src/utils/chapterPreference'

const CHAPTERS = ['01_自然地理', '02_植物研究', '03_动物保护']
const BASE = 'vocabulary_chapter'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

it('falls back to the bare legacy key when the scoped key is empty', () => {
  localStorage.setItem(BASE, '02_植物研究')
  expect(readChapterPreference(BASE, CHAPTERS, 'alice')).toBe('02_植物研究')
  expect(readChapterPreference(BASE, CHAPTERS, null)).toBe('02_植物研究')
})

it('prefers the account-scoped key over the legacy key', () => {
  localStorage.setItem(BASE, '02_植物研究')
  localStorage.setItem(accountKey(BASE, 'alice'), '03_动物保护')
  expect(readChapterPreference(BASE, CHAPTERS, 'alice')).toBe('03_动物保护')
  // Guest still reads its own scoped/legacy value, not alice's.
  expect(readChapterPreference(BASE, CHAPTERS, null)).toBe('02_植物研究')
})

it('writes under the account-scoped key without clobbering the legacy key', () => {
  localStorage.setItem(BASE, '01_自然地理')
  writeChapterPreference(BASE, '02_植物研究', 'alice')
  expect(localStorage.getItem(accountKey(BASE, 'alice'))).toBe('02_植物研究')
  expect(localStorage.getItem(BASE)).toBe('01_自然地理')
  expect(localStorage.getItem(accountKey(BASE, null))).toBeNull()
})

it('returns the first chapter when stored values are unknown', () => {
  localStorage.setItem(BASE, 'not-a-chapter')
  expect(readChapterPreference(BASE, CHAPTERS, 'alice')).toBe('01_自然地理')
})

import { expect, it } from 'vitest'
import {
  countCorrect,
  mapLabelPlaceholder,
  mockQuestionStatus,
  restoreTimeLeft,
  toggleMultiSelectValue,
  totalScorePoints,
} from '../src/pages/mock/types'
import type { MockQuestion } from '../src/pages/mock/types'

const mc: MockQuestion = { id: 'Q1', type: 'multiple-choice', question: 'x', options: ['a', 'b'], answer: 1 }
const ms: MockQuestion = { id: 'Q2', type: 'multi-select', question: 'Choose TWO', options: ['a', 'b', 'c'], answer: [0, 2] }
const roman: MockQuestion = { id: 'Q14', type: 'map-label', question: 'Section A', answer: 'vii' }
const letter: MockQuestion = { id: 'Q15', type: 'map-label', question: 'School', answer: 'G' }
const letterI: MockQuestion = { id: 'Q12', type: 'map-label', question: 'helping at concerts', answer: 'I' }

it('totalScorePoints counts multi-select by answer count', () => {
  expect(totalScorePoints([mc, ms])).toBe(3)
  expect(totalScorePoints([])).toBe(0)
})

it('countCorrect returns 0 before submit and scores after', () => {
  expect(countCorrect([mc, ms], { Q1: '1', Q2: '0,2' }, false)).toBe(0)
  expect(countCorrect([mc, ms], { Q1: '1', Q2: '0,2' }, true)).toBe(3)
  expect(countCorrect([mc, ms], { Q1: '1', Q2: '0' }, true)).toBe(2)
})

it('mockQuestionStatus mirrors the pages', () => {
  expect(mockQuestionStatus(mc, '', true)).toBe('unanswered')
  expect(mockQuestionStatus(mc, '1', true)).toBe('correct')
  expect(mockQuestionStatus(mc, '0', true)).toBe('wrong')
  expect(mockQuestionStatus(ms, '0', true)).toBe('partial')
  expect(mockQuestionStatus(ms, '0,2', true)).toBe('correct')
  expect(mockQuestionStatus(mc, '1', false)).toBe('unanswered')
})

it('toggleMultiSelectValue toggles and caps at the answer count', () => {
  expect(toggleMultiSelectValue('', 0, 2)).toBe('0')
  expect(toggleMultiSelectValue('0', 2, 2)).toBe('0,2')
  expect(toggleMultiSelectValue('0,2', 1, 2)).toBe('0,2')
  expect(toggleMultiSelectValue('0,2', 0, 2)).toBe('2')
})

it('restoreTimeLeft clamps a draft and falls back to the limit', () => {
  expect(restoreTimeLeft(99999, 2400)).toBe(2400)
  expect(restoreTimeLeft(-5, 2400)).toBe(0)
  expect(restoreTimeLeft(600, 2400)).toBe(600)
  expect(restoreTimeLeft(null, 2400)).toBe(2400)
})

it('mapLabelPlaceholder distinguishes roman numerals from letters', () => {
  expect(mapLabelPlaceholder(roman)).toBe('输入序号，如 vii')
  expect(mapLabelPlaceholder({ ...roman, answer: 'i' })).toBe('输入序号，如 vii')
  expect(mapLabelPlaceholder({ ...roman, answer: 'viii' })).toBe('输入序号，如 vii')
  expect(mapLabelPlaceholder(letter)).toBe('输入字母')
  // 大写 I 是地图/配对题的字母答案，不是罗马数字 i
  expect(mapLabelPlaceholder(letterI)).toBe('输入字母')
  expect(mapLabelPlaceholder(mc)).toBe('输入答案')
})

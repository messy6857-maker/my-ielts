import type { MockQuestion } from '../src/pages/mock/types'
import { expect, it } from 'vitest'
import {
  isCorrect,
  listeningBandScore,
  readingBandScore,
} from '../src/pages/mock/types'

function blank(answer: string | string[]): MockQuestion {
  return {
    id: 'Q1',
    type: 'fill-blank',
    question: '____',
    answer,
  }
}

it('listening uses the published IELTS/IDP conversion', () => {
  const expected = [
    [40, 9],
    [39, 9],
    [38, 8.5],
    [37, 8.5],
    [36, 8],
    [35, 8],
    [34, 7.5],
    [32, 7.5],
    [31, 7],
    [30, 7],
    [29, 6.5],
    [26, 6.5],
    [25, 6],
    [23, 6],
    [22, 5.5],
    [18, 5.5],
    [17, 5],
    [16, 5],
    [15, 4.5],
    [13, 4.5],
    [12, 4],
    [11, 4],
    [10, 3.5],
    [8, 3.5],
    [7, 3],
    [6, 3],
    [5, 2.5],
    [0, 2.5],
  ]
  for (const [raw, band] of expected)
    expect(listeningBandScore(raw)).toBe(band)
})

it('academic reading uses its own conversion', () => {
  const expected = [
    [39, 9],
    [37, 8.5],
    [35, 8],
    [33, 7.5],
    [32, 7],
    [30, 7],
    [29, 6.5],
    [27, 6.5],
    [26, 6],
    [23, 6],
    [22, 5.5],
    [19, 5.5],
    [18, 5],
    [15, 5],
    [14, 4.5],
    [13, 4.5],
    [12, 4],
    [10, 4],
    [9, 3.5],
    [8, 3.5],
    [6, 3],
    [5, 2.5],
  ]
  for (const [raw, band] of expected)
    expect(readingBandScore(raw)).toBe(band)
})

it.each([
  ['flavour', 'flavor'],
  ['labour', 'labor'],
  ['behaviour', 'Behavior'],
  ['visualisation', 'visualization'],
  ['jewellery', 'jewelry'],
  ['centre', 'center'],
  ['travelled', 'traveled'],
  ['24th april', 'April 24'],
  ['24th april', '24 April'],
  ['13 January', 'January 13th'],
  ['1000 kg', '1,000kg'],
  ['9.75', '£9.75'],
  ['dw30 7yz', 'DW307YZ'],
  ['the library', ' the  library. '],
  ['part-time', 'part time'],
])('accepts %s written as %s', (answer, user) => {
  expect(isCorrect(blank(answer), user)).toBe(true)
})

it.each([
  ['noise', 'noize'],
  ['installed', 'instaled'],
  ['walls', 'wall'],
  ['1000 kg', '1000'],
  ['dw30 7yz', 'DW30 7YX'],
  ['exercise', 'exercize'],
])('still rejects %s written as %s', (answer, user) => {
  expect(isCorrect(blank(answer), user)).toBe(false)
})

it('only ignores ordinal suffixes in dates', () => {
  expect(isCorrect(blank(['third', '3rd']), '3')).toBe(false)
  expect(isCorrect(blank(['third', '3rd']), '3RD')).toBe(true)
  expect(isCorrect(blank('x'), '')).toBe(false)
})

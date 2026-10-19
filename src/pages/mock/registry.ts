import type { ListeningMockTest, ReadingMockTest } from './types'
import { cam19Test1Listening } from './cam19-test1-listening'
import { cam19Test1Reading } from './cam19-test1-reading'
import { cam18Test1Listening } from './cam18-test1-listening'
import { cam18Test1Reading } from './cam18-test1-reading'
import { cam21Test1Listening } from './cam21-test1-listening'
import { cam21Test1Reading } from './cam21-test1-reading'
import { cam20Test1Listening } from './cam20-test1-listening'
import { cam20Test1Reading } from './cam20-test1-reading'
import { cam17Test1Listening } from './cam17-test1-listening'
import { cam17Test1Reading } from './cam17-test1-reading'
import { cam16Test1Listening } from './cam16-test1-listening'
import { cam16Test1Reading } from './cam16-test1-reading'
import { cam15Test1Listening } from './cam15-test1-listening'
import { cam15Test1Reading } from './cam15-test1-reading'

export interface MockTestPair {
  id: string
  label: string
  listening: ListeningMockTest
  reading: ReadingMockTest
}

export const mockTests: MockTestPair[] = [
  {
    id: 'cam21-test1',
    label: '剑21 Test 1',
    listening: cam21Test1Listening,
    reading: cam21Test1Reading,
  },
  {
    id: 'cam20-test1',
    label: '剑20 Test 1',
    listening: cam20Test1Listening,
    reading: cam20Test1Reading,
  },
  {
    id: 'cam19-test1',
    label: '剑19 Test 1',
    listening: cam19Test1Listening,
    reading: cam19Test1Reading,
  },
  {
    id: 'cam18-test1',
    label: '剑18 Test 1',
    listening: cam18Test1Listening,
    reading: cam18Test1Reading,
  },
  {
    id: 'cam17-test1',
    label: '剑17 Test 1',
    listening: cam17Test1Listening,
    reading: cam17Test1Reading,
  },
  {
    id: 'cam16-test1',
    label: '剑16 Test 1',
    listening: cam16Test1Listening,
    reading: cam16Test1Reading,
  },
  {
    id: 'cam15-test1',
    label: '剑15 Test 1',
    listening: cam15Test1Listening,
    reading: cam15Test1Reading,
  },
  // 新套题按此格式追加
]

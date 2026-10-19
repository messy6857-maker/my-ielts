import type { ListeningMockTest, ReadingMockTest } from './types'

export interface MockTestPair {
  id: string
  label: string
  listening: ListeningMockTest
  reading: ReadingMockTest
}

// 懒加载：只加载用户选中的那套题（收录范围：剑18–剑21）
const loaders: Record<string, () => Promise<MockTestPair>> = {
  'cam21-test1': async () => {
    const [{ cam21Test1Listening }, { cam21Test1Reading }] = await Promise.all([
      import('./cam21-test1-listening'),
      import('./cam21-test1-reading'),
    ])
    return { id: 'cam21-test1', label: '剑21 Test 1', listening: cam21Test1Listening, reading: cam21Test1Reading }
  },
  'cam21-test2': async () => {
    const [{ cam21Test2Listening }, { cam21Test2Reading }] = await Promise.all([
      import('./cam21-test2-listening'),
      import('./cam21-test2-reading'),
    ])
    return { id: 'cam21-test2', label: '剑21 Test 2', listening: cam21Test2Listening, reading: cam21Test2Reading }
  },
  'cam21-test3': async () => {
    const [{ cam21Test3Listening }, { cam21Test3Reading }] = await Promise.all([
      import('./cam21-test3-listening'),
      import('./cam21-test3-reading'),
    ])
    return { id: 'cam21-test3', label: '剑21 Test 3', listening: cam21Test3Listening, reading: cam21Test3Reading }
  },
  'cam21-test4': async () => {
    const [{ cam21Test4Listening }, { cam21Test4Reading }] = await Promise.all([
      import('./cam21-test4-listening'),
      import('./cam21-test4-reading'),
    ])
    return { id: 'cam21-test4', label: '剑21 Test 4', listening: cam21Test4Listening, reading: cam21Test4Reading }
  },
  'cam20-test1': async () => {
    const [{ cam20Test1Listening }, { cam20Test1Reading }] = await Promise.all([
      import('./cam20-test1-listening'),
      import('./cam20-test1-reading'),
    ])
    return { id: 'cam20-test1', label: '剑20 Test 1', listening: cam20Test1Listening, reading: cam20Test1Reading }
  },
  'cam20-test2': async () => {
    const [{ cam20Test2Listening }, { cam20Test2Reading }] = await Promise.all([
      import('./cam20-test2-listening'),
      import('./cam20-test2-reading'),
    ])
    return { id: 'cam20-test2', label: '剑20 Test 2', listening: cam20Test2Listening, reading: cam20Test2Reading }
  },
  'cam20-test3': async () => {
    const [{ cam20Test3Listening }, { cam20Test3Reading }] = await Promise.all([
      import('./cam20-test3-listening'),
      import('./cam20-test3-reading'),
    ])
    return { id: 'cam20-test3', label: '剑20 Test 3', listening: cam20Test3Listening, reading: cam20Test3Reading }
  },
  'cam20-test4': async () => {
    const [{ cam20Test4Listening }, { cam20Test4Reading }] = await Promise.all([
      import('./cam20-test4-listening'),
      import('./cam20-test4-reading'),
    ])
    return { id: 'cam20-test4', label: '剑20 Test 4', listening: cam20Test4Listening, reading: cam20Test4Reading }
  },
  'cam19-test1': async () => {
    const [{ cam19Test1Listening }, { cam19Test1Reading }] = await Promise.all([
      import('./cam19-test1-listening'),
      import('./cam19-test1-reading'),
    ])
    return { id: 'cam19-test1', label: '剑19 Test 1', listening: cam19Test1Listening, reading: cam19Test1Reading }
  },
  'cam19-test2': async () => {
    const [{ cam19Test2Listening }, { cam19Test2Reading }] = await Promise.all([
      import('./cam19-test2-listening'),
      import('./cam19-test2-reading'),
    ])
    return { id: 'cam19-test2', label: '剑19 Test 2', listening: cam19Test2Listening, reading: cam19Test2Reading }
  },
  'cam19-test3': async () => {
    const [{ cam19Test3Listening }, { cam19Test3Reading }] = await Promise.all([
      import('./cam19-test3-listening'),
      import('./cam19-test3-reading'),
    ])
    return { id: 'cam19-test3', label: '剑19 Test 3', listening: cam19Test3Listening, reading: cam19Test3Reading }
  },
  'cam19-test4': async () => {
    const [{ cam19Test4Listening }, { cam19Test4Reading }] = await Promise.all([
      import('./cam19-test4-listening'),
      import('./cam19-test4-reading'),
    ])
    return { id: 'cam19-test4', label: '剑19 Test 4', listening: cam19Test4Listening, reading: cam19Test4Reading }
  },
  'cam18-test1': async () => {
    const [{ cam18Test1Listening }, { cam18Test1Reading }] = await Promise.all([
      import('./cam18-test1-listening'),
      import('./cam18-test1-reading'),
    ])
    return { id: 'cam18-test1', label: '剑18 Test 1', listening: cam18Test1Listening, reading: cam18Test1Reading }
  },
  'cam18-test2': async () => {
    const [{ cam18Test2Listening }, { cam18Test2Reading }] = await Promise.all([
      import('./cam18-test2-listening'),
      import('./cam18-test2-reading'),
    ])
    return { id: 'cam18-test2', label: '剑18 Test 2', listening: cam18Test2Listening, reading: cam18Test2Reading }
  },
  'cam18-test3': async () => {
    const [{ cam18Test3Listening }, { cam18Test3Reading }] = await Promise.all([
      import('./cam18-test3-listening'),
      import('./cam18-test3-reading'),
    ])
    return { id: 'cam18-test3', label: '剑18 Test 3', listening: cam18Test3Listening, reading: cam18Test3Reading }
  },
  'cam18-test4': async () => {
    const [{ cam18Test4Listening }, { cam18Test4Reading }] = await Promise.all([
      import('./cam18-test4-listening'),
      import('./cam18-test4-reading'),
    ])
    return { id: 'cam18-test4', label: '剑18 Test 4', listening: cam18Test4Listening, reading: cam18Test4Reading }
  },
}

export const mockTestList = [
  { id: 'cam21-test1', label: '剑21 Test 1' },
  { id: 'cam21-test2', label: '剑21 Test 2' },
  { id: 'cam21-test3', label: '剑21 Test 3' },
  { id: 'cam21-test4', label: '剑21 Test 4' },
  { id: 'cam20-test1', label: '剑20 Test 1' },
  { id: 'cam20-test2', label: '剑20 Test 2' },
  { id: 'cam20-test3', label: '剑20 Test 3' },
  { id: 'cam20-test4', label: '剑20 Test 4' },
  { id: 'cam19-test1', label: '剑19 Test 1' },
  { id: 'cam19-test2', label: '剑19 Test 2' },
  { id: 'cam19-test3', label: '剑19 Test 3' },
  { id: 'cam19-test4', label: '剑19 Test 4' },
  { id: 'cam18-test1', label: '剑18 Test 1' },
  { id: 'cam18-test2', label: '剑18 Test 2' },
  { id: 'cam18-test3', label: '剑18 Test 3' },
  { id: 'cam18-test4', label: '剑18 Test 4' },
]

export function loadMockTest(id: string): Promise<MockTestPair> {
  const loader = loaders[id] ?? loaders['cam21-test1']
  return loader()
}

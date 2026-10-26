import type { ListeningMockTest, ReadingMockTest } from './types'

export interface MockTestPair { id: string; label: string; listening: ListeningMockTest; reading: ReadingMockTest }
export interface MockTestSelection { id: string; label: string; listening?: ListeningMockTest; reading?: ReadingMockTest }

const readingLoaders: Record<string, () => Promise<ReadingMockTest>> = {
  'cam21-test1': async () => (await import('./cam21-test1-reading')).cam21Test1Reading,
  'cam21-test2': async () => (await import('./cam21-test2-reading')).cam21Test2Reading,
  'cam21-test3': async () => (await import('./cam21-test3-reading')).cam21Test3Reading,
  'cam21-test4': async () => (await import('./cam21-test4-reading')).cam21Test4Reading,
  'cam20-test1': async () => (await import('./cam20-test1-reading')).cam20Test1Reading,
  'cam20-test2': async () => (await import('./cam20-test2-reading')).cam20Test2Reading,
  'cam20-test3': async () => (await import('./cam20-test3-reading')).cam20Test3Reading,
  'cam20-test4': async () => (await import('./cam20-test4-reading')).cam20Test4Reading,
  'cam19-test1': async () => (await import('./cam19-test1-reading')).cam19Test1Reading,
  'cam19-test2': async () => (await import('./cam19-test2-reading')).cam19Test2Reading,
  'cam19-test3': async () => (await import('./cam19-test3-reading')).cam19Test3Reading,
  'cam19-test4': async () => (await import('./cam19-test4-reading')).cam19Test4Reading,
  'cam18-test1': async () => (await import('./cam18-test1-reading')).cam18Test1Reading,
  'cam18-test2': async () => (await import('./cam18-test2-reading')).cam18Test2Reading,
  'cam18-test3': async () => (await import('./cam18-test3-reading')).cam18Test3Reading,
  'cam18-test4': async () => (await import('./cam18-test4-reading')).cam18Test4Reading,
}

const listeningLoaders: Record<string, () => Promise<ListeningMockTest>> = {
  'cam21-test1': async () => (await import('./cam21-test1-listening')).cam21Test1Listening,
  'cam21-test2': async () => (await import('./cam21-test2-listening')).cam21Test2Listening,
  'cam21-test3': async () => (await import('./cam21-test3-listening')).cam21Test3Listening,
  'cam21-test4': async () => (await import('./cam21-test4-listening')).cam21Test4Listening,
  'cam20-test1': async () => (await import('./cam20-test1-listening')).cam20Test1Listening,
  'cam20-test2': async () => (await import('./cam20-test2-listening')).cam20Test2Listening,
  'cam20-test3': async () => (await import('./cam20-test3-listening')).cam20Test3Listening,
  'cam20-test4': async () => (await import('./cam20-test4-listening')).cam20Test4Listening,
  'cam19-test1': async () => (await import('./cam19-test1-listening')).cam19Test1Listening,
  'cam19-test2': async () => (await import('./cam19-test2-listening')).cam19Test2Listening,
  'cam19-test3': async () => (await import('./cam19-test3-listening')).cam19Test3Listening,
  'cam19-test4': async () => (await import('./cam19-test4-listening')).cam19Test4Listening,
  'cam18-test1': async () => (await import('./cam18-test1-listening')).cam18Test1Listening,
  'cam18-test2': async () => (await import('./cam18-test2-listening')).cam18Test2Listening,
  'cam18-test3': async () => (await import('./cam18-test3-listening')).cam18Test3Listening,
  'cam18-test4': async () => (await import('./cam18-test4-listening')).cam18Test4Listening,
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

function selected(id: string) { return mockTestList.find(test => test.id === id) ?? mockTestList[0] }

export async function loadMockTestPart(id: string, kind: 'reading' | 'listening'): Promise<MockTestSelection> {
  const test = selected(id)
  return kind === 'reading' ? { ...test, reading: await readingLoaders[test.id]() } : { ...test, listening: await listeningLoaders[test.id]() }
}

// Full-pair loading is retained for dataset validation, not used by practice pages.
export async function loadMockTest(id: string): Promise<MockTestPair> {
  const test = selected(id)
  const [reading, listening] = await Promise.all([readingLoaders[test.id](), listeningLoaders[test.id]()])
  return { ...test, reading, listening }
}

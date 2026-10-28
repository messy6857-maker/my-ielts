import { expect, it } from 'vitest'
import { loadMockTest, loadMockTranscript } from '../src/pages/mock/registry'

it('selection load no longer pulls transcripts in', async () => {
  const pair = await loadMockTest('cam20-test3')
  expect(pair.listening.parts).toHaveLength(4)
  for (const part of pair.listening.parts)
    expect(part.transcript).toBeUndefined()
})

it('transcripts load on demand at submit time', async () => {
  const transcript = await loadMockTranscript('cam20-test3')
  expect(transcript).not.toBeNull()
  expect(Object.keys(transcript!)).toEqual(['part1', 'part2', 'part3', 'part4'])
  for (const text of Object.values(transcript!))
    expect(text.length).toBeGreaterThan(0)
})

it('unknown test ids resolve to no transcript instead of throwing', async () => {
  await expect(loadMockTranscript('no-such-test')).resolves.toBeNull()
})

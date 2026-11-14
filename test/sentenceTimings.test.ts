import { describe, expect, it } from 'vitest'
import { cam18Test1ListeningTranscript } from '../src/pages/mock/cam18-test1-listening-transcript'
import { cam18Test2ListeningTranscript } from '../src/pages/mock/cam18-test2-listening-transcript'
import { cam18Test3ListeningTranscript } from '../src/pages/mock/cam18-test3-listening-transcript'
import { cam18Test4ListeningTranscript } from '../src/pages/mock/cam18-test4-listening-transcript'
import { cam19Test1ListeningTranscript } from '../src/pages/mock/cam19-test1-listening-transcript'
import { cam19Test2ListeningTranscript } from '../src/pages/mock/cam19-test2-listening-transcript'
import { cam19Test3ListeningTranscript } from '../src/pages/mock/cam19-test3-listening-transcript'
import { cam19Test4ListeningTranscript } from '../src/pages/mock/cam19-test4-listening-transcript'
import { cam20Test1ListeningTranscript } from '../src/pages/mock/cam20-test1-listening-transcript'
import { cam20Test2ListeningTranscript } from '../src/pages/mock/cam20-test2-listening-transcript'
import { cam20Test3ListeningTranscript } from '../src/pages/mock/cam20-test3-listening-transcript'
import { cam20Test4ListeningTranscript } from '../src/pages/mock/cam20-test4-listening-transcript'
import { cam21Test1ListeningTranscript } from '../src/pages/mock/cam21-test1-listening-transcript'
import { cam21Test2ListeningTranscript } from '../src/pages/mock/cam21-test2-listening-transcript'
import { cam21Test3ListeningTranscript } from '../src/pages/mock/cam21-test3-listening-transcript'
import { cam21Test4ListeningTranscript } from '../src/pages/mock/cam21-test4-listening-transcript'
import { transcriptSentenceEntries } from '../src/utils/text'

const modules: Record<string, Record<string, string>> = {
  'cam18-test1': cam18Test1ListeningTranscript,
  'cam18-test2': cam18Test2ListeningTranscript,
  'cam18-test3': cam18Test3ListeningTranscript,
  'cam18-test4': cam18Test4ListeningTranscript,
  'cam19-test1': cam19Test1ListeningTranscript,
  'cam19-test2': cam19Test2ListeningTranscript,
  'cam19-test3': cam19Test3ListeningTranscript,
  'cam19-test4': cam19Test4ListeningTranscript,
  'cam20-test1': cam20Test1ListeningTranscript,
  'cam20-test2': cam20Test2ListeningTranscript,
  'cam20-test3': cam20Test3ListeningTranscript,
  'cam20-test4': cam20Test4ListeningTranscript,
  'cam21-test1': cam21Test1ListeningTranscript,
  'cam21-test2': cam21Test2ListeningTranscript,
  'cam21-test3': cam21Test3ListeningTranscript,
  'cam21-test4': cam21Test4ListeningTranscript,
}

const META_TEXT = 'Here is the transcript of the conversation between two education students, presented in a conversation format, based on the provided sources:'

type Timing = [number | null, number | null, string]

const timingFiles = import.meta.glob('../src/pages/listening/timings/cam*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, Timing[]>>

function buildTimingMap(): Record<string, Timing[]> {
  const map: Record<string, Timing[]> = {}
  for (const [path, parts] of Object.entries(timingFiles)) {
    const testId = path.split('/').pop()!.replace(/\.json$/, '')
    for (const [part, arr] of Object.entries(parts))
      map[`${testId}-${part}`] = arr
  }
  return map
}

const timingMap = buildTimingMap()

describe('sentence-timings', () => {
  it('covers all 64 parts with one timing per sentence entry', () => {
    expect(Object.keys(timingMap).sort()).toEqual(
      Object.keys(modules).flatMap(test =>
        ['part1', 'part2', 'part3', 'part4'].map(part => `${test}-${part}`),
      ).sort(),
    )
    let total = 0
    const counts: Record<string, number> = {}
    for (const [test, mod] of Object.entries(modules)) {
      for (const part of ['part1', 'part2', 'part3', 'part4']) {
        const entries = transcriptSentenceEntries(mod[part])
        const arr = timingMap[`${test}-${part}`]
        expect(arr).toBeDefined()
        expect(arr.length).toBe(entries.length)
        let prevEnd = 0
        entries.forEach((entry, i) => {
          const [start, end, status] = arr[i]
          counts[status] = (counts[status] ?? 0) + 1
          if (status === 'ok' || status === 'weak') {
            expect(typeof start).toBe('number')
            expect(typeof end).toBe('number')
            expect(start).toBeGreaterThanOrEqual(0)
            expect(end).toBeGreaterThan(start!)
            expect(start).toBeGreaterThanOrEqual(prevEnd)
            prevEnd = end!
          }
          else {
            expect(start).toBeNull()
            expect(end).toBeNull()
            if (status === 'skip') {
              expect(
                /^[.…]+$/.test(entry.text.trim()) || entry.text === META_TEXT,
              ).toBe(true)
            }
          }
          total++
        })
      }
    }
    expect(total).toBe(3622)
    expect(counts).toEqual({
      ok: 3473,
      weak: 44,
      tts: 40,
      skip: 65,
    })
  })

  it('marks the cam20-test4-part3 meta sentence as skip, not audio', () => {
    const entries = transcriptSentenceEntries(modules['cam20-test4'].part3)
    const idx = entries.findIndex(e => e.text === META_TEXT)
    expect(idx).toBeGreaterThan(-1)
    expect(timingMap['cam20-test4-part3'][idx][2]).toBe('skip')
  })

  it('ships one JSON file per test suite under timings/', () => {
    expect(Object.keys(timingFiles).length).toBe(16)
  })
})

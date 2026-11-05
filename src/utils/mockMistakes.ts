import type { MistakeModule } from '../composables/useStudyData'
import type { MockQuestion } from '../pages/mock/types'
import { mockQuestionStatus } from '../pages/mock/types'

/** Machine-readable hint for mock mistakes (synced as plain string). */
export interface MockMistakeMeta {
  kind: 'listening' | 'reading'
  testId: string
  label: string
  part: string
  questionId: string
  /** Listening media relative path when available */
  audio?: string
}

const META_PREFIX = 'mockmeta:'

export function encodeMockMistakeMeta(meta: MockMistakeMeta): string {
  return META_PREFIX + JSON.stringify(meta)
}

export function decodeMockMistakeMeta(hint?: string): MockMistakeMeta | null {
  if (!hint || !hint.startsWith(META_PREFIX))
    return null
  try {
    return JSON.parse(hint.slice(META_PREFIX.length)) as MockMistakeMeta
  }
  catch {
    return null
  }
}

export function formatMockCorrectAnswer(q: MockQuestion): string {
  // A-2: tfng must NOT be stringified as a number index; it falls through to
  // the number+options branch below so it renders "A. True" like the mock
  // result screen does.
  if (q.type === 'fill-blank' || q.type === 'map-label') {
    const answers = Array.isArray(q.answer) ? q.answer : [q.answer]
    return answers.map(a => String(a)).join(' / ')
  }
  if (typeof q.answer === 'number' && q.options?.[q.answer] != null)
    return `${optionLetter(q.answer)}. ${q.options[q.answer]}`
  if (Array.isArray(q.answer) && q.options) {
    return q.answer
      .map((idx) => {
        const i = Number(idx)
        return q.options?.[i] != null
          ? `${optionLetter(i)}. ${q.options[i]}`
          : String(idx)
      })
      .join('；')
  }
  return String(q.answer)
}

export function formatMockUserAnswer(q: MockQuestion, userAnswer: string): string {
  const raw = userAnswer.trim()
  if (!raw)
    return '（未作答）'
  if (q.type === 'multi-select' && q.options) {
    return raw
      .split(',')
      .filter(Boolean)
      .map((s) => {
        const i = Number(s)
        return q.options?.[i] != null
          ? `${optionLetter(i)}. ${q.options[i]}`
          : s
      })
      .join('；')
  }
  if (
    (q.type === 'multiple-choice' || q.type === 'tfng')
    && q.options
    && /^\d+$/.test(raw)
  ) {
    const i = Number(raw)
    if (q.options[i] != null)
      return `${optionLetter(i)}. ${q.options[i]}`
  }
  return raw
}

function optionLetter(i: number): string {
  return String.fromCharCode(65 + i)
}

export function mockMistakeKey(
  kind: 'listening' | 'reading',
  testId: string,
  part: string,
  questionId: string,
): string {
  return `mock:${kind}:${testId}:${part}:${questionId}`
}

export function buildMockMistakeEntry(input: {
  kind: 'listening' | 'reading'
  testId: string
  label: string
  part: string
  question: MockQuestion
  userAnswer: string
  audio?: string
}): {
    module: MistakeModule
    key: string
    title: string
    detail: string
    hint: string
  } {
  const q = input.question
  const correct = formatMockCorrectAnswer(q)
  const yours = formatMockUserAnswer(q, input.userAnswer)
  const module: MistakeModule
    = input.kind === 'listening' ? 'mock_listening' : 'mock_reading'
  return {
    module,
    key: mockMistakeKey(input.kind, input.testId, input.part, q.id),
    title: correct,
    detail: [
      `${input.label} · ${input.part} · ${q.id}`,
      q.question.replace(/\s+/g, ' ').trim(),
      `你的答案：${yours}`,
      `正确答案：${correct}`,
    ].join('\n'),
    hint: encodeMockMistakeMeta({
      kind: input.kind,
      testId: input.testId,
      label: input.label,
      part: input.part,
      questionId: q.id,
      audio: input.audio,
    }),
  }
}

/** Collect wrong/partial/unanswered scored questions after submit. */
export function collectMockMistakeEntries(input: {
  kind: 'listening' | 'reading'
  testId: string
  label: string
  /** part key + questions + optional audio */
  parts: Array<{ part: string; questions: MockQuestion[]; audio?: string }>
  answers: Record<string, string>
}): ReturnType<typeof buildMockMistakeEntry>[] {
  const out: ReturnType<typeof buildMockMistakeEntry>[] = []
  for (const part of input.parts) {
    for (const q of part.questions) {
      const user = input.answers[q.id] ?? ''
      const status = mockQuestionStatus(q, user, true)
      if (status === 'correct')
        continue
      out.push(
        buildMockMistakeEntry({
          kind: input.kind,
          testId: input.testId,
          label: input.label,
          part: part.part,
          question: q,
          userAnswer: user,
          audio: part.audio,
        }),
      )
    }
  }
  return out
}

/** Review compare: ignore case/punct; accept any slash-separated correct variant. */
export function mockReviewMatches(expectedTitle: string, userInput: string, allowOptions = true): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  const input = norm(userInput)
  if (!input)
    return false
  const optionPrefix = /^[a-z]\.\s+/i
  function variants(title: string) {
    const raw = title.trim()
    const letter = allowOptions && optionPrefix.test(raw) ? raw[0].toLowerCase() : ''
    const body = letter ? raw.replace(optionPrefix, '') : raw
    return [
      ...(letter ? [letter, norm(raw)] : []),
      ...body.split(/\s*\/\s*/).map(norm),
    ].filter(Boolean)
  }
  const groups = expectedTitle.split(/\s*[；;]\s*/)
  if (!allowOptions || groups.length < 2 || !groups.every(g => optionPrefix.test(g.trim())))
    return groups.some(group => variants(group).includes(input))

  // Consume exactly one answer from every group, in any order. Checking a
  // set of words alone accepts extra options and fragments of option text.
  const options = groups.map(variants)
  function matches(remaining: string, unused: number[]): boolean {
    if (!unused.length)
      return remaining === ''
    return unused.some(i => options[i].some((option) => {
      if (remaining !== option && !remaining.startsWith(`${option} `))
        return false
      return matches(remaining.slice(option.length).trimStart(), unused.filter(j => j !== i))
    }))
  }
  return matches(input, options.map((_, i) => i))
}

/**
 * Idempotency for mock-mistake recording (A-1): one attempt records its
 * mistakes once, even if the record save fails and the user retries.
 * Single bounded local key; defensive so a storage failure never breaks submit.
 * Note: the marker is local-only, so a same-attempt retry restored on another
 * device could still double-count; that path needs cross-device draft restore
 * and is out of scope for the retry-button bug.
 */
const MISTAKES_WRITTEN_KEY = 'mock_mistakes_written_v1'
const MISTAKES_WRITTEN_CAP = 50
function readWrittenMistakeAttempts(): string[] {
  try {
    const raw = localStorage.getItem(MISTAKES_WRITTEN_KEY)
    if (!raw)
      return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  }
  catch {
    return []
  }
}
export function hasWrittenMockMistakes(attemptId: string): boolean {
  return !!attemptId && readWrittenMistakeAttempts().includes(attemptId)
}
export function markMockMistakesWritten(attemptId: string): void {
  if (!attemptId)
    return
  try {
    const list = readWrittenMistakeAttempts()
    if (!list.includes(attemptId)) {
      list.push(attemptId)
      while (list.length > MISTAKES_WRITTEN_CAP)
        list.shift()
      localStorage.setItem(MISTAKES_WRITTEN_KEY, JSON.stringify(list))
    }
  }
  catch {
    /* best effort; worst case a retry may double-count, never crash submit */
  }
}

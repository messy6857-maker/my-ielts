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
export function mockReviewMatches(expectedTitle: string, userInput: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const user = norm(userInput)
  if (!user)
    return false
  const userTokens = new Set(user.split(' ').filter(Boolean))
  // A-3: '；' joins REQUIRED options (multi-select, e.g. "A. xxx；C. yyy"):
  // every group must be covered, not just one. Only apply when every group
  // looks like an option ("A. ..."); otherwise fall back to the legacy
  // any-variant rule so ordinary titles containing '；' are unaffected.
  const required = expectedTitle.split(/\s*；\s*/)
  if (required.length > 1 && required.every(g => /^[A-Za-z]\.\s/.test(g)))
    return required.every(group => groupCovered(group))
  return matchVariant(expectedTitle)

  function matchVariant(title: string): boolean {
    return title.split(/\s*\/\s*|\s*；\s*|\s*;\s*/).some((v) => {
      const n = norm(v)
      if (!n)
        return false
      // Allow matching "A. foo" by typing "foo" or "a". NOTE: n is already
      // normalized, so the dot is gone and the letter is followed by a space
      // (the old /^[a-z]\.\s*/ pattern could never fire here).
      const letter = n.match(/^([a-z])\s+/)
      const withoutLetter = n.replace(/^[a-z]\s+/, '').trim()
      return user === n || user === withoutLetter || (!!letter && user === letter[1])
    })
  }
  function groupCovered(group: string): boolean {
    // A group may itself contain '/' variants; any covering variant suffices.
    return group.split(/\s*\/\s*/).some((variant) => {
      const n = norm(variant)
      if (!n)
        return false
      if (user === n)
        return true
      const letter = n.match(/^([a-z])\s+/)
      const withoutLetter = n.replace(/^[a-z]\s+/, '').trim()
      if (letter && userTokens.has(letter[1]))
        return true
      return !!withoutLetter
        && withoutLetter.split(' ').every(w => userTokens.has(w))
    })
  }
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

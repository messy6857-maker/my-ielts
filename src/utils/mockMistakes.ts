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
  if (q.type === 'fill-blank' || q.type === 'tfng' || q.type === 'map-label') {
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
  parts: Array<{ part: string, questions: MockQuestion[], audio?: string }>
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
  const variants = expectedTitle.split(/\s*\/\s*|\s*；\s*|\s*;\s*/)
  return variants.some((v) => {
    const n = norm(v)
    if (!n)
      return false
    // Allow matching "A. foo" by typing "foo" or "a"
    const letter = n.match(/^([a-z])\s+/)
    const withoutLetter = n.replace(/^[a-z]\.\s*/, '').trim()
    return user === n || user === withoutLetter || (!!letter && user === letter[1])
  })
}

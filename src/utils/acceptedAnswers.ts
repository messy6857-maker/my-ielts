import { normalizeAnswer } from './normalizeAnswer'

export function acceptsAnswer(input: string, answers: readonly string[]) {
  const value = normalizeAnswer(input)
  return !!value && answers.some(answer => normalizeAnswer(answer) === value)
}

export function acceptsAnswer(input: string, answers: readonly string[]) {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
  const value = normalize(input)
  return !!value && answers.some(answer => normalize(answer) === value)
}

export type SentenceTiming = [number | null, number | null, string]

const loaders = import.meta.glob('./*.json')

export async function loadTestTimings(
  testId: string,
): Promise<Record<string, SentenceTiming[]> | null> {
  const key = `./${testId}.json`
  const loader = loaders[key]
  if (!loader)
    return null
  const mod = (await loader()) as { default: Record<string, SentenceTiming[]> }
  return mod.default
}

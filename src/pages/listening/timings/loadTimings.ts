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

/** ok/weak with numeric range → original audio only (never TTS fallback). */
export function prefersOriginalAudio(
  timing: SentenceTiming | undefined | null,
): boolean {
  return !!(
    timing
    && (timing[2] === 'ok' || timing[2] === 'weak')
    && timing[0] != null
    && timing[1] != null
  )
}

export function shouldUseTtsFallback(
  timing: SentenceTiming | undefined | null,
): boolean {
  if (!timing)
    return true
  if (timing[2] === 'skip')
    return false
  if (prefersOriginalAudio(timing))
    return false
  return timing[2] === 'tts' || timing[0] == null || timing[1] == null
}

export interface VocabularyDetail {
  example: string
  extra: string
}
const modules = import.meta.glob(
  '../pages/vocabulary/chapter-details/*.json',
) as Record<
  string,
  () => Promise<{ default: Record<string, VocabularyDetail> }>
>
const cache = new Map<string, Record<string, VocabularyDetail>>()
export async function loadVocabularyDetails(chapter: string) {
  if (cache.has(chapter))
    return cache.get(chapter)!
  const loader = modules[`../pages/vocabulary/chapter-details/${chapter}.json`]
  if (!loader)
    throw new Error('章节详情不存在')
  const data = (await loader()).default
  cache.set(chapter, data)
  return data
}

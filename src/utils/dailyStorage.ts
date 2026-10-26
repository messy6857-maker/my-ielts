import { readJson } from '../composables/useAuth'

export interface DailyPart { date: string; seed: number; count: number; words: string[]; createdAt: number }

export function dailyTotal(parts: DailyPart[], fallback: number) {
  if (!parts.length) return fallback
  const first = parts.reduce((a, b) => a.createdAt <= b.createdAt ? a : b)
  return first.seed + parts.reduce((sum, part) => sum + part.count, 0) + new Set(parts.flatMap(part => part.words)).size
}

export function readDailyParts(key: string, base: string, date: string) {
  const legacy = readJson<{ date: string; count: number }>(key, { date: '', count: 0 }, base)
  const parts = new Map<string, DailyPart>()
  for (const k of Object.keys(localStorage).filter(k => k.startsWith(`${key}__part_`) && !k.endsWith('__recovery'))) {
    const value = readJson<DailyPart | null>(k, null, `${base}${k.slice(key.length)}`)
    if (value?.date === date) parts.set(k, value)
  }
  return { parts, fallback: legacy.date === date ? legacy.count : 0 }
}

import { dateTime, mergeLegacy } from './legacyMerge'
import {
  accountKey,
  batchStorage,
  entryKey,
  readRecords,
  readValue,
  saveEnvelope,
  studyBaseOf,
} from './storage'

function seed(base: string, id: string, value: unknown, owner: string | null) {
  const key = entryKey(base, id, owner)
  const raw = localStorage.getItem(key)
  let old: any = null
  try {
    old = raw ? JSON.parse(raw) : null
  }
  catch {
    return
  }
  if (old && (old.deleted || old.stamp?.[0] > 0))
    return
  const merged = old
    ? base === 'stats_parts_v2'
      ? {
          totals: mergeLegacy(
            'stats_attempts_v1',
            { all: old.value.totals },
            { all: (value as any).totals },
          ).all,
          days: mergeLegacy(
            'stats_attempts_v1',
            old.value.days,
            (value as any).days,
          ),
        }
      : mergeLegacy(
        base === 'mistake_parts_v2' ? 'migration-mistake' : base,
        old.value,
        value,
      )
    : value
  if (!old || JSON.stringify(old.value) !== JSON.stringify(merged)) {
    saveEnvelope(
      key,
      { __ielts: 2, stamp: [0, 'legacy'], value: merged },
      'remote',
    )
  }
}
export function migrateStudy(owner: string | null) {
  batchStorage(() => {
    const mistakes = readValue<any[]>(accountKey('mistakes_v1', owner), [])
    if (Array.isArray(mistakes)) {
      for (const item of mistakes) {
        if (
          item
          && typeof item.key === 'string'
          && Number.isFinite(item.count)
        ) {
          seed(
            'mistake_parts_v2',
            `${item.key}|legacy`,
            {
              ...item,
              module: item.key.startsWith('corpus:') ? 'corpus' : item.module,
              epoch: '',
              days: {},
            },
            owner,
          )
        }
      }
    }
    for (const ns of ['vocabulary', 'listening179', 'reading538', 'corpus']) {
      const old = readValue<any>(
        accountKey(
          ns === 'vocabulary' ? 'flashcard_daily_new_v1' : `${ns}_daily_new_v1`,
          owner,
        ),
        null,
      )
      if (old?.date && Number.isFinite(old.count) && old.count > 0) {
        seed(
          'daily_parts_v2',
          `${ns}|${old.date}|legacy`,
          {
            ns,
            date: old.date,
            word: null,
            count: old.count,
            actor: 'legacy',
            epoch: '',
          },
          owner,
        )
      }
    }
    const legacy = readValue<
      Record<
        string,
        Record<
          string,
          {
            known: number
            vague: number
            unknown: number
          }
        >
      >
    >(accountKey('stats_attempts_v1', owner), {})
    const totals: Record<
      string,
      {
        known: number
        vague: number
        unknown: number
      }
    > = {}
    const days: typeof legacy = {}
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 13)
    for (const [date, modules] of Object.entries(legacy)) {
      if (!modules || typeof modules !== 'object')
        continue
      for (const [ns, count] of Object.entries(modules)) {
        const total = (totals[ns] ??= { known: 0, vague: 0, unknown: 0 })
        for (const field of ['known', 'vague', 'unknown'] as const)
          total[field] += Math.max(0, Number(count?.[field]) || 0)
      }
      if (dateTime(date) >= cutoff.getTime())
        days[date] = modules
    }
    if (Object.keys(totals).length)
      seed('stats_parts_v2', 'legacy', { totals, days }, owner)
    const base = accountKey('study_time_v1', owner)
    for (const key of Object.keys(localStorage)) {
      if (key !== base && !key.startsWith(`${base}_`))
        continue
      const old = readValue<any>(key, null)
      if (old?.date && Number.isFinite(old.seconds)) {
        seed(
          'timer_sessions_v2',
          `legacy:${key}:${old.date}`,
          { date: old.date, device: key, legacySeconds: old.seconds },
          owner,
        )
      }
    }
    migrateCheckins(owner)
    const oldCutoff = Date.now() - 14 * 86400000
    for (const key of Object.keys(localStorage)) {
      const base = studyBaseOf(key, owner)
      if (!base || !/^(?:daily_parts_v2|timer_sessions_v2)__entry_/.test(base))
        continue
      const value = readValue<any>(key, null)
      if (value?.date && dateTime(value.date) < oldCutoff)
        localStorage.removeItem(key)
    }
  })
}
function yearDay(date: string) {
  const d = new Date(dateTime(date))
  const year = d.getFullYear()
  return {
    year: String(year),
    day: Math.round(
      (Date.UTC(year, d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1))
        / 86400000,
    ),
  }
}
export function migrateCheckins(owner: string | null) {
  const records = readRecords<boolean>('flashcard_checkin_v1', owner)
  const years = readRecords<number[]>('checkin_years_v2', owner)
  const additions: Record<string, Set<number>> = {}
  for (const [date, checked] of Object.entries(records)) {
    if (!checked)
      continue
    const { year, day } = yearDay(date)
    if (Number.isFinite(day))
      (additions[year] ??= new Set(years[year] ?? [])).add(day)
  }
  for (const [year, values] of Object.entries(additions)) {
    const value = [...values].sort((a, b) => a - b)
    const key = entryKey('checkin_years_v2', year, owner)
    if (JSON.stringify(value) !== JSON.stringify(years[year]))
      saveEnvelope(key, { __ielts: 2, stamp: [0, 'legacy'], value }, 'remote')
  }
  // The yearly sets preserve lifetime totals and long streaks; only the 90-day date index is retained.
  const cutoff = Date.now() - 90 * 86400000
  for (const date of Object.keys(records)) {
    if (dateTime(date) < cutoff)
      localStorage.removeItem(entryKey('flashcard_checkin_v1', date, owner))
  }
}

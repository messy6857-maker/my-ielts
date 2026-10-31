import { dateTime, mergeLegacy } from './legacyMerge'
import {
  accountKey,
  batchStorage,
  deletionEnvelope,
  entryKey,
  envelope,
  readRecords,
  readValue,
  saveEnvelope,
  saveValue,
  studyBaseOf,
} from './storage'

function seed(base: string, id: string, value: unknown, owner: string | null) {
  const key = entryKey(base, id, owner)
  if (deletionEnvelope(key, owner))
    return
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
    const spelling = readValue<Record<string, Record<string, string>>>(
      accountKey('vocabulary_spell_v1', owner),
      {},
    )
    for (const [chapter, words] of Object.entries(spelling || {})) {
      for (const [id, value] of Object.entries(words || {})) {
        if (typeof value === 'string')
          seed('vocabulary_spell_v2', `${chapter}|${id}`, value, owner)
      }
    }
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
      const timerBase = studyBaseOf(key, owner)
      if (
        key !== base
        && !(timerBase && /^study_time_v1_[a-z\d-]+$/i.test(timerBase))
      )
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
    compactStatsParts(owner)
    migrateCheckins(owner)
    const oldCutoff = Date.now() - 14 * 86400000
    for (const key of Object.keys(localStorage)) {
      const base = studyBaseOf(key, owner)
      if (!base || !/^(?:daily_parts_v2|timer_sessions_v2)__entry_/.test(base))
        continue
      const value = readValue<any>(key, null)
      if (value?.date && dateTime(value.date) < oldCutoff)
        saveValue(key, undefined, true)
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
  let archived = true
  for (const [year, values] of Object.entries(additions)) {
    const value = [...values].sort((a, b) => a - b)
    const key = entryKey('checkin_years_v2', year, owner)
    if (JSON.stringify(value) !== JSON.stringify(years[year])) {
      archived
        = saveEnvelope(
          key,
          { __ielts: 2, stamp: [0, 'legacy'], value },
          'remote',
        ) && archived
    }
  }
  if (!archived)
    return
  // The yearly sets preserve lifetime totals and long streaks; only the 90-day date index is retained.
  const cutoff = Date.now() - 90 * 86400000
  for (const date of Object.keys(records)) {
    if (dateTime(date) < cutoff)
      saveValue(entryKey('flashcard_checkin_v1', date, owner), undefined, true)
  }
}

/** Trimming metadata never changes historical totals or their version. */
export function compactStatsParts(owner: string | null) {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 13)
  batchStorage(() => {
    for (const id of Object.keys(readRecords<any>('stats_parts_v2', owner))) {
      const key = entryKey('stats_parts_v2', id, owner)
      const raw = localStorage.getItem(key)
      if (!raw)
        continue
      const record = envelope(raw)
      const part = record.value as any
      if (!part?.days)
        continue
      let changed = false
      for (const date of Object.keys(part.days)) {
        if (dateTime(date) < cutoff.getTime()) {
          delete part.days[date]
          changed = true
        }
      }
      if (changed)
        saveEnvelope(key, { ...record, value: part }, 'remote')
    }
  })
}

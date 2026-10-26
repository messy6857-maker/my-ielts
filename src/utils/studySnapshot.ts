import { readMistakes } from './mistakeStorage'
import { isRecordCollection, readRecords } from './recordStorage'
import { parseStudyValue } from './studySchema'
import { studyBaseOf, studyPrefix } from './studyStorage'
import { flushStudyWrites } from './studyWriteQueue'

export interface StudySnapshot {
  data: Record<string, string>
  recovery: Record<string, string>
  invalidBases: string[]
}
export function collectStudySnapshot(username: string | null): StudySnapshot {
  flushStudyWrites()
  const invalidBases: string[] = []
  const data: Record<string, string> = {}
  const recovery: Record<string, string> = {}
  for (const key of Object.keys(localStorage)) {
    if (key.endsWith('__recovery')) {
      const recoveredBase = studyBaseOf(key.slice(0, -10), username)
      if (recoveredBase !== null)
        recovery[recoveredBase] = localStorage.getItem(key)!
      continue
    }
    const base = studyBaseOf(key, username)
    if (base === null)
      continue
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      parseStudyValue(base, raw)
      data[key] = raw
    }
    catch {
      recovery[base] = raw
      invalidBases.push(base)
    }
  }
  // Export materialized tables, not device/page journals. This also captures
  // durable entry writes whose optional compatibility-cache write failed.
  const prefix = studyPrefix(username)
  const bases = new Set(Object.keys(data).map(key => studyBaseOf(key, username)!.split('__')[0]))
  for (const base of bases) {
    if (base !== 'mistakes_v1' && !isRecordCollection(base)) continue
    if (invalidBases.some(invalid => invalid === base || invalid.startsWith(`${base}__`))) continue
    const key = prefix + base
    const value = base === 'mistakes_v1' ? readMistakes(key) : readRecords(key, base)
    for (const stored of Object.keys(data)) if (stored.startsWith(`${key}__`)) delete data[stored]
    data[key] = JSON.stringify(value)
  }
  return { data, recovery, invalidBases }
}

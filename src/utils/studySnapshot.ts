import { parseStudyValue } from './studySchema'
import { studyBaseOf } from './studyStorage'
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
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.endsWith('__recovery')) {
      const recoveredBase = studyBaseOf(key.slice(0, -10), username)
      if (recoveredBase !== null)
        recovery[recoveredBase] = localStorage.getItem(key)!
      continue
    }
    const base = studyBaseOf(key, username)
    if (base === null)
      continue
    const raw = localStorage.getItem(key)!
    try {
      parseStudyValue(base, raw)
      data[key] = raw
    }
    catch {
      recovery[base] = raw
      invalidBases.push(base)
    }
  }
  return { data, recovery, invalidBases }
}

// Keep legacy keys compatible with the sync server, but match the entire module
// suffix instead of a username prefix (alice and alice_bob are separate users).
const studyBases = new Set([
  'mistakes_v1', 'progress_v1', 'reading_mastered_v1', 'writing_mastered_v1',
  'mock_history_v1', 'task1_essays_v1', 'task2_essays_v1', 'sr_vocabulary_v1',
  'flashcard_daily_goal_v1', 'flashcard_daily_new_v1', 'flashcard_checkin_v1',
  'listening179_sr_v1', 'listening179_daily_goal_v1', 'listening179_daily_new_v1',
  'reading538_sr_v1', 'reading538_daily_goal_v1', 'reading538_daily_new_v1',
  'study_time_v1',
])

export function isStudyBase(base: string): boolean {
  return studyBases.has(base)
    || /^study_time_v1_[a-z\d-]+$/i.test(base)
    || /^aigrade_v1_-?[a-z\d]+$/i.test(base)
}

export function studyPrefix(username: string | null): string {
  return username ? `myielts_u_${username}_` : 'myielts_'
}

export function studyBaseOf(key: string, username: string | null): string | null {
  const prefix = studyPrefix(username)
  if (!key.startsWith(prefix))
    return null
  const base = key.slice(prefix.length)
  return isStudyBase(base) ? base : null
}

// Roll back the complete batch on quota/storage errors. Remove staged values
// first so restoring the previous snapshot has its original storage budget.
export function writeStudyBatch(entries: [string, string][], removals: string[] = []) {
  const keys = new Set([...entries.map(([key]) => key), ...removals])
  const previous = new Map([...keys].map(key => [key, localStorage.getItem(key)]))
  const changed = new Set<string>()
  try {
    for (const [key, value] of entries) {
      localStorage.setItem(key, value)
      changed.add(key)
    }
    for (const key of removals) {
      localStorage.removeItem(key)
      changed.add(key)
    }
  }
  catch (e) {
    // A failed first write must not remove untouched legacy records.
    for (const key of changed)
      localStorage.removeItem(key)
    for (const key of changed) {
      const value = previous.get(key)!
      if (value !== null)
        localStorage.setItem(key, value)
    }
    throw e
  }
}

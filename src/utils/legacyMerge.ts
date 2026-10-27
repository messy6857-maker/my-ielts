/** Merge only unversioned migration snapshots. Versioned deletions always win. */
export function mergeLegacy(base: string, a: any, b: any): any {
  if (a === undefined || a === null)
    return b
  if (b === undefined || b === null)
    return a
  if (base === 'migration-mistake') {
    return {
      ...a,
      ...b,
      count: Math.max(a.count || 0, b.count || 0),
      firstAt: Math.min(a.firstAt ?? Number.POSITIVE_INFINITY, b.firstAt ?? Number.POSITIVE_INFINITY),
      lastAt: Math.max(a.lastAt || 0, b.lastAt || 0),
    }
  }
  if (base === 'daily_parts_v2') {
    return dateTime(a.date) > dateTime(b.date)
      ? a
      : dateTime(a.date) < dateTime(b.date)
        ? b
        : a.count > b.count
          ? a
          : b
  }
  if (base === 'timer_sessions_v2')
    return a.legacySeconds > b.legacySeconds ? a : b
  if (base === 'flashcard_checkin_v1') {
    return [
      ...new Set([
        ...(Array.isArray(a) ? a : []),
        ...(Array.isArray(b) ? b : []),
      ]),
    ]
  }
  if (base === 'mistakes_v1') {
    const merged = new Map<string, any>()
    for (const item of [
      ...(Array.isArray(a) ? a : []),
      ...(Array.isArray(b) ? b : []),
    ]) {
      if (item?.key) {
        const old = merged.get(item.key)
        merged.set(item.key, !old || item.count > old.count ? item : old)
      }
    }
    return [...merged.values()]
  }
  if (base === 'stats_attempts_v1') {
    const result = structuredClone(a)
    for (const [date, modules] of Object.entries(b ?? {}) as Array<
      [string, any]
    >) {
      for (const [ns, count] of Object.entries(modules ?? {}) as Array<
        [string, any]
      >) {
        const old = ((result[date] ??= {})[ns] ??= {})
        for (const field of ['known', 'vague', 'unknown']) {
          old[field] = Math.max(
            Number(old[field]) || 0,
            Number(count?.[field]) || 0,
          )
        }
      }
    }
    return result
  }
  if (base.endsWith('_daily_new_v1') || base.startsWith('study_time_v1')) {
    const at = dateTime(a.date)
    const bt = dateTime(b.date)
    return at !== bt
      ? bt > at
        ? b
        : a
      : Number(b.count ?? b.seconds) > Number(a.count ?? a.seconds)
        ? b
        : a
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return [
      ...new Map([...a, ...b].map(x => [JSON.stringify(x), x])).values(),
    ]
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const as
      = a.updatedAt
      ?? a.createdAt
      ?? (a.dueAt !== undefined ? a.dueAt - a.interval * 86400000 : 0)
    const bs
      = b.updatedAt
      ?? b.createdAt
      ?? (b.dueAt !== undefined ? b.dueAt - b.interval * 86400000 : 0)
    if (as || bs)
      return bs > as ? b : a
    return { ...a, ...b }
  }
  return a
}
export function dateTime(value: string): number {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  return match
    ? new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ).getTime()
    : Number.NaN
}

function decodeId(encoded) {
  return /^(?:[a-f\d]{4})+$/i.test(encoded || '')
    ? encoded
      .match(/.{4}/g)
      .map(x => String.fromCharCode(Number.parseInt(x, 16)))
      .join('')
    : ''
}
function dayNumber(date) {
  const m = String(date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  return m
    ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000)
    : Number.NaN
}
function historyIdentity(id) {
  const iso = id.match(/\d{4}-\d{2}-\d{2}T[^:]+:\d{2}:\d{2}\.\d{3}Z/)
  const ms = iso
    ? Date.parse(iso[0])
    : /^\d{13}(?:-|$)/.test(id)
      ? Number(id.slice(0, 13))
      : Number.NaN
  return Number.isFinite(ms) ? `${String(ms).padStart(16, '0')}:${id}` : null
}
function pruneCollectionData(input, user, now = Date.now()) {
  const out = { ...input }
  const prefix = user ? `myielts_u_${user}_` : 'myielts_'
  const marker = `${prefix}collection_retention_v3`
  const parse = (raw) => {
    try {
      const v = JSON.parse(raw)
      return v?.__ielts === 2
        ? v
        : { __ielts: 2, stamp: [0, 'legacy'], value: v }
    }
    catch {
      return null
    }
  }
  const cuts = { ...(parse(out[marker])?.value || {}) }
  const today = Math.floor((now + 8 * 3600000) / 86400000)
  const histories = {
    mock_history_v1: 100,
    task1_essays_v1: 50,
    task2_essays_v1: 50,
  }
  for (const [base, limit] of Object.entries(histories)) {
    const entries = Object.keys(out)
      .filter(k => k.startsWith(`${prefix}${base}__entry_`))
      .map(key => ({
        key,
        id: historyIdentity(decodeId(key.split('__entry_')[1])),
        e: parse(out[key]),
      }))
      .filter(x => x.id && x.e)
      .sort((a, b) => b.id.localeCompare(a.id))

    // Tombstone GC may only retire an identity range containing no protected live record.
    if (entries.length > limit * 2) {
      const candidate = entries[limit * 2].id
      const oldestLive = entries.filter(x => !x.e.deleted && (!cuts[base] || x.id > cuts[base])).at(-1)?.id
      const safe = !oldestLive || candidate < oldestLive ? candidate : entries.find(x => x.id < oldestLive)?.id
      if (safe)
        cuts[base] = [cuts[base] || '', safe].sort().at(-1)
    }
    const live = entries.filter(
      x => !x.e.deleted && (!cuts[base] || x.id > cuts[base]),
    )
    if (live.length > limit)
      cuts[base] = [cuts[base] || '', live[limit].id].sort().at(-1)
    for (const x of entries) {
      if (cuts[base] && x.id <= cuts[base])
        delete out[x.key]
    }
  }
  for (const key of Object.keys(out)) {
    if (!key.startsWith(prefix))
      continue
    const [base, encoded] = key.slice(prefix.length).split('__entry_')
    const e = parse(out[key])
    if (!e || !encoded)
      continue
    const id = decodeId(encoded)
    const keep = [
      'daily_parts_v2',
      'daily_resets_v2',
      'timer_sessions_v2',
    ].includes(base)
      ? 14
      : base === 'flashcard_checkin_v1'
        ? 90
        : 0
    if (keep) {
      const date
        = id.match(/(?:^|[|:])(\d{4}-\d{1,2}-\d{1,2})(?:$|[|:])/)?.[1]
        || e.value?.date
      if (dayNumber(date) < today - (keep - 1)) {
        delete out[key]
        continue
      }
    }
    if (base === 'stats_parts_v2' && e.value?.days) {
      const days = Object.fromEntries(
        Object.entries(e.value.days).filter(
          ([date]) => !(dayNumber(date) < today - 13),
        ),
      )
      out[key] = JSON.stringify({ ...e, value: { ...e.value, days } })
    }
  }
  const old = parse(out[marker])
  if (JSON.stringify(old?.value || {}) !== JSON.stringify(cuts)) {
    out[marker] = JSON.stringify({
      __ielts: 2,
      stamp: [
        Math.max(now, (old?.stamp?.[0] || 0) + 1),
        'collection-retention',
      ],
      value: cuts,
    })
  }

  return out
}

export { pruneCollectionData }

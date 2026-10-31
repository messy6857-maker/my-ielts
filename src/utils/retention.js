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
        id:
          historyIdentity(decodeId(key.split('__entry_')[1]))
          || `${String(parse(out[key])?.stamp?.[0] || 0).padStart(16, '0')}:${decodeId(key.split('__entry_')[1])}`,
        e: parse(out[key]),
      }))
      .filter(x => x.id && x.e)
      .sort((a, b) => b.id.localeCompare(a.id))

    // Tombstone GC may only retire an identity range containing no protected live record.
    if (entries.length > limit * 2) {
      const candidate = entries[limit * 2].id
      const oldestLive = entries
        .filter(x => !x.e.deleted && (!cuts[base] || x.id > cuts[base]))
        .at(-1)?.id
      const safe
        = !oldestLive || candidate < oldestLive
          ? candidate
          : entries.find(x => x.id < oldestLive)?.id
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

function encodeDeletedId(id) {
  let out = ''
  for (let i = 0; i < id.length; i++)
    out += id.charCodeAt(i).toString(16).padStart(4, '0')
  return out
}
function deletedTarget(key, user) {
  const prefix = user ? `myielts_u_${user}_` : 'myielts_'
  if (!key.startsWith(prefix))
    return null
  const [base, encoded] = key.slice(prefix.length).split('__entry_')
  if (!encoded || base === 'deletion_archive_v3')
    return null
  const id = decodeId(encoded)
  if (!id)
    return null
  const target = `${base}|${id}`
  let hash = 2166136261
  for (let i = 0; i < target.length; i++)
    hash = Math.imul(hash ^ target.charCodeAt(i), 16777619)
  return {
    target,
    key: `${prefix}deletion_archive_v3__entry_${encodeDeletedId((hash >>> 24).toString(16).padStart(2, '0'))}`,
  }
}
function mergeDeletionEntries(a = {}, b = {}) {
  const out = Object.create(null)
  for (const source of [a, b]) {
    for (const [target, stamp] of Object.entries(source || {})) {
      if (
        !target.includes('|')
        || !Array.isArray(stamp)
        || !Number.isSafeInteger(stamp[0])
        || stamp[0] < 0
        || typeof stamp[1] !== 'string'
      )
        continue
      const old = out[target]
      if (
        !old
        || stamp[0] > old[0]
        || (stamp[0] === old[0] && stamp[1] > old[1])
      )
        out[target] = stamp
    }
  }
  return out
}
function expiredDeletionTarget(target, cuts, now) {
  const split = target.indexOf('|')
  const base = target.slice(0, split)
  const id = target.slice(split + 1)
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
    const date = id.match(/(?:^|[|:])(\d{4}-\d{1,2}-\d{1,2})(?:$|[|:])/)?.[1]
    if (
      dayNumber(date)
      < Math.floor((now + 8 * 3600000) / 86400000) - (keep - 1)
    )
      return true
  }
  const identity = historyIdentity(id)
  return !!identity && typeof cuts[base] === 'string' && identity <= cuts[base]
}
function compactDeletionData(input, user, fold = true, now = Date.now()) {
  const out = { ...input }
  const buckets = new Map()
  const prefix = user ? `myielts_u_${user}_` : 'myielts_'
  let cuts = {}
  try {
    cuts
      = JSON.parse(out[`${prefix}collection_retention_v3`] || 'null')?.value
      || {}
  }
  catch {}
  for (const [key, raw] of Object.entries(out)) {
    if (key.startsWith(`${prefix}deletion_archive_v3__entry_`)) {
      try {
        const e = JSON.parse(raw)
        if (!e.deleted) {
          buckets.set(key, {
            e,
            entries: Object.fromEntries(
              Object.entries(mergeDeletionEntries({}, e.value?.entries)).filter(
                ([target]) => !expiredDeletionTarget(target, cuts, now),
              ),
            ),
          })
        }
      }
      catch {}
    }
  }
  for (const [key, raw] of Object.entries(out)) {
    const target = deletedTarget(key, user)
    if (!target)
      continue
    if (expiredDeletionTarget(target.target, cuts, now)) {
      delete out[key]
      continue
    }
    try {
      const e = JSON.parse(raw)
      if (e?.__ielts !== 2)
        continue
      let bucket = buckets.get(target.key)
      const stamp = bucket?.entries[target.target]
      if (
        stamp
        && (stamp[0] > e.stamp[0]
          || (stamp[0] === e.stamp[0] && stamp[1] >= e.stamp[1]))
      ) {
        delete out[key]
        continue
      }
      if (!fold || !e.deleted)
        continue
      bucket ||= {
        e: { __ielts: 2, stamp: [0, 'deletion-archive'] },
        entries: Object.create(null),
      }
      bucket.entries = mergeDeletionEntries(bucket.entries, {
        [target.target]: e.stamp,
      })
      if (
        e.stamp[0] > bucket.e.stamp[0]
        || (e.stamp[0] === bucket.e.stamp[0] && e.stamp[1] > bucket.e.stamp[1])
      )
        bucket.e = { ...bucket.e, stamp: e.stamp }
      buckets.set(target.key, bucket)
      delete out[key]
    }
    catch {}
  }
  for (const [key, { e, entries }] of buckets) {
    if (Object.keys(entries).length)
      out[key] = JSON.stringify({ ...e, value: { entries } })
    else delete out[key]
  }
  return out
}
function expandDeletionData(input, user) {
  const out = { ...input }
  const prefix = user ? `myielts_u_${user}_` : 'myielts_'
  for (const [key, raw] of Object.entries(input)) {
    if (key.startsWith(`${prefix}deletion_archive_v3__entry_`)) {
      try {
        const e = JSON.parse(raw)
        for (const [target, stamp] of Object.entries(
          mergeDeletionEntries({}, e.value?.entries),
        )) {
          const split = target.indexOf('|')
          const base = target.slice(0, split)
          const id = target.slice(split + 1)
          const destination = `${prefix + base}__entry_${encodeDeletedId(id)}`
          const old = out[destination] && JSON.parse(out[destination])
          if (
            !old
            || stamp[0] > old.stamp[0]
            || (stamp[0] === old.stamp[0] && stamp[1] >= old.stamp[1])
          ) {
            out[destination] = JSON.stringify({
              __ielts: 2,
              stamp,
              deleted: true,
            })
          }
        }
        delete out[key]
      }
      catch {}
    }
  }
  return out
}

export {
  pruneCollectionData,
  deletedTarget,
  mergeDeletionEntries,
  compactDeletionData,
  expandDeletionData,
}

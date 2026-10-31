// Compact inactive writers without summing away their version/undo identity.
function encode(id) {
  return Array.from(id, c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
}
function decodeId(encoded) {
  return /^(?:[a-f\d]{4})+$/i.test(encoded || '')
    ? encoded
      .match(/.{4}/g)
      .map(x => String.fromCharCode(Number.parseInt(x, 16)))
      .join('')
    : ''
}
function cmp(a, b) {
  return a[0] - b[0] || String(a[1] || '').localeCompare(String(b[1] || ''))
}
function bucketOf(id) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return (hash >>> 24).toString(16).padStart(2, '0')
}
function tupleOf(e, id) {
  return [
    e.stamp[0],
    e.stamp[1] === id ? null : e.stamp[1],
    e.deleted
      ? null
      : Object.fromEntries(
        Object.entries(e.value?.totals || {}).map(([ns, c]) => [
          ns,
          [
            Number(c.known) || 0,
            Number(c.vague) || 0,
            Number(c.unknown) || 0,
          ],
        ]),
      ),
  ]
}
function partOf(tuple, id) {
  return {
    __ielts: 2,
    stamp: [tuple[0], tuple[1] === null ? id : tuple[1]],
    ...(tuple[2] === null
      ? { deleted: true }
      : {
          value: {
            totals: Object.fromEntries(
              Object.entries(tuple[2]).map(([ns, c]) => [
                ns,
                { known: c[0], vague: c[1], unknown: c[2] },
              ]),
            ),
            days: {},
          },
        }),
  }
}
function validTuple(t) {
  return (
    Array.isArray(t)
    && t.length === 3
    && Number.isSafeInteger(t[0])
    && t[0] >= 0
    && (t[1] === null || typeof t[1] === 'string')
    && (t[2] === null
      || (typeof t[2] === 'object'
        && !Array.isArray(t[2])
        && Object.values(t[2]).every(
          c =>
            Array.isArray(c)
            && c.length === 3
            && c.every(n => Number.isFinite(n) && n >= 0),
        )))
  )
}
function mergeWriters(a = {}, b = {}) {
  const out = Object.create(null)
  for (const source of [a, b]) {
    for (const [id, t] of Object.entries(source || {})) {
      if (!validTuple(t))
        continue
      const old = out[id]
      const stamp = [t[0], t[1] === null ? id : t[1]]
      if (!old || cmp(stamp, [old[0], old[1] === null ? id : old[1]]) > 0) {
        out[id] = t
      }
      else if (t[0] === 0 && old[0] === 0 && t[2] && old[2]) {
        const totals = { ...old[2] }
        for (const [ns, c] of Object.entries(t[2]))
          totals[ns] = c.map((v, i) => Math.max(v, totals[ns]?.[i] || 0))
        out[id] = [0, old[1], totals]
      }
    }
  }
  return out
}
function compactStatsData(input, user, fold = true) {
  const out = { ...input }
  const prefix = user ? `myielts_u_${user}_` : 'myielts_'
  const archives = new Map()
  for (const [key, raw] of Object.entries(out)) {
    if (key.startsWith(`${prefix}stats_archive_v3__entry_`)) {
      try {
        const e = JSON.parse(raw)
        if (!e.deleted)
          archives.set(key, { e, writers: mergeWriters({}, e.value?.writers) })
      }
      catch {}
    }
  }
  for (const [key, raw] of Object.entries(out)) {
    if (key.startsWith(`${prefix}stats_parts_v2__entry_`)) {
      try {
        const e = JSON.parse(raw)
        const id = decodeId(key.split('__entry_')[1])
        if (!id || e.__ielts !== 2)
          continue
        const archiveKey = `${prefix}stats_archive_v3__entry_${encode(bucketOf(id))}`
        let bucket = archives.get(archiveKey)
        const t = bucket?.writers[id]
        const old = t && partOf(t, id)
        // Active writers retain daily details. A newer archived tombstone wins over stale parts.
        if (old && cmp(old.stamp, e.stamp) > 0) {
          delete out[key]
          continue
        }
        if (!fold || (!e.deleted && Object.keys(e.value?.days || {}).length))
          continue
        bucket ||= {
          e: { __ielts: 2, stamp: [0, 'stats-archive'], value: {} },
          writers: Object.create(null),
        }
        bucket.writers = mergeWriters(bucket.writers, { [id]: tupleOf(e, id) })
        if (cmp(e.stamp, bucket.e.stamp) > 0)
          bucket.e = { ...bucket.e, stamp: e.stamp }
        archives.set(archiveKey, bucket)
        delete out[key]
      }
      catch {
        /* Invalid originals are retained for diagnosis/export. */
      }
    }
  }
  for (const [key, { e, writers }] of archives)
    out[key] = JSON.stringify({ ...e, value: { writers } })
  return out
}
function expandStatsData(input, user) {
  const out = { ...input }
  const prefix = `myielts_u_${user}_`
  for (const [key, raw] of Object.entries(input)) {
    if (key.startsWith(`${prefix}stats_archive_v3__entry_`)) {
      try {
        const e = JSON.parse(raw)
        for (const [id, t] of Object.entries(
          mergeWriters({}, e.value?.writers),
        )) {
          const target = `${prefix}stats_parts_v2__entry_${encode(id)}`
          const candidate = partOf(t, id)
          const old = out[target] && JSON.parse(out[target])
          if (!old || cmp(candidate.stamp, old.stamp) > 0)
            out[target] = JSON.stringify(candidate)
        }
        delete out[key]
      }
      catch {}
    }
  }
  return out
}

export { bucketOf, partOf, mergeWriters, compactStatsData, expandStatsData }

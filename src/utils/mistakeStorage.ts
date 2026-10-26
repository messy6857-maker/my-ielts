import type { MistakeItem } from '../composables/useStudyData'
import { notifyLocalWrite, readJson, storageFailures } from '../composables/useAuth'
import { writeStudyBatch } from './studyStorage'

export interface MistakeOperation {
  key: string
  item: MistakeItem | null
  seed: MistakeItem | null
  delta: number
  at: number
}

function operations(key: string): [string, MistakeOperation][] {
  return Object.keys(localStorage).filter(k => k.startsWith(`${key}__op_`) && !k.endsWith('__recovery'))
    .flatMap(k => {
      const base = k.slice(k.lastIndexOf('mistakes_v1'))
      const op = readJson<MistakeOperation | null>(k, null, base)
      return op ? [[k, op] as [string, MistakeOperation]] : []
    }).sort(([a, x], [b, y]) => x.at - y.at || a.localeCompare(b))
}

function replay(legacy: MistakeItem[], ops: [string, MistakeOperation][]) {
  const result = new Map(legacy.map(item => [item.key, item]))
  const seen = new Set<string>()
  for (const [, op] of ops) {
    if (!seen.has(op.key)) {
      seen.add(op.key)
      if (op.seed) result.set(op.key, op.seed)
      else result.delete(op.key)
    }
    const current = result.get(op.key)
    if (!op.item) result.delete(op.key)
    else result.set(op.key, { ...op.item, count: current ? current.count + op.delta : Math.max(1, op.delta),
      firstAt: current ? Math.min(current.firstAt, op.item.firstAt) : op.item.firstAt,
      lastAt: current ? Math.max(current.lastAt, op.item.lastAt) : op.item.lastAt })
  }
  return [...result.values()].sort((a, b) => b.lastAt - a.lastAt)
}

export function readMistakes(key: string) {
  // Read the cache before operations: a newer cache always has its operation
  // already stored. Operations, not this compatibility cache, are authoritative.
  const legacy = readJson<MistakeItem[]>(key, [], 'mistakes_v1')
  return replay(legacy, operations(key))
}

function changes(before: MistakeItem[], after: MistakeItem[]) {
  const old = new Map(before.map(item => [item.key, item]))
  const next = new Map(after.map(item => [item.key, item]))
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(key => {
    const seed = old.get(key) ?? null
    const item = next.get(key) ?? null
    return JSON.stringify(seed) === JSON.stringify(item) ? [] : [{ key, seed, item, delta: item ? Math.max(0, item.count - (seed?.count ?? 0)) : 0 }]
  })
}

export function mergeMistakes(latest: MistakeItem[], before: MistakeItem[], after: MistakeItem[]) {
  const result = new Map(latest.map(item => [item.key, item]))
  for (const change of changes(before, after)) {
    const current = result.get(change.key)
    if (!change.item) result.delete(change.key)
    else result.set(change.key, { ...change.item, count: (current?.count ?? 0) + change.delta || 1,
      firstAt: current?.firstAt ?? change.item.firstAt })
  }
  return [...result.values()].sort((a, b) => b.lastAt - a.lastAt)
}

export function writeMistakes(key: string, before: MistakeItem[], after: MistakeItem[]) {
  const legacy = readJson<MistakeItem[]>(key, [], 'mistakes_v1')
  const existing = operations(key)
  let at = existing.reduce((max, [, op]) => Math.max(max, op.at), Date.now())
  const added: [string, MistakeOperation][] = changes(before, after).map(change => [
    `${key}__op_${crypto.randomUUID()}`, { ...change, at: ++at },
  ])
  try {
    // Roll back the whole operation batch on quota failure, so retries cannot
    // apply an already-saved increment twice.
    writeStudyBatch([...added.map(([k, op]): [string, string] => [k, JSON.stringify(op)]),
      [key, JSON.stringify(replay(legacy, [...existing, ...added]))]])
    storageFailures.value = storageFailures.value.filter(k => k !== key)
    notifyLocalWrite()
    return true
  }
  catch {
    if (!storageFailures.value.includes(key)) storageFailures.value = [...storageFailures.value, key]
    return false
  }
}

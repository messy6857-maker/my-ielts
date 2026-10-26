import type { MistakeItem } from '../composables/useStudyData'
import { notifyLocalWrite, readJson, storageFailures } from '../composables/useAuth'
import { validateStudyValue } from './studySchema'

export interface MistakeOperation {
  key: string
  item: MistakeItem | null
  seed: MistakeItem | null
  delta: number
  at: number
}
export interface MistakeBatch { actor: string; sequence: number; operations: MistakeOperation[] }
export interface MistakeCheckpoint {
  items: MistakeItem[]
  seeded: string[]
  clocks: Record<string, number>
  legacyOps: string[]
  at: number
}
interface Entry { storageKey: string; id: string; value: MistakeOperation | MistakeBatch }
let actor: string | undefined
let sequence = 0
const compacting = new Map<string, Promise<boolean>>()
export const MISTAKE_COMPACT_THRESHOLD = 128

function history(key: string) {
  // A compactor writes the checkpoint BEFORE removing covered operations. If
  // it changes while we scan, retry rather than combining an old checkpoint
  // with a partly collected journal. New writes use independent atomic batches.
  for (;;) {
    const rawCheckpoint = localStorage.getItem(`${key}__checkpoint`)
    const checkpoint = readJson<MistakeCheckpoint | null>(`${key}__checkpoint`, null, 'mistakes_v1__checkpoint')
    const legacy = checkpoint?.items ?? readJson<MistakeItem[]>(key, [], 'mistakes_v1')
    const entries: Entry[] = []
    for (const storageKey of Object.keys(localStorage).filter(k => k.startsWith(`${key}__op_`) && !k.endsWith('__recovery'))) {
      const id = storageKey.slice(`${key}__op_`.length)
      const value = readJson<MistakeOperation | MistakeBatch | null>(storageKey, null, `mistakes_v1__op_${id}`)
      if (value) entries.push({ storageKey, id, value })
    }
    if (rawCheckpoint !== localStorage.getItem(`${key}__checkpoint`)) continue
    const clocks = { ...checkpoint?.clocks }
    const covered = new Set(checkpoint?.legacyOps ?? [])
    const operations: [string, MistakeOperation][] = []
    for (const { id, value } of entries) {
      if ('operations' in value) {
        if (value.sequence <= (checkpoint && Object.hasOwn(checkpoint.clocks, value.actor) ? checkpoint.clocks[value.actor] : 0)) continue
        clocks[value.actor] = Math.max(Object.hasOwn(clocks, value.actor) ? clocks[value.actor] : 0, value.sequence)
        value.operations.forEach((op, index) => operations.push([`${id}-${index}`, op]))
      }
      else if (!covered.has(id)) {
        operations.push([id, value])
        covered.add(id)
      }
    }
    operations.sort(([a, x], [b, y]) => x.at - y.at || a.localeCompare(b))
    const result = new Map(legacy.map(item => [item.key, item]))
    const seeded = new Set(checkpoint?.seeded ?? [])
    let at = checkpoint?.at ?? 0
    for (const [, op] of operations) {
      at = Math.max(at, op.at)
      if (!seeded.has(op.key)) {
        seeded.add(op.key)
        if (op.seed) result.set(op.key, op.seed)
        else result.delete(op.key)
      }
      const current = result.get(op.key)
      if (!op.item) result.delete(op.key)
      // Metadata-only edits and decrements must not resurrect deleted words.
      else if (current || op.delta > 0) result.set(op.key, {
        ...op.item,
        count: current ? Math.max(1, current.count + op.delta) : op.delta,
        firstAt: current ? Math.min(current.firstAt, op.item.firstAt) : op.item.firstAt,
        lastAt: current ? Math.max(current.lastAt, op.item.lastAt) : op.item.lastAt,
      })
    }
    legacy.forEach(item => seeded.add(item.key))
    return { entries, checkpoint: {
      items: [...result.values()].sort((a, b) => b.lastAt - a.lastAt),
      seeded: [...seeded], clocks, legacyOps: [...covered], at,
    } satisfies MistakeCheckpoint }
  }
}

export function readMistakes(key: string) { return history(key).checkpoint.items }

function changes(before: MistakeItem[], after: MistakeItem[]) {
  const old = new Map(before.map(item => [item.key, item]))
  const next = new Map(after.map(item => [item.key, item]))
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(key => {
    const seed = old.get(key) ?? null
    const item = next.get(key) ?? null
    // Signed deltas support explicit count correction as well as increments.
    // A surviving record always has at least one error; use deletion to clear it.
    return JSON.stringify(seed) === JSON.stringify(item) ? [] : [{ key, seed, item, delta: item ? item.count - (seed?.count ?? 0) : 0 }]
  })
}

export function mergeMistakes(latest: MistakeItem[], before: MistakeItem[], after: MistakeItem[]) {
  const result = new Map(latest.map(item => [item.key, item]))
  for (const change of changes(before, after)) {
    const current = result.get(change.key)
    if (!change.item) result.delete(change.key)
    else if (current || change.delta > 0) result.set(change.key, {
      ...change.item, count: Math.max(1, (current?.count ?? 0) + change.delta),
      firstAt: current ? Math.min(current.firstAt, change.item.firstAt) : change.item.firstAt,
      lastAt: current ? Math.max(current.lastAt, change.item.lastAt) : change.item.lastAt,
    })
  }
  return [...result.values()].sort((a, b) => b.lastAt - a.lastAt)
}

/** Only compactors need the lock: writers commit one immutable storage value.
 * Watermarks prevent replay while covered batches await deletion. Old UUID
 * operation IDs are retained once for migration; new writes use actor clocks.
 * Without Web Locks keep the journal, rather than risk unsafe concurrent GC. */
export function compactMistakes(key: string, force = false): Promise<boolean> {
  const active = compacting.get(key)
  if (active) return force ? active.then(() => compactMistakes(key, true)) : active
  if (!navigator.locks) return Promise.resolve(false)
  const job = navigator.locks.request(`myielts:mistakes:${key}`, { mode: 'exclusive' }, () => {
    const data = history(key)
    if (!data.entries.length || (!force && data.entries.length < MISTAKE_COMPACT_THRESHOLD)) return false
    try {
      localStorage.setItem(`${key}__checkpoint`, JSON.stringify(data.checkpoint))
      for (const entry of data.entries) localStorage.removeItem(entry.storageKey)
      try { localStorage.setItem(key, JSON.stringify(data.checkpoint.items)) } catch { /* Compatibility cache only. */ }
      return true
    }
    catch { return false }
  }).catch(() => false).finally(() => { compacting.delete(key) })
  compacting.set(key, job)
  return job
}

export function writeMistakes(key: string, before: MistakeItem[], after: MistakeItem[]) {
  try {
    validateStudyValue('mistakes_v1', after)
    const data = history(key)
    let at = Math.max(data.checkpoint.at, Date.now())
    const added = changes(before, after).map(change => ({ ...change, at: ++at }))
    if (added.length) {
      actor ??= crypto.randomUUID()
      const batch: MistakeBatch = { actor, sequence: sequence + 1, operations: added }
      // This single atomic value is the commit point. Never roll it back after
      // exposing it to other tabs/compaction; a cache failure cannot lose it.
      localStorage.setItem(`${key}__op_${actor}-${batch.sequence}`, JSON.stringify(batch))
      sequence = batch.sequence
    }
    const items = readMistakes(key)
    try { localStorage.setItem(key, JSON.stringify(items)) } catch { /* Rebuild from the authoritative journal. */ }
    storageFailures.value = storageFailures.value.filter(k => k !== key)
    notifyLocalWrite()
    if (data.entries.length + Number(added.length > 0) >= MISTAKE_COMPACT_THRESHOLD) void compactMistakes(key)
    return true
  }
  catch {
    void compactMistakes(key)
    if (!storageFailures.value.includes(key)) storageFailures.value = [...storageFailures.value, key]
    return false
  }
}

import { storageFailures, writerId } from './storage'

export interface WritingDraft {
  promptId: string
  text: string
  secondsLeft: number
  overtime?: boolean
  updatedAt?: number
  editedAt?: number
  versionId?: string
}
function legacy(task: 'task1' | 'task2', owner: string | null) {
  return owner
    ? `myielts_u_${owner}_${task}_draft_v1`
    : `myielts_${task}_draft_v1`
}
function key(task: 'task1' | 'task2', owner: string | null, promptId: string) {
  return `${legacy(task, owner)}__prompt_${encodeURIComponent(promptId)}__session_${writerId()}`
}
const origins = new Map<string, WritingDraft>()
export function listDrafts(
  task: 'task1' | 'task2',
  owner: string | null,
): WritingDraft[] {
  const prefix = legacy(task, owner)
  const distinct = new Map<string, WritingDraft>()
  for (const k of Object.keys(localStorage).filter(
    k => k === prefix || k.startsWith(`${prefix}__prompt_`),
  )) {
    try {
      const d = JSON.parse(localStorage.getItem(k)!) as WritingDraft
      if (!d || typeof d.promptId !== 'string' || typeof d.text !== 'string')
        continue
      const value = {
        ...d,
        versionId: k,
        editedAt: Number.isFinite(d.editedAt)
          ? d.editedAt
          : Number.isFinite(d.updatedAt)
            ? d.updatedAt
            : 0,
      }
      const identity = `${d.promptId}\0${d.text}`
      if (
        !distinct.has(identity)
        || (value.editedAt ?? 0) > (distinct.get(identity)?.editedAt ?? 0)
      )
        distinct.set(identity, value)
    }
    catch {
      /* Keep malformed originals for backup. */
    }
  }
  return [...distinct.values()].sort(
    (a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0),
  )
}
export function readDraft(
  task: 'task1' | 'task2',
  owner: string | null,
  promptId?: string,
  versionId?: string,
) {
  const draft
    = listDrafts(task, owner).find(
      d =>
        (!promptId || d.promptId === promptId)
        && (!versionId || d.versionId === versionId),
    ) ?? null
  if (draft)
    origins.set(key(task, owner, draft.promptId), draft)
  return draft
}
export function saveDraft(
  task: 'task1' | 'task2',
  owner: string | null,
  draft: WritingDraft,
) {
  const target = key(task, owner, draft.promptId)
  try {
    const previous = origins.get(target)
    const editedAt
      = previous?.text === draft.text ? (previous.editedAt ?? 0) : Date.now()
    const value = { ...draft, editedAt, updatedAt: Date.now() }
    localStorage.setItem(target, JSON.stringify(value))
    origins.set(target, value)
    storageFailures.value = storageFailures.value.filter(k => k !== target)
    return true
  }
  catch {
    if (!storageFailures.value.includes(target))
      storageFailures.value = [...storageFailures.value, target]
    return false
  }
}
export function deleteDraft(
  task: 'task1' | 'task2',
  owner: string | null,
  promptId: string,
) {
  // Each tab owns its snapshot; submitting one attempt never clears a sibling tab.
  localStorage.removeItem(key(task, owner, promptId))
  const old = legacy(task, owner)
  for (const k of [old, `${old}__prompt_${encodeURIComponent(promptId)}`]) {
    try {
      const d = JSON.parse(localStorage.getItem(k) ?? 'null')
      if (d?.promptId === promptId)
        localStorage.removeItem(k)
    }
    catch {
      /* Preserve invalid drafts. */
    }
  }
}

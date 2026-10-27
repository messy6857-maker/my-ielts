import { storageFailures } from './storage'

export interface WritingDraft {
  promptId: string
  text: string
  secondsLeft: number
  updatedAt?: number
}
function legacy(task: 'task1' | 'task2', owner: string | null) {
  return owner
    ? `myielts_u_${owner}_${task}_draft_v1`
    : `myielts_${task}_draft_v1`
}
function key(task: 'task1' | 'task2', owner: string | null, promptId: string) {
  return `${legacy(task, owner)}__prompt_${encodeURIComponent(promptId)}`
}
export function listDrafts(
  task: 'task1' | 'task2',
  owner: string | null,
): WritingDraft[] {
  const oldKey = legacy(task, owner)
  try {
    const old = JSON.parse(
      localStorage.getItem(oldKey) ?? 'null',
    ) as WritingDraft | null
    if (
      old?.promptId
      && old.text
      && localStorage.getItem(key(task, owner, old.promptId)) === null
    ) {
      localStorage.setItem(
        key(task, owner, old.promptId),
        JSON.stringify({ ...old, updatedAt: old.updatedAt ?? 0 }),
      )
      localStorage.removeItem(oldKey)
    }
  }
  catch {
    /* Preserve malformed originals for backup export. */
  }
  return Object.keys(localStorage)
    .filter(k => k.startsWith(`${oldKey}__prompt_`))
    .flatMap((k) => {
      try {
        const d = JSON.parse(localStorage.getItem(k)!) as WritingDraft
        return d && typeof d.promptId === 'string' && typeof d.text === 'string'
          ? [d]
          : []
      }
      catch {
        return []
      }
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}
export function readDraft(
  task: 'task1' | 'task2',
  owner: string | null,
  promptId?: string,
) {
  return (
    listDrafts(task, owner).find(d => !promptId || d.promptId === promptId)
    ?? null
  )
}
export function saveDraft(
  task: 'task1' | 'task2',
  owner: string | null,
  draft: WritingDraft,
) {
  const target = key(task, owner, draft.promptId)
  try {
    localStorage.setItem(
      target,
      JSON.stringify({ ...draft, updatedAt: Date.now() }),
    )
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
  localStorage.removeItem(key(task, owner, promptId))
}

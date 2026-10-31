import type { ExamDraft } from '../composables/useExamRecovery'

// A fresh identity for every document. sessionStorage can be cloned by the browser.
let documentId = ''
export function examSessionId() {
  documentId ||= crypto.randomUUID()
  return documentId
}
export function examAttemptId(draft: ExamDraft, sourceKey: string) {
  return (
    (typeof draft.attemptId === 'string' && draft.attemptId)
    || `legacy:${sourceKey}:${draft.updatedAt}`
  )
}
export function newestAttemptDrafts(drafts: ExamDraft[]) {
  const compare = (a: ExamDraft, b: ExamDraft) =>
    (b.editedAt ?? b.updatedAt) - (a.editedAt ?? a.updatedAt)
    || b.updatedAt - a.updatedAt
    || (b.revision || 0) - (a.revision || 0)
    || (a.versionId || '').localeCompare(b.versionId || '')
  const unique = new Map<string, ExamDraft>()
  for (const draft of [...drafts].sort(compare)) {
    if (draft.attemptId && !unique.has(draft.attemptId))
      unique.set(draft.attemptId, draft)
  }
  return [...unique.values()]
}

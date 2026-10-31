import {
  accountKey,
  batchStorage,
  collectionBases,
  compareStamp,
  envelope,
  importTable,
  saveEnvelope,
  studyBaseOf,
} from './storage'

export function studyBackup(user: string | null) {
  const data: Record<string, string> = {}
  for (const key of Object.keys(localStorage)) {
    const draft = ['task1', 'task2'].some(
      task =>
        key === accountKey(`${task}_draft_v1`, user)
        || key.startsWith(`${accountKey(`${task}_draft_v1`, user)}__prompt_`),
    )
    const guestDraft
      = user !== null
      && ['task1', 'task2'].some(
        task =>
          key === accountKey(`${task}_draft_v1`, null)
          || key.startsWith(`${accountKey(`${task}_draft_v1`, null)}__prompt_`),
      )
    const examDraft = [user, null].some(owner =>
      ['reading', 'listening'].some(kind =>
        key.startsWith(accountKey(`mock_draft_v1_${kind}_`, owner)),
      ),
    )
    if (
      studyBaseOf(key, user)
      || (user !== null && studyBaseOf(key, null))
      || draft
      || guestDraft
      || examDraft
    )
      data[key] = localStorage.getItem(key)!
  }
  return {
    format: 'my-ielts-backup',
    version: 2,
    username: user,
    includesGuestOriginals: user !== null,
    exportedAt: new Date().toISOString(),
    data,
  }
}
export function downloadStudyBackup(user: string | null) {
  const data = studyBackup(user)
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `my-ielts-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface BackupPreview {
  source: string | null
  entries: Record<string, string>
  skipped: number
}
export function previewStudyBackup(
  raw: string,
  guestOriginals = false,
): BackupPreview {
  const backup = JSON.parse(raw)
  if (
    backup?.format !== 'my-ielts-backup'
    || ![1, 2].includes(backup.version)
    || !backup.data
    || typeof backup.data !== 'object'
    || Array.isArray(backup.data)
  )
    throw new Error('无法识别的学习备份文件')
  const source = guestOriginals
    ? null
    : typeof backup.username === 'string'
      ? backup.username
      : null
  const prefix = accountKey('', source)
  const entries: Record<string, string> = {}
  let skipped = 0
  for (const [key, value] of Object.entries(backup.data)) {
    const draft
      = key.startsWith(prefix)
      && /^(?:task[12]_draft_v1(?:__prompt_.*)?|mock_draft_v1_(?:reading|listening)_.*)$/.test(
        key.slice(prefix.length),
      )
    if ((!studyBaseOf(key, source) && !draft) || typeof value !== 'string') {
      skipped++
      continue
    }
    try {
      JSON.parse(value)
      entries[key] = value
    }
    catch {
      skipped++
    }
  }
  return { source, entries, skipped }
}
export function restoreStudyBackup(
  preview: BackupPreview,
  target: string | null,
) {
  let imported = 0
  let keptNewer = 0
  let failed = 0
  batchStorage(() => {
    for (const [sourceKey, raw] of Object.entries(preview.entries)) {
      const base = sourceKey.slice(accountKey('', preview.source).length)
      const key = accountKey(base, target)
      if (/^(?:task[12]_draft_v1|mock_draft_v1_)/.test(base)) {
        // Imports are independent recovery versions and never overwrite an active tab.
        try {
          localStorage.setItem(
            `${/^task[12]_draft_v1$/.test(base) ? `${key}__prompt_${encodeURIComponent(JSON.parse(raw).promptId || 'recovered')}` : key}__session_import_${crypto.randomUUID()}`,
            raw,
          )
          imported++
        }
        catch {
          failed++
        }
        continue
      }
      try {
        const incoming = envelope(raw)
        if (collectionBases.includes(base) && !incoming.deleted) {
          importTable(base, incoming.value, target)
          imported++
          continue
        }
        const previous = localStorage.getItem(key)
        if (previous && compareStamp(envelope(previous), incoming) >= 0) {
          keptNewer++
          continue
        }
        if (saveEnvelope(key, incoming))
          imported++
        else failed++
      }
      catch {
        failed++
      }
    }
  })
  return { imported, keptNewer, failed }
}

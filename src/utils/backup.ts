import { accountKey, studyBaseOf } from './storage'

export function studyBackup(user: string | null) {
  const data: Record<string, string> = {}
  for (const key of Object.keys(localStorage)) {
    const draft = ['task1', 'task2'].some(
      task =>
        key === accountKey(`${task}_draft_v1`, user)
        || key.startsWith(`${accountKey(`${task}_draft_v1`, user)}__prompt_`),
    )
    if (studyBaseOf(key, user) || draft)
      data[key] = localStorage.getItem(key)!
  }
  return {
    format: 'my-ielts-backup',
    version: 2,
    username: user,
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

import { isStudyBase, studyBaseOf, studyPrefix, writeStudyBatch } from '../utils/studyStorage'
import { parseStudyValue } from '../utils/studySchema'
import { notifyLocalWrite, useAuth } from './useAuth'

export const BACKUP_VERSION = 1

interface StudyBackup {
  app: 'my-ielts'
  version: number
  exportedAt: string
  // Portable module names, never account names, sessions or API credentials.
  data: Record<string, string>
}

export function collectBackupData(): StudyBackup {
  const { currentUser } = useAuth()
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    const base = studyBaseOf(key, currentUser.value)
    if (base !== null)
      data[base] = localStorage.getItem(key)!
  }
  return { app: 'my-ielts', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}

export function exportBackup(): number {
  const backup = collectBackupData()
  const count = Object.keys(backup.data).length
  if (!count)
    return 0
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `my-ielts-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return count
}

export async function importBackup(file: File): Promise<{ ok: boolean; message: string }> {
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, message: '备份文件超过 10 MB，请检查文件' }
  const { currentUser } = useAuth()
  const user = currentUser.value
  try {
    const backup = JSON.parse(await file.text()) as StudyBackup
    if (backup?.app !== 'my-ielts' || backup.version !== BACKUP_VERSION
      || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data))
      return { ok: false, message: '请选择有效的 My IELTS 备份文件' }
    const entries = Object.entries(backup.data)
    for (const [base, value] of entries) {
      if (!isStudyBase(base) || typeof value !== 'string')
        return { ok: false, message: '备份包含未知模块，未导入数据' }
      parseStudyValue(base, value)
    }
    if (currentUser.value !== user)
      return { ok: false, message: '账号已切换，请重新选择备份文件' }
    const prefix = studyPrefix(user)
    if (entries.some(([base]) => localStorage.getItem(prefix + base) !== null)
      && !window.confirm('恢复备份将覆盖当前账号中对应模块的本地数据，确定继续吗？'))
      return { ok: false, message: '已取消恢复' }
    // Stage writes first; notify sync only after the full import succeeds.
    writeStudyBatch(entries.map(([base, value]) => [prefix + base, value]))
    if (entries.length)
      notifyLocalWrite()
    return { ok: true, message: `已恢复 ${entries.length} 项学习数据，即将刷新页面` }
  }
  catch {
    return { ok: false, message: '恢复失败：文件格式异常或浏览器存储空间不足' }
  }
}

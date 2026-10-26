import { parseStudyValue } from '../utils/studySchema'
import { collectStudySnapshot } from '../utils/studySnapshot'
import { draftRecordRemovals, isStudyBase, studyBaseOf, studyPrefix, writeStudyBatch } from '../utils/studyStorage'
import { notifyLocalWrite, useAuth } from './useAuth'

export const BACKUP_VERSION = 1

interface StudyBackup {
  app: 'my-ielts'
  version: number
  exportedAt: string
  // Portable module names, never account names, sessions or API credentials.
  data: Record<string, string>
  recovery?: Record<string, string>
}

export function collectBackupData(): StudyBackup {
  const { currentUser } = useAuth()
  const snapshot = collectStudySnapshot(currentUser.value)
  const data = Object.fromEntries(Object.entries(snapshot.data).map(([key, raw]) => [studyBaseOf(key, currentUser.value)!, raw]))
  return { app: 'my-ielts', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data, recovery: snapshot.recovery }
}

export function exportBackup(): number {
  const backup = collectBackupData()
  const count = Object.keys(backup.data).length
  if (!count && !Object.keys(backup.recovery ?? {}).length)
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
    const recovery = backup.recovery ?? {}
    if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)
      || Object.entries(recovery).some(([base, raw]) => !isStudyBase(base) || typeof raw !== 'string'))
      return { ok: false, message: '备份恢复区格式异常，未导入数据' }
    const entries = Object.entries(backup.data)
    for (const [base, value] of entries) {
      if (!isStudyBase(base) || typeof value !== 'string')
        return { ok: false, message: '备份包含未知模块，未导入数据' }
      parseStudyValue(base, value)
    }
    if (currentUser.value !== user)
      return { ok: false, message: '账号已切换，请重新选择备份文件' }
    const prefix = studyPrefix(user)
    if ((entries.some(([base]) => localStorage.getItem(prefix + base) !== null)
      || Object.keys(recovery).some(base => localStorage.getItem(`${prefix + base  }__recovery`) !== null))
      && !window.confirm('恢复备份将覆盖当前账号中对应模块的本地数据，确定继续吗？'))
      return { ok: false, message: '已取消恢复' }
    // Stage writes first; notify sync only after the full import succeeds.
    const restored: [string, string][] = [
      ...entries.map(([base, value]): [string, string] => [prefix + base, value]),
      ...Object.entries(recovery).map(([base, raw]): [string, string] => [`${prefix + base  }__recovery`, raw]),
    ]
    writeStudyBatch(restored, draftRecordRemovals(restored))
    if (entries.length)
      notifyLocalWrite()
    const recoveryCount = Object.keys(backup.recovery ?? {}).length
    return { ok: true, message: `已恢复 ${entries.length} 项学习数据${recoveryCount ? `；备份中另有 ${recoveryCount} 项原始损坏内容，已保留在文件 recovery 中供手动恢复` : ''}，即将刷新页面` }
  }
  catch {
    return { ok: false, message: '恢复失败：文件格式异常或浏览器存储空间不足' }
  }
}

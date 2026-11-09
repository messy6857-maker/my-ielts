import { computed, ref } from 'vue'
import {
  hasWrittenMockMistakes,
  markMockMistakesWritten,
} from '../utils/mockMistakes'
import type { collectMockMistakeEntries } from '../utils/mockMistakes'
import { accountKey, batchStorage, entryKey, subscribeStorage } from '../utils/storage'
import { useAuth } from './useAuth'
import { useMistakes } from './useStudyData'

type Entries = ReturnType<typeof collectMockMistakeEntries>
interface Pending {
  owner: string | null
  attemptId: string
  entries: Entries
  /** 创建时间（毫秒）。L7：pending 超过 90 天不再重试（与错题去重、写过标记的 90 天窗口对齐），
   * 否则标记过期后重试会把已记过的题再计一次。旧版任务没有该字段，视为未过期。 */
  createdAt?: number
}

const LEGACY_PENDING = 'mock_mistake_pending_v1'
const PENDING = 'mock_mistake_pending_v2'
const PENDING_TTL_MS = 90 * 24 * 3600 * 1000
const pendingKey = (owner: string | null, attemptId: string) => entryKey(PENDING, attemptId, owner)

function isPendingExpired(task: Pending): boolean {
  return typeof task.createdAt === 'number' && Date.now() - task.createdAt > PENDING_TTL_MS
}

// If localStorage is full, retain tasks in this page even across route and account changes.
const inMemory = new Map<string, Pending>()
const revision = ref(0)
subscribeStorage((key, source) => {
  // L10：只在 pending 相关 key 变化时重扫。批结束通知（key=''）以前对全站任何批量写都触发全表扫描；
  // 本页的 pending 写入都走 updatePending（自带 revision++），跨页签变更带真实 key，
  // 只有跨页签清库（key='' 且 source='remote'）需要兜底。
  if (key.includes(PENDING) || key.endsWith(LEGACY_PENDING) || (!key && source === 'remote'))
    revision.value++
})

function readTask(key: string, owner: string | null): Pending | null {
  try {
    const value: Pending | null = JSON.parse(localStorage.getItem(key) || 'null')
    if (value?.owner === owner && typeof value.attemptId === 'string'
      && value.attemptId && Array.isArray(value.entries)
      && value.entries.every(entry => entry && typeof entry.key === 'string'
        && typeof entry.module === 'string' && typeof entry.title === 'string'))
      return value
  }
  catch {}
  return null
}

function readPending(owner: string | null) {
  const tasks = new Map<string, Pending>()
  const legacy = readTask(accountKey(LEGACY_PENDING, owner), owner)
  if (legacy && !isPendingExpired(legacy))
    tasks.set(legacy.attemptId, legacy)
  else if (legacy)
    localStorage.removeItem(accountKey(LEGACY_PENDING, owner))
  const prefix = `${accountKey(PENDING, owner)}__entry_`
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix))
      continue
    const task = readTask(key, owner)
    if (!task)
      continue
    if (isPendingExpired(task)) {
      // L7：过期任务不再重试，顺手清掉残留 key
      localStorage.removeItem(key)
      continue
    }
    if (key !== pendingKey(owner, task.attemptId)) {
      // L9：key 与任务里的 attemptId 不一致（存储损坏/手工篡改）时不再静默丢弃——
      // 按任务里的 attemptId 认领，并把任务迁到正确的 key 下（删错 key、写对 key），
      // 否则任务会被反复读到却永远清不掉；写失败则放内存兜底。
      const correctKey = pendingKey(owner, task.attemptId)
      localStorage.removeItem(key)
      try {
        localStorage.setItem(correctKey, JSON.stringify(task))
      }
      catch {
        inMemory.set(correctKey, task)
      }
      tasks.set(task.attemptId, task)
      continue
    }
    tasks.set(task.attemptId, task)
  }
  for (const task of inMemory.values()) {
    if (task.owner === owner && !isPendingExpired(task))
      tasks.set(task.attemptId, task)
  }
  return tasks
}

function updatePending(task: Pending, complete = false) {
  const { owner, attemptId } = task
  const key = pendingKey(owner, attemptId)
  const legacyKey = accountKey(LEGACY_PENDING, owner)
  if (!complete)
    inMemory.set(key, task)
  try {
    if (complete) {
      localStorage.removeItem(key)
      // L8：存储删成功后才清内存。若 removeItem 抛错，内存副本保留以便重试；
      // 旧代码先删内存再删存储，删存储失败时 clear() 的丢弃会被复活。
      inMemory.delete(key)
    }
    else {
      localStorage.setItem(key, JSON.stringify(task))
      inMemory.delete(key)
    }
    if (readTask(legacyKey, owner)?.attemptId === attemptId)
      localStorage.removeItem(legacyKey)
  }
  catch {
    // A failed write leaves the latest unsaved questions available in this page.
  }
  revision.value++
}

export function useMockMistakeSave() {
  const { currentUser } = useAuth()
  const { addMistake } = useMistakes()
  const failed = computed(() => {
    void revision.value
    return [...readPending(currentUser.value).values()]
      .some(task => !hasWrittenMockMistakes(task.attemptId))
  })

  function writeMistakes(task: Pending) {
    // L5：不再以 hasWritten 短路——同 attempt 二次 save() 合并进来的新 entries
    // 也要写；已记过的由 addMistake 的 recordedAttempts 去重，不会重复计。
    // hasWritten 为真且 entries 为空时，下面的 filter 为空，照常 mark（幂等）并清理 pending。
    const entries = task.entries.filter(entry => !addMistake(entry.module, {
      ...entry,
      attemptId: task.attemptId,
    }))
    if (entries.length) {
      updatePending({ ...task, entries })
      return
    }
    markMockMistakesWritten(task.attemptId)
    updatePending(task, true)
  }

  function retry() {
    const tasks = readPending(currentUser.value)
    batchStorage(() => {
      for (const task of tasks.values()) {
        // L6：单个任务抛错不阻塞其余任务（addMistake 正常只返回 false 不抛错，
        // 但存储本身被禁时 saveValue 的 getItem 可能抛错，见 storage.ts）。
        try {
          writeMistakes(task)
        }
        catch (error) {
          console.error('Mock mistake retry failed', error)
        }
      }
    })
  }

  function save(attemptId: string, entries: Entries) {
    const owner = currentUser.value
    const existing = readPending(owner).get(attemptId)
    let task: Pending
    if (existing) {
      // L5：同 attemptId 二次 save() 时不再丢弃新 entries——按 key 合并进 remainder，
      // 已记过的由 addMistake 的 recordedAttempts 去重，不会重复计。
      const seen = new Set(existing.entries.map(e => e.key))
      const merged = [...existing.entries]
      let mergedNew = false
      for (const entry of entries) {
        if (!seen.has(entry.key)) {
          seen.add(entry.key)
          merged.push(entry)
          mergedNew = true
        }
      }
      task = { ...existing, entries: merged }
      // 合并进来的新 entries 先落盘，免得 writeMistakes 抛错时丢失
      if (mergedNew)
        updatePending(task)
    }
    else {
      task = { owner, attemptId, entries, createdAt: Date.now() }
      if (entries.length && !hasWrittenMockMistakes(attemptId))
        updatePending(task)
    }
    batchStorage(() => writeMistakes(task))
  }

  function clear() {
    for (const task of readPending(currentUser.value).values())
      updatePending(task, true)
  }

  return { failed, save, retry, clear }
}

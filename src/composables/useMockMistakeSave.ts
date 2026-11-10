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
      // 写成功才清内存；写失败（writePendingTask 已试过清过期任务重试）
      // 则留内存兜底，本页签内仍可重试。
      if (writePendingTask(key, task, owner))
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

/** 清掉该账号已过期（>90 天）的 pending 任务与 legacy 槽，给写失败腾地方。只删过期任务，不动有效任务。 */
function pruneExpiredPending(owner: string | null): void {
  const legacyKey = accountKey(LEGACY_PENDING, owner)
  try {
    const legacy = readTask(legacyKey, owner)
    if (legacy && isPendingExpired(legacy))
      localStorage.removeItem(legacyKey)
  }
  catch {}
  const prefix = `${accountKey(PENDING, owner)}__entry_`
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix))
      continue
    try {
      const task = readTask(key, owner)
      if (task && isPendingExpired(task))
        localStorage.removeItem(key)
    }
    catch {}
  }
}

/** 写 pending 任务。Item 5：setItem 失败（常是存储满了）时，先清掉该账号已过期的 pending 任务腾地方，
 * 再重试一次；还写不进去才返回 false，由调用方留内存兜底（本页签可见、跨页签不可见）。
 * 清过期任务再重试，让内存兜底只在存储真的满到清无可清时才发生，而不是一失败就只剩内存。 */
function writePendingTask(key: string, task: Pending, owner: string | null): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(task))
    return true
  }
  catch {
    try {
      pruneExpiredPending(owner)
      localStorage.setItem(key, JSON.stringify(task))
      return true
    }
    catch {
      return false
    }
  }
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
    // Item 4：空 entries 且无待处理任务时什么都不做——不建 pending、不标记已写。
    // 否则一次零错题的保存会把 attempt 标成已写，后面再有错题进来时，
    // 旧代码因 hasWritten 为真建不出 pending，写失败就丢了重试兜底。
    const existing = readPending(owner).get(attemptId)
    if (!existing && entries.length === 0)
      return
    // Item 3：跨页签同时 save 同一 attempt 时，后写的会覆盖先写的合并结果（丢更新）。
    // 写之前重读一次最新落盘状态再合并，把竞态窗口收到重读与落盘之间这一步；
    // 即便仍有极窄窗口撞上，addMistake 的 recordedAttempts 去重也能保证不重复计。
    const latest = readPending(owner).get(attemptId)
      ?? { owner, attemptId, entries: [], createdAt: Date.now() }
    const seen = new Set(latest.entries.map(e => e.key))
    const merged = [...latest.entries]
    let mergedNew = false
    for (const entry of entries) {
      if (!seen.has(entry.key)) {
        seen.add(entry.key)
        merged.push(entry)
        mergedNew = true
      }
    }
    const task: Pending = { ...latest, entries: merged }
    // Item 4：只要有新 entries 就落盘建 pending，不再看 hasWritten——
    // 空保存已标过已写的情况下，后面再进来的错题也得有 pending 兜底重试。
    // 合并进来的新 entries 先落盘，免得 writeMistakes 抛错时丢失。
    if (mergedNew)
      updatePending(task)
    batchStorage(() => writeMistakes(task))
  }

  function clear() {
    for (const task of readPending(currentUser.value).values())
      updatePending(task, true)
  }

  return { failed, save, retry, clear }
}

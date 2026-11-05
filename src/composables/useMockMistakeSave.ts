import { computed, shallowRef, watch } from 'vue'
import {
  hasWrittenMockMistakes,
  markMockMistakesWritten,
} from '../utils/mockMistakes'
import type { collectMockMistakeEntries } from '../utils/mockMistakes'
import { accountKey, batchStorage } from '../utils/storage'
import { useAuth } from './useAuth'
import { useMistakes } from './useStudyData'

type Entries = ReturnType<typeof collectMockMistakeEntries>
interface Pending {
  owner: string | null
  attemptId: string
  entries: Entries
}

// 失败的错题写入只放内存时，切题或离页就会丢；落到本机存储后，
// 重挂载、切题、换账号回来都能继续重试。只存本机，不参与同步。
const PENDING_KEY_BASE = 'mock_mistake_pending_v1'
function pendingKey(owner: string | null) {
  return accountKey(PENDING_KEY_BASE, owner)
}
function readStoredPending(owner: string | null): Pending | null {
  if (!owner)
    return null
  try {
    const raw = localStorage.getItem(pendingKey(owner))
    if (!raw)
      return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object')
      return null
    const p = parsed as { owner?: unknown; attemptId?: unknown; entries?: unknown }
    if (p.owner !== owner || typeof p.attemptId !== 'string' || !Array.isArray(p.entries))
      return null
    return { owner, attemptId: p.attemptId, entries: p.entries as Entries }
  }
  catch {
    return null
  }
}
function writeStoredPending(value: Pending) {
  try {
    localStorage.setItem(pendingKey(value.owner), JSON.stringify(value))
  }
  catch {
    // 本机存储写失败不阻塞错题流程；内存里的 pending 仍可当场重试。
  }
}
function removeStoredPending(owner: string | null) {
  if (!owner)
    return
  try {
    localStorage.removeItem(pendingKey(owner))
  }
  catch {}
}

export function useMockMistakeSave() {
  const { currentUser } = useAuth()
  const { addMistake } = useMistakes()
  const pending = shallowRef<Pending | null>(readStoredPending(currentUser.value))
  const failed = computed(() =>
    pending.value !== null && pending.value.owner === currentUser.value,
  )

  function setPending(value: Pending | null) {
    const previous = pending.value
    pending.value = value
    if (value)
      writeStoredPending(value)
    else if (previous)
      removeStoredPending(previous.owner)
  }

  // 换账号时读回该账号的待重试记录；内存与存储始终同步，读回不会丢数据。
  watch(currentUser, (user) => {
    pending.value = readStoredPending(user)
  })

  function retry() {
    const work = pending.value
    if (!work || work.owner !== currentUser.value)
      return
    const entries = batchStorage(() =>
      work.entries.filter(entry => !addMistake(entry.module, {
        ...entry,
        attemptId: work.attemptId,
      })),
    )
    if (entries.length) {
      setPending({ ...work, entries })
      return
    }
    markMockMistakesWritten(work.attemptId)
    setPending(null)
  }

  function save(attemptId: string, entries: Entries) {
    if (hasWrittenMockMistakes(attemptId)) {
      // 已写过：清掉该 attempt 残留的待重试记录，避免僵尸横幅。
      const stored = readStoredPending(currentUser.value)
      if (stored?.attemptId === attemptId)
        removeStoredPending(currentUser.value)
      return
    }
    if (pending.value?.attemptId !== attemptId || pending.value.owner !== currentUser.value)
      setPending({ owner: currentUser.value, attemptId, entries })
    retry()
  }

  // 显式丢弃待重试记录（内存 + 存储）。切题不再自动调用：换题不丢重试，
  // 横幅会一直留到重试成功或被显式丢弃。
  function clear() {
    setPending(null)
  }

  return { failed, save, retry, clear }
}

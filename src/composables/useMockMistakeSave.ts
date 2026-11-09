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
}

const LEGACY_PENDING = 'mock_mistake_pending_v1'
const PENDING = 'mock_mistake_pending_v2'
const pendingKey = (owner: string | null, attemptId: string) => entryKey(PENDING, attemptId, owner)

// If localStorage is full, retain tasks in this page even across route and account changes.
const inMemory = new Map<string, Pending>()
const revision = ref(0)
subscribeStorage((key) => {
  if (!key || key.includes(PENDING) || key.endsWith(LEGACY_PENDING))
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
  if (legacy)
    tasks.set(legacy.attemptId, legacy)
  const prefix = `${accountKey(PENDING, owner)}__entry_`
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix))
      continue
    const task = readTask(key, owner)
    if (task && key === pendingKey(owner, task.attemptId))
      tasks.set(task.attemptId, task)
  }
  for (const task of inMemory.values()) {
    if (task.owner === owner)
      tasks.set(task.attemptId, task)
  }
  return tasks
}

function updatePending(task: Pending, complete = false) {
  const { owner, attemptId } = task
  const key = pendingKey(owner, attemptId)
  const legacyKey = accountKey(LEGACY_PENDING, owner)
  if (complete)
    inMemory.delete(key)
  else
    inMemory.set(key, task)
  try {
    if (complete)
      localStorage.removeItem(key)
    else
      localStorage.setItem(key, JSON.stringify(task))
    if (readTask(legacyKey, owner)?.attemptId === attemptId)
      localStorage.removeItem(legacyKey)
    inMemory.delete(key)
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
    if (hasWrittenMockMistakes(task.attemptId)) {
      updatePending(task, true)
      return
    }
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
      for (const task of tasks.values())
        writeMistakes(task)
    })
  }

  function save(attemptId: string, entries: Entries) {
    const owner = currentUser.value
    const existing = readPending(owner).get(attemptId)
    const task = existing ?? { owner, attemptId, entries }
    if (!existing && entries.length && !hasWrittenMockMistakes(attemptId))
      updatePending(task)
    batchStorage(() => writeMistakes(task))
  }

  function clear() {
    for (const task of readPending(currentUser.value).values())
      updatePending(task, true)
  }

  return { failed, save, retry, clear }
}

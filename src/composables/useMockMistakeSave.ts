import { computed, shallowRef } from 'vue'
import {
  hasWrittenMockMistakes,
  markMockMistakesWritten,
} from '../utils/mockMistakes'
import type { collectMockMistakeEntries } from '../utils/mockMistakes'
import { batchStorage } from '../utils/storage'
import { useAuth } from './useAuth'
import { useMistakes } from './useStudyData'

type Entries = ReturnType<typeof collectMockMistakeEntries>

export function useMockMistakeSave() {
  const { currentUser } = useAuth()
  const { addMistake } = useMistakes()
  const pending = shallowRef<{
    owner: string | null
    attemptId: string
    entries: Entries
  } | null>(null)
  const failed = computed(() =>
    pending.value !== null && pending.value.owner === currentUser.value,
  )

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
      pending.value = { ...work, entries }
      return
    }
    markMockMistakesWritten(work.attemptId)
    pending.value = null
  }

  function save(attemptId: string, entries: Entries) {
    if (hasWrittenMockMistakes(attemptId))
      return
    if (pending.value?.attemptId !== attemptId || pending.value.owner !== currentUser.value)
      pending.value = { owner: currentUser.value, attemptId, entries }
    retry()
  }

  function clear() {
    pending.value = null
  }

  return { failed, save, retry, clear }
}

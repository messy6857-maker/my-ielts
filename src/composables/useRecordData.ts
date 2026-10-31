import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  accountKey,
  batchStorage,
  decodeId,
  readRecord,
  readRecords,
  saveRecord,
  subscribeStorage,
} from '../utils/storage'
import { useAuth } from './useAuth'

export function useRecordMap<T>(base: string) {
  const { currentUser } = useAuth()
  const state = ref<Record<string, T>>({}) as Ref<Record<string, T>>
  let loading = false
  let writing = false
  const reload = () => {
    if (loading)
      return
    loading = true
    try {
      state.value = readRecords<T>(base, currentUser.value)
    }
    finally {
      loading = false
    }
  }
  reload()
  watch(currentUser, reload, { flush: 'sync' })
  const off = subscribeStorage((key) => {
    if (writing)
      return
    const prefix = `${accountKey(base, currentUser.value)}__entry_`
    if (!key) {
      reload()
    }
    else if (key.startsWith(prefix)) {
      const id = decodeId(key.slice(prefix.length))
      if (id === null)
        return
      const value = readRecord<T>(base, id, currentUser.value)
      if (value === undefined)
        delete state.value[id]
      else state.value[id] = value
    }
  })
  if (getCurrentScope())
    onScopeDispose(off)
  return {
    state,
    reload,
    clear() {
      batchStorage(() => {
        for (const id of Object.keys(state.value)) this.set(id, undefined)
      })
    },
    set(id: string | number, value: T | undefined) {
      let ok = false
      writing = true
      try {
        ok = saveRecord(base, String(id), value, currentUser.value)
      }
      finally {
        writing = false
      }
      if (ok) {
        if (value === undefined)
          delete state.value[String(id)]
        else state.value[String(id)] = value
      }
      return ok
    },
  }
}

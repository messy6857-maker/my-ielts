import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  accountKey,
  arrayBases,
  readRecords,
  saveRecord,
  setBases,
  subscribeStorage,
} from '../utils/storage'
import { useAuth } from './useAuth'

export function useRecordMap<T>(base: string) {
  const { currentUser } = useAuth()
  const state = ref<Record<string, T>>({}) as Ref<Record<string, T>>
  let loading = false
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
    if (
      !key
      || key.startsWith(`${accountKey(base, currentUser.value)}__entry_`)
    )
      reload()
  })
  if (getCurrentScope())
    onScopeDispose(off)
  return {
    state,
    reload,
    set(id: string | number, value: T | undefined) {
      const ok = saveRecord(base, String(id), value, currentUser.value)
      reload()
      return ok
    },
  }
}
/** A table UI writes only entries it changed, never its stale full snapshot. */
export function useAccountData<T>(base: string, fallback: () => T): Ref<T> {
  const map = useRecordMap<unknown>(base)
  const isSet = setBases.includes(base)
  const isArray = arrayBases.includes(base)
  const materialize = () =>
    (isSet
      ? Object.keys(map.state.value)
      : isArray
        ? Object.values(map.state.value)
        : map.state.value) as T
  const state = ref(materialize() ?? fallback()) as Ref<T>
  let baseline = JSON.parse(JSON.stringify(state.value))
  let reloading = false
  watch(
    map.state,
    () => {
      reloading = true
      state.value = materialize()
      baseline = JSON.parse(JSON.stringify(state.value))
      reloading = false
    },
    { flush: 'sync' },
  )
  watch(
    state,
    (value) => {
      if (reloading)
        return
      const entries = (v: any) =>
        isSet
          ? Object.fromEntries((v as string[]).map(id => [id, true]))
          : isArray
            ? Object.fromEntries(
              v.map((x: any) => [
                base === 'mock_history_v1'
                  ? `${x.kind}:${x.id}:${x.date}`
                  : String(x.id),
                x,
              ]),
            )
            : v
      const before = entries(baseline)
      const after = entries(value)
      const changes = [
        ...new Set([...Object.keys(before), ...Object.keys(after)]),
      ].filter(id => JSON.stringify(before[id]) !== JSON.stringify(after[id]))
      baseline = JSON.parse(JSON.stringify(value))
      for (const id of changes) map.set(id, after[id])
    },
    { deep: true, flush: 'sync' },
  )
  return state
}

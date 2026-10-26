import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'
import { studyPrefix } from '../utils/studyStorage'
import { registerStudyWriter } from '../utils/studyWriteQueue'
import { onBeforeLogout, readJson, useAuth, writeJson } from './useAuth'

/** Bind pending writes to their original owner and coalesce deep mutations. */
export function useAccountData<T>(base: string, fallback: () => T): Ref<T> {
  const { currentUser } = useAuth()
  let ownerKey = studyPrefix(currentUser.value) + base
  const state = ref(readJson<T>(ownerKey, fallback(), base)) as Ref<T>
  let loading = false
  let scheduled = false
  const pending = new Map<string, T>()
  function flush() {
    for (const [key, value] of pending) {
      if (writeJson(key, value))
        pending.delete(key)
    }
  }
  watch(state, (value) => {
    if (loading)
      return
    pending.set(ownerKey, value)
    if (!scheduled) {
      scheduled = true
      void Promise.resolve().then(() => { scheduled = false; flush() })
    }
  }, { deep: true, flush: 'sync' })
  watch(currentUser, () => {
    flush()
    ownerKey = studyPrefix(currentUser.value) + base
    loading = true
    state.value = readJson<T>(ownerKey, fallback(), base)
    loading = false
  }, { flush: 'sync' })
  const offWriter = registerStudyWriter(flush)
  const off = onBeforeLogout(flush)
  const onHide = () => flush()
  window.addEventListener('pagehide', onHide)
  onScopeDispose(() => {
    flush()
    off()
    offWriter()
    window.removeEventListener('pagehide', onHide)
  })
  return state
}

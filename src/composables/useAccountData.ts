import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'
import { studyPrefix } from '../utils/studyStorage'
import { registerStudyWriter } from '../utils/studyWriteQueue'
import { onBeforeLogout, readJson, useAuth, writeJson } from './useAuth'

interface PersistenceOptions { debounceMs?: number; maxWaitMs?: number }

/** Pending values keep their original owner, even when a save is delayed. */
export function createAccountData<T>(base: string, fallback: () => T, options: PersistenceOptions = {}) {
  const { currentUser } = useAuth()
  let ownerKey = studyPrefix(currentUser.value) + base
  const state = ref(readJson<T>(ownerKey, fallback(), base)) as Ref<T>
  const saving = ref(false)
  let loading = false
  let scheduled = false
  let disposed = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let maxTimer: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, T>()
  function clearTimers() {
    clearTimeout(idleTimer)
    clearTimeout(maxTimer)
    idleTimer = undefined
    maxTimer = undefined
  }
  function flush() {
    clearTimers()
    for (const [key, value] of pending) {
      if (writeJson(key, value))
        pending.delete(key)
    }
    saving.value = pending.has(ownerKey)
  }
  function persistNow() {
    pending.set(ownerKey, state.value)
    flush()
  }
  watch(state, (value) => {
    if (loading)
      return
    pending.set(ownerKey, value)
    saving.value = true
    if (options.debounceMs) {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(flush, options.debounceMs)
      maxTimer ??= setTimeout(flush, options.maxWaitMs ?? options.debounceMs)
    }
    else if (!scheduled) {
      scheduled = true
      void Promise.resolve().then(() => {
        scheduled = false
        if (!disposed) flush()
      })
    }
  }, { deep: true, flush: 'sync' })
  watch(currentUser, () => {
    flush()
    ownerKey = studyPrefix(currentUser.value) + base
    loading = true
    state.value = readJson<T>(ownerKey, fallback(), base)
    loading = false
    saving.value = pending.has(ownerKey)
  }, { flush: 'sync' })
  const offWriter = registerStudyWriter(flush)
  const off = onBeforeLogout(flush)
  window.addEventListener('pagehide', flush)
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    flush()
    disposed = true
    off()
    offWriter()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { state, saving, flush, persistNow }
}

export function useAccountData<T>(base: string, fallback: () => T): Ref<T> {
  return createAccountData(base, fallback).state
}

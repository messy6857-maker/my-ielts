import type { Ref } from 'vue'
import type { DraftCollection } from '../utils/draftStorage'
import type { MistakeItem } from './useStudyData'
import { onScopeDispose, ref, watch } from 'vue'
import { isDraftCollection, mergeDraftChanges, readDraftCollection, writeDraftChanges } from '../utils/draftStorage'
import { mergeMistakes, readMistakes, writeMistakes } from '../utils/mistakeStorage'
import { isRecordCollection, mergeRecords, readRecords, writeRecords } from '../utils/recordStorage'
import { studyPrefix } from '../utils/studyStorage'
import { registerStudyWriter } from '../utils/studyWriteQueue'
import { notifyLocalWrite, onBeforeLogout, readJson, storageFailures, useAuth, writeJson } from './useAuth'

interface PersistenceOptions { debounceMs?: number; maxWaitMs?: number }

/** Pending values keep their original owner, even when a save is delayed. */
export function createAccountData<T>(base: string, fallback: () => T, options: PersistenceOptions = {}) {
  const { currentUser } = useAuth()
  let ownerKey = studyPrefix(currentUser.value) + base
  const draftBase = isDraftCollection(base)
  const mistakeBase = base === 'mistakes_v1'
  const collectionBase = isRecordCollection(base)
  const recordBase = draftBase || mistakeBase || collectionBase
  const load = (key: string): T => draftBase ? readDraftCollection(key, base) as T : mistakeBase ? readMistakes(key) as T : collectionBase ? readRecords(key, base) as T : readJson<T>(key, fallback(), base)
  const clone = (value: T): T => JSON.parse(JSON.stringify(value))
  const state = ref(load(ownerKey)) as Ref<T>
  const baselines = new Map<string, T>()
  if (recordBase) baselines.set(ownerKey, clone(state.value))
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
  function writeCollection(key: string, value: T) {
    try {
      const latest = writeRecords(key, base, baselines.get(key), value)
      // Entries are durable before this optional legacy compatibility cache.
      try { localStorage.setItem(key, JSON.stringify(latest)) } catch { /* Rebuild from entries on read. */ }
      storageFailures.value = storageFailures.value.filter(k => k !== key)
      notifyLocalWrite()
      return true
    }
    catch {
      if (!storageFailures.value.includes(key)) storageFailures.value = [...storageFailures.value, key]
      return false
    }
  }
  function flush() {
    clearTimers()
    for (const [key, value] of pending) {
      const saved = draftBase
        ? writeDraftChanges(key, base, baselines.get(key) as DraftCollection, value as DraftCollection)
        : mistakeBase ? writeMistakes(key, baselines.get(key) as MistakeItem[], value as MistakeItem[]) : collectionBase ? writeCollection(key, value) : writeJson(key, value)
      if (saved) {
        pending.delete(key)
        if (recordBase) {
          baselines.set(key, clone(load(key)))
          if (key === ownerKey) {
            loading = true
            state.value = clone(baselines.get(key)!)
            loading = false
          }
        }
      }
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
    state.value = pending.get(ownerKey) ?? load(ownerKey)
    if (recordBase && !pending.has(ownerKey)) baselines.set(ownerKey, clone(state.value))
    loading = false
    saving.value = pending.has(ownerKey)
  }, { flush: 'sync' })
  const offWriter = registerStudyWriter(flush)
  const off = onBeforeLogout(flush)
  const onStorage = (event: StorageEvent) => {
    if (!recordBase || event.storageArea !== localStorage
      || (event.key !== null && event.key !== ownerKey && !event.key.startsWith(`${ownerKey}__${draftBase ? 'item' : collectionBase ? 'entry' : 'op'}_`) && event.key !== `${ownerKey}__checkpoint`))
      return
    const latest = load(ownerKey)
    const merged = (draftBase
      ? mergeDraftChanges(clone(latest) as DraftCollection, baselines.get(ownerKey) as DraftCollection, state.value as DraftCollection)
      : collectionBase ? mergeRecords(base, clone(latest), baselines.get(ownerKey), state.value)
      : mergeMistakes(clone(latest) as MistakeItem[], baselines.get(ownerKey) as MistakeItem[], state.value as MistakeItem[])) as T
    baselines.set(ownerKey, clone(latest))
    loading = true
    state.value = merged
    loading = false
    if (pending.has(ownerKey)) pending.set(ownerKey, state.value)
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', flush)
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    flush()
    disposed = true
    off()
    offWriter()
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { state, saving, flush, persistNow }
}

export function useAccountData<T>(base: string, fallback: () => T): Ref<T> {
  return createAccountData(base, fallback).state
}

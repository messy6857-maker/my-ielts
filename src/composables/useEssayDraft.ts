import type { Ref } from 'vue'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { studyPrefix } from '../utils/studyStorage'
import { createAccountData } from './useAccountData'
import { storageFailures, useAuth } from './useAuth'

export interface EssayDraft { text: string; secondsLeft: number; updatedAt: number }
/** Each prompt has an account-owned draft. Mutations are coalesced by useAccountData. */
export function useEssayDraft(task: 1 | 2, text: Ref<string>, seconds: Ref<number>) {
  const persistence = createAccountData<Record<string, EssayDraft>>(`task${task}_drafts_v1`, () => ({}), { debounceMs: 1500, maxWaitMs: 5000 })
  const drafts = persistence.state
  const active = ref<string | null>(null)
  const restored = ref(false)
  const { currentUser } = useAuth()
  watch(currentUser, () => { active.value = null; restored.value = false }, { flush: 'sync' })
  function save() {
    if (!active.value)
      return
    drafts.value[active.value] = { text: text.value, secondsLeft: seconds.value, updatedAt: Date.now() }
  }
  watch([text, seconds], save, { flush: 'sync' })
  function open(id: string, timeLimit: number) {
    active.value = null
    const draft = drafts.value[id]
    text.value = draft?.text ?? ''
    seconds.value = draft?.secondsLeft ?? timeLimit
    restored.value = !!draft
    active.value = id
  }
  function close() {
    if (active.value) {
      save()
      persistence.persistNow()
      active.value = null
    }
  }
  function discard() {
    const id = active.value
    active.value = null
    if (id) {
      delete drafts.value[id]
      persistence.persistNow()
    }
  }
  onScopeDispose(close)
  const saveFailed = computed(() => {
    const key = `${studyPrefix(currentUser.value)}task${task}_drafts_v1`
    return storageFailures.value.some(failed => failed === key || failed.startsWith(`${key}__item_`))
  })
  const savedAt = computed(() => active.value ? drafts.value[active.value]?.updatedAt : undefined)
  return { open, close, discard, saveFailed, saving: persistence.saving, discardActive: () => { active.value = null }, savedAt, restored }
}

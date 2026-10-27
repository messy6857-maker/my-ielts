import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { accountKey, storageFailures, writerId } from '../utils/storage'
import { accountNotice, onBeforeLogout, useAuth } from './useAuth'

export interface ExamDraft {
  version: 1
  kind: 'reading' | 'listening'
  testId: string
  answers: Record<string, string>
  timeLeft: number
  extra?: any
  updatedAt: number
}
export function useExamRecovery(options: {
  kind: ExamDraft['kind']
  testId: Ref<string>
  started: Ref<boolean>
  submitted: Ref<boolean>
  answers: Ref<Record<string, string>>
  timeLeft: Ref<number>
  pause: () => void
  remaining: () => number
  extra?: () => unknown
}) {
  const owner = useAuth().currentUser.value
  let activeTestId = options.testId.value
  const writer = writerId()
  const baseKey = (id = options.testId.value) =>
    accountKey(`mock_draft_v1_${options.kind}_${encodeURIComponent(id)}`, owner)
  const key = (id = options.testId.value) => `${baseKey(id)}__session_${writer}`
  const blocked = computed(() => useAuth().currentUser.value !== owner)
  const error = ref('')
  const draft = ref<ExamDraft | null>(null)
  function refresh() {
    const prefix = baseKey()
    const candidates = Object.keys(localStorage)
      .filter(k => k === prefix || k.startsWith(`${prefix}__session_`))
      .flatMap((storedKey) => {
        try {
          const d = JSON.parse(
            localStorage.getItem(storedKey) ?? 'null',
          ) as ExamDraft | null
          return d?.version === 1
            && d.kind === options.kind
            && d.testId === options.testId.value
            && d.answers
            && typeof d.answers === 'object'
            && Object.values(d.answers).every(a => typeof a === 'string')
            && Number.isFinite(d.timeLeft)
            ? [{ storedKey, value: d }]
            : []
        }
        catch {
          return []
        }
      })
      .sort((a, b) => b.value.updatedAt - a.value.updatedAt)
    draft.value
      = (candidates.find(c => c.storedKey === key()) ?? candidates[0])?.value
      ?? null
  }
  function save() {
    if (!options.started.value || options.submitted.value)
      return true
    const value: ExamDraft = {
      version: 1,
      kind: options.kind,
      testId: activeTestId,
      answers: { ...options.answers.value },
      timeLeft: Math.max(0, options.remaining()),
      extra: options.extra?.(),
      updatedAt: Date.now(),
    }
    try {
      localStorage.setItem(key(activeTestId), JSON.stringify(value))
      draft.value = value
      storageFailures.value = storageFailures.value.filter(
        k => k !== key(activeTestId),
      )
      return true
    }
    catch {
      error.value
        = '作答草稿保存失败，请先复制答案或导出可用备份，不要关闭页面。'
      if (!storageFailures.value.includes(key(activeTestId)))
        storageFailures.value = [...storageFailures.value, key(activeTestId)]
      return false
    }
  }
  function clear() {
    localStorage.removeItem(key(activeTestId))
    draft.value = null
  }
  function mismatch() {
    if (!blocked.value)
      return false
    const saved = save()
    const message = `账号已变化，本次模考已暂停。${saved ? `答案已保存在原身份的本机草稿中；${owner ? '重新登录原账号' : '退出账号后以游客身份'}回到此套题，可从剩余时间继续作答。` : '作答草稿保存失败，请先复制答案，不要关闭页面。'}`
    error.value = message
    accountNotice.value = message
    options.pause()
    return true
  }
  const stopOwner = watch(
    useAuth().currentUser,
    () => {
      mismatch()
    },
    { flush: 'sync' },
  )
  const stopAnswers = watch(options.answers, save, {
    deep: true,
    flush: 'sync',
  })
  const stopTest = watch(options.testId, refresh)
  const offLogout = onBeforeLogout(() => {
    save()
    options.pause()
  })
  window.addEventListener('pagehide', save)
  const visibility = () => {
    if (document.visibilityState === 'hidden')
      save()
  }
  document.addEventListener('visibilitychange', visibility)
  onUnmounted(() => {
    save()
    options.pause()
    stopOwner()
    stopAnswers()
    stopTest()
    offLogout()
    window.removeEventListener('pagehide', save)
    document.removeEventListener('visibilitychange', visibility)
  })
  refresh()
  return {
    begin() {
      activeTestId = options.testId.value
    },
    owner,
    blocked,
    error,
    draft,
    refresh,
    save,
    clear,
    mismatch,
  }
}

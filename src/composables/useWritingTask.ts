import type { WritingDraft } from '../utils/drafts'
import { computed, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  deleteDraft,
  emergencyWritingDrafts,
  listDrafts,
  readDraft,
  readOwnDraft,
  saveDraft,
} from '../utils/drafts'
import { accountPrefix, readRecords, saveRecord } from '../utils/storage'
import { onSyncApplied } from './syncClient'
import { onBeforeLogout, useAuth } from './useAuth'
import { alertDialog, confirmDialog } from './useDialog'

// 大作文、小作文共用的写作流程：选题、限时计时、草稿（按账号存、切页/换号不丢）、
// 提交批改、存进历史、从历史回看。两个页面只保留各自的题目展示和批改结果展示。
// 每一步的顺序和原来两个页面里完全一样，只是写在一处。

interface EssayBase {
  id: number | string
  promptId: string
  promptTitleCn: string
  text: string
  wordCount: number
  secondsUsed: number
  timed?: boolean
  overtime?: boolean
  createdAt: number
}
export type SavedEssay<X = object> = EssayBase & X

export interface WritingTaskOptions<P extends { id: string }, R, X> {
  task: 'task1' | 'task2'
  /** 历史记录的存储 key */
  essayKey: string
  /** 限时（秒） */
  timeLimit: number
  /** 不足这么多词提交前先确认 */
  minWords: number
  messages: { tooFew: string, confirm: (words: number) => string }
  findPrompt: (id: string) => P | null
  /** 结果页显示的题目原文 */
  questionOf: (p: P) => string
  /** 历史里显示的中文标题 */
  titleCnOf: (p: P) => string
  /** 批改 / 统计 */
  analyze: (text: string) => R
  /** 存进历史时除通用字段外要记的（分数、词数…） */
  recordFields: (result: R) => X & { wordCount: number }
  /** 从别的页面点“继续草稿”带过来的选择 */
  resumeSelection: () => { prompt: string, draft: string } | undefined
}

export function useWritingTask<P extends { id: string }, R, X>(options: WritingTaskOptions<P, R, X>) {
  const { task, essayKey: ESSAY_KEY, timeLimit: TIME_LIMIT, findPrompt } = options
  type Saved = SavedEssay<X>

  const view = ref<'home' | 'write' | 'result'>('home')

  // ---------- 历史 ----------
  const history = ref<Saved[]>([])
  function loadHistory() {
    history.value = Object.values(
      readRecords<Saved>(ESSAY_KEY, useAuth().currentUser.value),
    ).sort((a, b) => b.createdAt - a.createdAt)
  }
  loadHistory()
  const resumeError = ref(false)
  const { currentUser } = useAuth()
  watch(currentUser, () => {
    loadHistory()
    restoreDraft()
  })
  function saveEssay(e: Saved) {
    if (!saveRecord(ESSAY_KEY, String(e.id), e, currentUser.value))
      return false
    loadHistory()
    for (const old of history.value.slice(50))
      saveRecord(ESSAY_KEY, String(old.id), undefined, currentUser.value)
    loadHistory()
    return true
  }
  function removeEssay(id: number | string) {
    saveRecord(ESSAY_KEY, String(id), undefined, currentUser.value)
    loadHistory()
  }

  // ---------- 写作 ----------
  const prompt = ref<P | null>(null)
  const essayText = ref('')
  const secondsLeft = ref(TIME_LIMIT)
  const timerOn = ref(false)
  const timerStarted = ref(false)
  const timeUp = ref(false)
  const overtime = ref(false)
  let timerId: ReturnType<typeof setInterval> | null = null
  // 倒计时锚点：开始时记下截止时间戳，每 tick 用墙钟重算，避免后台节流导致限时变慢
  let timerEndAt = 0

  const wordCount = computed(
    () => essayText.value.trim().split(/\s+/).filter(Boolean).length,
  )
  const timeText = computed(() => {
    const s = Math.max(0, secondsLeft.value)
    return `${`${Math.floor(s / 60)}`.padStart(2, '0')}:${`${s % 60}`.padStart(2, '0')}`
  })

  // ---------- 草稿 ----------
  // 防抖写入普通 localStorage（刻意不用 writeJson，避免写作中频繁触发同步推送）；
  // 每任务独立 key，提交成功后清除；切页签/切模块导致组件卸载时立即 flush，不丢稿
  // 属主制：草稿归属哪个身份就写哪个身份的 key（登录账号 myielts_u_<用户名>_task1_draft_v1 / task2，
  // 游客沿用原全局 key）；draftOwner 在挂载恢复与切换账号时确定，save/clear/flush 一律用它，
  // 不再按调用时刻的 currentUser 现算——否则退出后卸载 flush 会把旧账号的全文写进游客全局 key。
  // 仍走普通 localStorage（刻意不用 writeJson，草稿不同步）；旧全局草稿不迁移给登录账号
  const emergencyDrafts = {
    get: (owner: string | null) =>
      emergencyWritingDrafts.get(JSON.stringify([task, owner])),
    set: (owner: string | null, value: WritingDraft) =>
      emergencyWritingDrafts.set(JSON.stringify([task, owner]), value),
    delete: (owner: string | null) =>
      emergencyWritingDrafts.delete(JSON.stringify([task, owner])),
  }
  let draftOwner: string | null = currentUser.value
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  const drafts = ref(listDrafts(task, draftOwner))
  function saveDraftNow(): boolean {
    if (view.value !== 'write' || !prompt.value)
      return true
    const ok = essayText.value.trim()
      ? saveDraft(task, draftOwner, {
          promptId: prompt.value.id,
          text: essayText.value,
          secondsLeft: secondsLeft.value,
          overtime: overtime.value,
        })
      : (deleteDraft(task, draftOwner, prompt.value.id), true)
    if (ok)
      emergencyDrafts.delete(draftOwner)
    drafts.value = listDrafts(task, draftOwner)
    return ok
  }
  const offLogout = onBeforeLogout(saveDraftNow)
  const offSync = onSyncApplied(loadHistory)
  function onVisibility() {
    if (document.visibilityState === 'hidden')
      saveDraftNow()
  }
  window.addEventListener('pagehide', saveDraftNow)
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeRouteLeave(() => saveDraftNow())
  watch(essayText, () => {
    if (view.value !== 'write')
      return
    if (draftTimer)
      clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraftNow, 2000)
  })
  onUnmounted(() => {
    offLogout()
    offSync()
    window.removeEventListener('pagehide', saveDraftNow)
    document.removeEventListener('visibilitychange', onVisibility)
    if (timerId)
      clearInterval(timerId)
    if (draftTimer)
      clearTimeout(draftTimer)
    if (!saveDraftNow() && prompt.value) {
      emergencyDrafts.set(draftOwner, {
        promptId: prompt.value.id,
        text: essayText.value,
        secondsLeft: secondsLeft.value,
        overtime: overtime.value,
      })
    }
  })
  // 恢复草稿：挂载时调用一次；切换账号时也调用，先取消 pending 防抖、再按新身份重载。
  // 新身份有合法草稿则恢复；无草稿则回到选题页（清屏，不再留旧身份的全文）
  function restoreDraft(useRequested = false) {
    if (!saveDraftNow() && prompt.value) {
      emergencyDrafts.set(draftOwner, {
        promptId: prompt.value.id,
        text: essayText.value,
        secondsLeft: secondsLeft.value,
        overtime: overtime.value,
      })
    }
    if (draftTimer)
      clearTimeout(draftTimer)
    draftTimer = null
    if (timerId)
      clearInterval(timerId)
    timerId = null
    timerOn.value = false
    draftOwner = currentUser.value
    try {
      drafts.value = listDrafts(task, draftOwner)
      const requested = useRequested
        ? options.resumeSelection()
        : undefined
      const version = requested && accountPrefix(draftOwner) + requested.draft
      const stored = readDraft(task, draftOwner, requested?.prompt, version)
      resumeError.value = !!requested && !stored
      const d = requested
        ? stored
        : emergencyDrafts.get(draftOwner) ?? stored
      if (d) {
        const p = findPrompt(d.promptId)
        if (d.text && p) {
          prompt.value = p
          essayText.value = d.text
          // 0 是合法的“已超时”，不能用 || 当缺失处理；非法值才回落满时
          const savedSeconds
            = typeof d.secondsLeft === 'number' && Number.isFinite(d.secondsLeft)
              ? d.secondsLeft
              : TIME_LIMIT
          secondsLeft.value = Math.min(Math.max(0, savedSeconds), TIME_LIMIT)
          timeUp.value = secondsLeft.value <= 0
          overtime.value = !!d.overtime
          timerStarted.value = secondsLeft.value < TIME_LIMIT || !!d.overtime
          view.value = 'write'
          return
        }
      }
    }
    catch {
      /* ignore */
    }
    prompt.value = null
    essayText.value = ''
    secondsLeft.value = TIME_LIMIT
    overtime.value = false
    timeUp.value = false
    view.value = 'home'
  }
  restoreDraft(true)
  watch(options.resumeSelection, (requested) => {
    if (!requested)
      return
    const version = accountPrefix(draftOwner) + requested.draft
    const saved = listDrafts(task, draftOwner)
      .find(d => d.promptId === requested.prompt && d.versionId === version)
    resumeError.value = !saved
    if (saved)
      resumeDraft(saved.promptId, saved.versionId)
  })

  function startWrite(p: P, versionId?: string) {
    if (!saveDraftNow())
      return
    const saved = readDraft(task, draftOwner, p.id, versionId)
    prompt.value = p
    essayText.value = saved?.text ?? ''
    secondsLeft.value = saved?.secondsLeft ?? TIME_LIMIT
    timeUp.value = secondsLeft.value <= 0
    overtime.value = !!saved?.overtime
    timerStarted.value = secondsLeft.value < TIME_LIMIT || !!saved?.overtime
    timerOn.value = false
    if (timerId)
      clearInterval(timerId)
    view.value = 'write'
  }

  function continueOvertime() {
    overtime.value = true
    timerOn.value = false
    if (timerId)
      clearInterval(timerId)
    saveDraftNow()
  }
  function toggleTimer() {
    if (timeUp.value || overtime.value)
      return
    if (timerOn.value) {
      timerOn.value = false
      // 暂停前先按锚点重算一次，避免最后不足 1 秒的漂移
      if (timerEndAt) {
        secondsLeft.value = Math.max(
          0,
          Math.ceil((timerEndAt - Date.now()) / 1000),
        )
      }
      timerEndAt = 0
      if (timerId)
        clearInterval(timerId)
    }
    else {
      timerOn.value = true
      timerStarted.value = true
      timerEndAt = Date.now() + secondsLeft.value * 1000
      timerId = setInterval(() => {
        secondsLeft.value = Math.max(
          0,
          Math.ceil((timerEndAt - Date.now()) / 1000),
        )
        if (secondsLeft.value <= 0) {
          secondsLeft.value = 0
          timeUp.value = true
          timerOn.value = false
          timerEndAt = 0
          if (timerId)
            clearInterval(timerId)
        }
      }, 1000)
    }
  }

  function resetTimer() {
    if (timerId)
      clearInterval(timerId)
    timerOn.value = false
    timerStarted.value = false
    overtime.value = false
    timeUp.value = false
    secondsLeft.value = TIME_LIMIT
  }

  function backHome() {
    if (!saveDraftNow())
      return
    if (timerId)
      clearInterval(timerId)
    timerOn.value = false
    view.value = 'home'
    loadHistory()
  }

  // ---------- 批改 ----------
  const result = ref<R | null>(null)
  const resultPrompt = ref<P | null>(null)
  const resultQuestion = ref('')
  const secondsUsed = ref(0)
  const secondsTimed = ref(true)

  const archiveError = ref('')
  let pendingEssay: {
    owner: string | null
    record: Saved
    draft: WritingDraft | null
  } | null = null
  function persistEssay(record: Saved) {
    pendingEssay ??= {
      owner: draftOwner,
      record,
      draft: readOwnDraft(task, draftOwner, record.promptId),
    }
    if (saveEssay(record)) {
      if (pendingEssay.draft) {
        deleteDraft(
          task,
          pendingEssay.owner,
          record.promptId,
          pendingEssay.draft,
        )
      }
      pendingEssay = null
      archiveError.value = ''
      drafts.value = listDrafts(task, draftOwner)
    }
    else {
      archiveError.value
        = '作文存档失败，原文仍保留在草稿中。请重试保存或复制原文后再离开。'
    }
  }
  function retryArchive() {
    if (pendingEssay?.owner === currentUser.value)
      persistEssay(pendingEssay.record)
  }
  function submitEssay() {
    if (wordCount.value < 50) {
      alertDialog(options.messages.tooFew)
      return
    }
    // 词数足够时同步提交；不足最低词数先弹站内确认框，确定后再提交
    if (wordCount.value < options.minWords) {
      confirmDialog(options.messages.confirm(wordCount.value), { confirmText: '提交' })
        .then((ok) => {
          if (ok)
            doSubmitEssay()
        })
      return
    }
    doSubmitEssay()
  }
  function doSubmitEssay() {
    if (timerId)
      clearInterval(timerId)
    timerOn.value = false
    secondsUsed.value = TIME_LIMIT - secondsLeft.value
    secondsTimed.value = timerStarted.value
    result.value = options.analyze(essayText.value)
    resultPrompt.value = prompt.value
    resultQuestion.value = prompt.value
      ? options.questionOf(prompt.value)
      : ''
    if (!saveDraftNow())
      return
    view.value = 'result'
    // 自动存档
    if (prompt.value && result.value) {
      pendingEssay = null
      persistEssay({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        promptId: prompt.value.id,
        promptTitleCn: options.titleCnOf(prompt.value),
        text: essayText.value,
        ...options.recordFields(result.value),
        secondsUsed: secondsUsed.value,
        timed: timerStarted.value,
        overtime: overtime.value,
        createdAt: Date.now(),
      } as Saved)
    }
  }

  function reviewEssay(e: Saved) {
    const p = findPrompt(e.promptId)
    resultPrompt.value = p
    resultQuestion.value = p
      ? options.questionOf(p)
      : e.promptTitleCn
    essayText.value = e.text
    result.value = options.analyze(e.text)
    secondsUsed.value = e.secondsUsed
    secondsTimed.value = e.timed !== false
    overtime.value = !!e.overtime
    view.value = 'result'
  }

  function resumeDraft(promptId: string, versionId?: string) {
    const selected = findPrompt(promptId)
    if (selected)
      startWrite(selected, versionId)
  }

  return {
    view,
    history,
    resumeError,
    removeEssay,
    prompt,
    essayText,
    secondsLeft,
    timerOn,
    timerStarted,
    timeUp,
    overtime,
    wordCount,
    timeText,
    drafts,
    saveDraftNow,
    startWrite,
    continueOvertime,
    toggleTimer,
    resetTimer,
    backHome,
    result,
    resultPrompt,
    resultQuestion,
    secondsUsed,
    secondsTimed,
    archiveError,
    retryArchive,
    submitEssay,
    reviewEssay,
    resumeDraft,
  }
}

/** 历史和结果页里的日期、用时显示 */
export function formatEssayDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}
export function formatEssayDuration(s: number): string {
  return `${Math.floor(s / 60)}分${s % 60}秒`
}

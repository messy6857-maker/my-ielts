import type { WordSchedule } from '../composables/useSpacedRepetition'
import type { MistakeItem } from '../composables/useStudyData'
import type { WritingDraft } from './drafts'
import { mockTestList } from '../pages/mock/registry'
import { listDrafts } from './drafts'
import { accountPrefix } from './storage'

export interface UnfinishedMock {
  kind: 'listening' | 'reading'
  testId: string
  label: string
  updatedAt: number
  path: string
}

export interface TodayTasksSnapshot {
  dueWordCount: number
  recentMistakes: MistakeItem[]
  unfinishedMocks: UnfinishedMock[]
  writingDrafts: Array<WritingDraft & { task: 'task1' | 'task2', path: string }>
  studySeconds: number
  isEmpty: boolean
}

export function countDueSchedules(
  schedules: Record<string, WordSchedule | undefined>,
  now = Date.now(),
): number {
  let n = 0
  for (const s of Object.values(schedules)) {
    if (s && Number.isFinite(s.dueAt) && s.dueAt <= now)
      n++
  }
  return n
}

export function pickRecentMistakes(
  mistakes: MistakeItem[],
  limit = 5,
): MistakeItem[] {
  return [...mistakes]
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit)
}

function mockLabel(testId: string): string {
  return mockTestList.find(t => t.id === testId)?.label ?? testId
}

/** Scan account-scoped unfinished mock drafts (not submitted). */
export function listUnfinishedMocks(
  owner: string | null,
  storage: Storage = localStorage,
): UnfinishedMock[] {
  const prefix = `${accountPrefix(owner)}mock_draft_v1_`
  const best = new Map<string, UnfinishedMock>()
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(prefix))
      continue
    if (key.includes('__completed_') || key.includes('__submitted_'))
      continue
    try {
      const draft = JSON.parse(storage.getItem(key) ?? 'null') as {
        version?: number
        kind?: string
        testId?: string
        attemptId?: string
        submitted?: boolean
        updatedAt?: number
        editedAt?: number
      } | null
      if (!draft || draft.version !== 1 || draft.submitted)
        continue
      if (draft.kind !== 'listening' && draft.kind !== 'reading')
        continue
      if (typeof draft.testId !== 'string' || !draft.testId)
        continue
      // A-7: a retired retained copy keeps submitted=false (leaveRetired),
      // but carries an independent __completed_<attemptId> marker key, the
      // same marker the mock page itself uses to exclude it. Exclude it here
      // too; drafts without attemptId (legacy) keep the old behaviour.
      if (draft.attemptId) {
        const marker
          = `${prefix}${draft.kind}_${encodeURIComponent(draft.testId)}__completed_${encodeURIComponent(draft.attemptId)}`
        if (storage.getItem(marker) != null)
          continue
      }
      const updatedAt = Number(draft.editedAt ?? draft.updatedAt ?? 0) || 0
      const id = `${draft.kind}:${draft.testId}`
      const next: UnfinishedMock = {
        kind: draft.kind,
        testId: draft.testId,
        label: mockLabel(draft.testId),
        updatedAt,
        path:
          draft.kind === 'listening'
            ? `/mock/listening-test?test=${encodeURIComponent(draft.testId)}`
            : `/mock/reading-test?test=${encodeURIComponent(draft.testId)}`,
      }
      const prev = best.get(id)
      if (!prev || next.updatedAt >= prev.updatedAt)
        best.set(id, next)
    }
    catch {
      /* ignore malformed */
    }
  }
  return [
    ...best.values(),
  ].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listWritingDraftSummaries(owner: string | null) {
  const items: Array<WritingDraft & { task: 'task1' | 'task2', path: string }>
    = []
  for (const task of ['task1', 'task2'] as const) {
    for (const d of listDrafts(task, owner)) {
      if (!d.text?.trim())
        continue
      const tab = task === 'task1'
        ? 'essay-small'
        : 'essay-big'
      const version = d.versionId?.slice(accountPrefix(owner).length)
      const query = new URLSearchParams({ tab, prompt: d.promptId })
      if (version)
        query.set('draft', version)
      items.push({ ...d, task, path: `/writing?${query}` })
    }
  }
  return items.sort(
    (a, b) =>
      (b.stateAt ?? b.editedAt ?? b.updatedAt ?? 0)
      - (a.stateAt ?? a.editedAt ?? a.updatedAt ?? 0),
  )
}

export function buildTodayTasks(input: {
  schedules: Record<string, WordSchedule | undefined>
  mistakes: MistakeItem[]
  owner: string | null
  studySeconds: number
  now?: number
  storage?: Storage
}): TodayTasksSnapshot {
  const dueWordCount = countDueSchedules(input.schedules, input.now)
  const recentMistakes = pickRecentMistakes(input.mistakes, 5)
  const unfinishedMocks = listUnfinishedMocks(
    input.owner,
    input.storage ?? localStorage,
  )
  const writingDrafts = listWritingDraftSummaries(input.owner).slice(0, 5)
  const isEmpty
    = dueWordCount === 0
      && recentMistakes.length === 0
      && unfinishedMocks.length === 0
      && writingDrafts.length === 0
      && input.studySeconds <= 0
  return {
    dueWordCount,
    recentMistakes,
    unfinishedMocks,
    writingDrafts,
    studySeconds: input.studySeconds,
    isEmpty,
  }
}

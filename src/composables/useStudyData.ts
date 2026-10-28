import { computed, watch } from 'vue'
import { dateTime } from '../utils/legacyMerge'
import {
  accountKey,
  batchStorage,
  entryKey,
  readRecords,
  readValue,
  saveEnvelope,
  writerId,
} from '../utils/storage'
import { useAuth } from './useAuth'
import { useRecordMap } from './useRecordData'

export type MistakeModule =
  | 'vocabulary'
  | 'typing'
  | 'listening'
  | 'reading'
  | 'corpus'
export type ProgressModule =
  | 'vocabulary'
  | 'flashcard'
  | 'typing'
  | 'listening'
  | 'reading'
  | 'writing'
  | 'listening_flashcard'
  | 'reading_flashcard'
  | 'corpus_flashcard'
export interface MistakeItem {
  key: string
  module: MistakeModule
  title: string
  detail: string
  hint?: string
  count: number
  firstAt: number
  lastAt: number
  failureDays?: number
}
export interface ModuleProgress {
  done: number
  total: number
  updatedAt: number
}
export const MISTAKE_MODULE_LABEL: Record<MistakeModule, string> = {
  vocabulary: '词汇拼写',
  typing: '打字练习',
  listening: '听力 179',
  reading: '阅读 376',
  corpus: '听力语料库',
}
export const PROGRESS_MODULE_LABEL: Record<ProgressModule, string> = {
  vocabulary: '词汇拼写',
  flashcard: '单词自测（最近一轮）',
  typing: '打字练习',
  listening: '听力',
  reading: '阅读',
  writing: '写作',
  listening_flashcard: '听力自测',
  reading_flashcard: '阅读自测',
  corpus_flashcard: '语料库自测',
}
export function nsKey(base: string, user?: string | null) {
  return accountKey(
    base,
    user === undefined ? useAuth().currentUser.value : user,
  )
}
export function studyDay(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
interface MistakePart extends MistakeItem {
  epoch: string
  days: Record<string, number>
}
export function migrateMistakes(user: string | null) {
  const marker = `myielts_local_mistakes_migrated:${nsKey('mistakes_v1', user)}`
  if (localStorage.getItem(marker))
    return
  const items = readValue<MistakeItem[]>(nsKey('mistakes_v1', user), [])
  if (!Array.isArray(items))
    return
  batchStorage(() => {
    for (const item of items) {
      if (!item || typeof item.key !== 'string' || !Number.isFinite(item.count))
        continue
      const key = entryKey('mistake_parts_v2', `${item.key}|legacy`, user)
      if (localStorage.getItem(key) === null) {
        saveEnvelope(
          key,
          {
            __ielts: 2,
            stamp: [0, 'legacy'],
            value: {
              ...item,
              module: item.key.startsWith('corpus:') ? 'corpus' : item.module,
              epoch: '',
              days: {},
            },
          },
          'remote',
        )
      }
    }
    localStorage.setItem(marker, '1')
  })
}
export const useMistakes = createGlobalState(() => {
  const { currentUser } = useAuth()
  migrateMistakes(currentUser.value)
  const parts = useRecordMap<MistakePart>('mistake_parts_v2')
  const resets = useRecordMap<{
    epoch: string
  }>('mistake_resets_v2')
  watch(
    currentUser,
    () => {
      migrateMistakes(currentUser.value)
      parts.reload()
    },
    { flush: 'sync' },
  )
  const mistakes = computed<MistakeItem[]>(() => {
    const result = new Map<
      string,
      MistakeItem & {
        dates: Set<string>
      }
    >()
    for (const part of Object.values(parts.state.value)) {
      if (
        !part
        || part.count <= 0
        || part.epoch !== (resets.state.value[part.key]?.epoch ?? '')
      )
        continue
      const previous = result.get(part.key)
      const dates = previous?.dates ?? new Set<string>()
      for (const [day, count] of Object.entries(part.days ?? {})) {
        if (count > 0 && dateTime(day) >= Date.now() - 90 * 86400000)
          dates.add(day)
      }
      result.set(part.key, {
        ...part,
        count: (previous?.count ?? 0) + part.count,
        firstAt: Math.min(previous?.firstAt ?? part.firstAt, part.firstAt),
        lastAt: Math.max(previous?.lastAt ?? 0, part.lastAt),
        dates,
      })
    }
    return [...result.values()]
      .map(({ dates, ...item }) => ({ ...item, failureDays: dates.size }))
      .sort((a, b) => b.lastAt - a.lastAt)
  })
  function addMistake(
    module: MistakeModule,
    input: {
      key: string
      title: string
      detail?: string
      hint?: string
    },
  ) {
    const now = Date.now()
    const day = studyDay()
    const id = `${input.key}|${writerId()}`
    const epoch
      = readRecords<{
        epoch: string
      }>('mistake_resets_v2', currentUser.value)[input.key]?.epoch ?? ''
    const old = readRecords<MistakePart>('mistake_parts_v2', currentUser.value)[
      id
    ]
    const previous = old?.epoch === epoch ? old : undefined
    const days = { ...previous?.days, [day]: (previous?.days[day] ?? 0) + 1 }
    const cutoff = now - 90 * 86400000
    for (const d of Object.keys(days)) {
      if (dateTime(d) < cutoff)
        delete days[d]
    }

    parts.set(id, {
      key: input.key,
      title: input.title,
      detail: input.detail || previous?.detail || '',
      hint: input.hint || previous?.hint,
      module,
      count: (previous?.count ?? 0) + 1,
      firstAt: previous?.firstAt ?? now,
      lastAt: now,
      epoch,
      days,
    })
  }
  function decrementMistake(key: string, date = studyDay()) {
    const id = `${key}|${writerId()}`
    const old = readRecords<MistakePart>('mistake_parts_v2', currentUser.value)[
      id
    ]
    if (
      !old
      || old.epoch !== (resets.state.value[key]?.epoch ?? '')
      || old.count <= 0
    )
      return
    parts.set(id, {
      ...old,
      count: Math.max(0, old.count - 1),
      days: { ...old.days, [date]: Math.max(0, (old.days[date] ?? 0) - 1) },
    })
  }
  // 179 练习的持久守卫：页面会话内的 checked 刷新即重建，改以错题本自身为准。
  // 只看当前作者分片（与 decrementMistake 的扣减口径一致），且 epoch 须与当前
  // 重置纪元一致，否则该条目已被清空，不应再视为未消除的记错。failureDate 取
  // 仍有计数的最近一日，供纠正时扣回原失败日桶，避免扣到当日的空桶。
  function mistakeOutstanding(key: string): {
    outstanding: boolean
    failureDate: string | null
  } {
    const id = `${key}|${writerId()}`
    const part = readRecords<MistakePart>('mistake_parts_v2', currentUser.value)[
      id
    ]
    if (
      !part
      || part.epoch !== (resets.state.value[key]?.epoch ?? '')
      || part.count <= 0
    )
      return { outstanding: false, failureDate: null }
    let failureDate: string | null = null
    for (const [day, count] of Object.entries(part.days ?? {})) {
      if (
        count > 0
        && (failureDate === null || dateTime(day) > dateTime(failureDate))
      )
        failureDate = day
    }
    return { outstanding: true, failureDate }
  }
  function removeMistake(key: string) {
    resets.set(key, { epoch: crypto.randomUUID() })
  }
  function clearMistakes(module?: MistakeModule) {
    batchStorage(() => {
      for (const item of mistakes.value) {
        if (!module || item.module === module)
          removeMistake(item.key)
      }
    })
  }
  const totalCount = computed(() => mistakes.value.length)
  const countByModule = computed(
    () =>
      Object.fromEntries(
        Object.keys(MISTAKE_MODULE_LABEL).map(module => [
          module,
          mistakes.value.filter(x => x.module === module).length,
        ]),
      ) as Record<MistakeModule, number>,
  )
  const grouped = computed(() =>
    (Object.keys(MISTAKE_MODULE_LABEL) as MistakeModule[])
      .map(module => ({
        module,
        label: MISTAKE_MODULE_LABEL[module],
        items: mistakes.value.filter(m => m.module === module),
      }))
      .filter(g => g.items.length),
  )
  return {
    mistakes,
    addMistake,
    decrementMistake,
    mistakeOutstanding,
    removeMistake,
    clearMistakes,
    totalCount,
    countByModule,
    grouped,
    reload: parts.reload,
  }
})
export const useProgress = createGlobalState(() => {
  const store = useRecordMap<ModuleProgress>('progress_v1')
  function setProgress(
    module: ProgressModule | `flashcard:${string}`,
    done: number,
    total: number,
  ) {
    store.set(module, { done, total, updatedAt: Date.now() })
  }
  const getProgress = (module: ProgressModule) =>
    store.state.value[module] || { done: 0, total: 0, updatedAt: 0 }
  const chapterModules = computed(() =>
    Object.entries(store.state.value)
      .filter(([key]) => key.startsWith('flashcard:'))
      .map(([module, value]) => ({
        module,
        label: `单词自测 · ${module.slice(10)}（该章最近一轮）`,
        ...value,
      })),
  )
  const modules = computed(() => [
    ...(Object.keys(PROGRESS_MODULE_LABEL) as ProgressModule[])
      .filter(
        module => module !== 'flashcard' || chapterModules.value.length === 0,
      )
      .map(module => ({
        module,
        label: PROGRESS_MODULE_LABEL[module],
        ...getProgress(module),
      })),
    ...chapterModules.value,
  ])
  return {
    progress: store.state,
    setProgress,
    clearChapterProgress() {
      for (const key of Object.keys(store.state.value)) {
        if (key.startsWith('flashcard:'))
          store.set(key, undefined)
      }
    },
    getProgress,
    modules,
    hasAnyProgress: computed(() => Object.keys(store.state.value).length > 0),
    reload: store.reload,
  }
})
export function useMastered(base: string) {
  const store = useRecordMap<boolean>(base)
  const mastered = computed(() =>
    Object.keys(store.state.value).filter(id => store.state.value[id]),
  )
  const isMastered = (id: string | number) =>
    mastered.value.includes(String(id))
  const toggleMastered = (id: string | number) =>
    store.set(id, isMastered(id) ? undefined : true)
  return {
    mastered,
    isMastered,
    toggleMastered,
    masteredCount: computed(() => mastered.value.length),
  }
}
export function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

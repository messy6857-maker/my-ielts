import { computed, watch } from 'vue'
import vocabularyCounts from '../utils/vocabularyCounts.json'
import { dateTime } from '../utils/legacyMerge'
import {
  accountKey,
  batchStorage,
  deletionEnvelope,
  entryKey,
  readRecord,
  readRecords,
  readValue,
  saveEnvelope,
  writerId,
} from '../utils/storage'
import { useAuth } from './useAuth'
import { useRecordMap } from './useRecordData'

export type MistakeModule =
  | 'vocabulary'
  | 'flashcard'
  | 'typing'
  | 'listening'
  | 'reading'
  | 'corpus'
export type ProgressModule =
  | `spelling:${string}`
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
  legacySource?: boolean
  failureDays?: number
}
export interface ModuleProgress {
  done: number
  total: number
  updatedAt: number
}
export const MISTAKE_MODULE_LABEL: Record<MistakeModule, string> = {
  vocabulary: '词汇拼写',
  flashcard: '单词自测',
  typing: '打字练习',
  listening: '听力 179',
  reading: '阅读 376',
  corpus: '听力语料库',
}
export const PROGRESS_MODULE_LABEL: Record<
  Exclude<ProgressModule, `spelling:${string}`>,
  string
> = {
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
function canonicalMistakeKey(key: string) {
  return key.replace(/^vocabulary:/, 'spelling:')
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
    for (const rawPart of Object.values(parts.state.value)) {
      const part = rawPart && {
        ...rawPart,
        key: canonicalMistakeKey(rawPart.key),
        legacySource:
          rawPart.key.startsWith('vocabulary:') || !!rawPart.legacySource,
        detail: rawPart.key.startsWith('vocabulary:')
          ? `${rawPart.detail}（含旧版词汇记录，原活动未区分）`
          : rawPart.detail,
      }
      if (
        !part
        || part.count <= 0
        || part.epoch
          !== (resets.state.value[part.key]?.epoch
            ?? resets.state.value[rawPart.key]?.epoch
            ?? '')
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
        legacySource: !!previous?.legacySource || !!part.legacySource,
        firstAt: Math.min(previous?.firstAt ?? part.firstAt, part.firstAt),
        lastAt: Math.max(previous?.lastAt ?? 0, part.lastAt),
        dates,
      })
    }
    return [...result.values()]
      .map(({ dates, ...item }) => ({
        ...item,
        detail:
          item.legacySource && !item.detail.includes('旧版')
            ? `${item.detail}（含旧版词汇记录，原活动未区分）`
            : item.detail,
        failureDays: dates.size,
      }))
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
      = readRecord<{ epoch: string }>(
        'mistake_resets_v2',
        input.key,
        currentUser.value,
      )?.epoch ?? ''
    const old = readRecord<MistakePart>(
      'mistake_parts_v2',
      id,
      currentUser.value,
    )
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
  // 撤销本机评分只扣当前作者；179 纠错显式使用 all，消除跨设备的未解决失败。
  // 指定日期时优先扣原失败日，不触碰其他作者的本机撤销记录。
  function decrementMistake(
    key: string,
    date?: string,
    scope: 'own' | 'all' = 'own',
  ) {
    const epoch = resets.state.value[key]?.epoch ?? ''
    const records = readRecords<MistakePart>(
      'mistake_parts_v2',
      currentUser.value,
    )
    const candidates = Object.entries(records)
      .filter(
        ([id, part]) =>
          !!part
          && canonicalMistakeKey(part.key) === key
          && part.epoch === epoch
          && part.count > 0
          && (scope === 'all' || id.endsWith(`|${writerId()}`)),
      )
      .sort((a, b) => b[1].lastAt - a[1].lastAt)
    if (candidates.length === 0)
      return
    let targetId: string
    let targetDay: string | undefined
    if (date !== undefined) {
      const withDay = candidates.find(
        ([, part]) => (part.days?.[date] ?? 0) > 0,
      )
      targetId = (withDay ?? candidates[0])[0]
      targetDay = date
    }
    else {
      let bestDay: string | null = null
      let bestId = candidates[0][0]
      for (const [id, part] of candidates) {
        for (const [day, count] of Object.entries(part.days ?? {})) {
          if (
            count > 0
            && (bestDay === null || dateTime(day) > dateTime(bestDay))
          ) {
            bestDay = day
            bestId = id
          }
        }
      }
      targetId = bestId
      targetDay = bestDay ?? undefined
    }
    const old = records[targetId]
    if (!old)
      return
    parts.set(targetId, {
      ...old,
      count: Math.max(0, old.count - 1),
      days:
        targetDay === undefined
          ? old.days
          : {
              ...old.days,
              [targetDay]: Math.max(0, (old.days[targetDay] ?? 0) - 1),
            },
    })
  }
  // 179 练习的持久守卫：页面会话内的 checked 刷新即重建，改以错题本自身为准。
  // 扫描全设备分片，并匹配当前重置纪元；已清空的记录不算未解决失败。failureDate 取
  // 仍有计数的最近一日，供纠正时扣回原失败日桶，避免扣到当日的空桶。
  function mistakeOutstanding(key: string): {
    outstanding: boolean
    failureDate: string | null
  } {
    const epoch = resets.state.value[key]?.epoch ?? ''
    const candidates = Object.values(
      readRecords<MistakePart>('mistake_parts_v2', currentUser.value),
    ).filter(p => p.key === key && p.epoch === epoch && p.count > 0)
    if (!candidates.length)
      return { outstanding: false, failureDate: null }
    let failureDate: string | null = null
    for (const part of candidates) {
      for (const [day, count] of Object.entries(part.days ?? {})) {
        if (
          count > 0
          && (failureDate === null || dateTime(day) > dateTime(failureDate))
        )
          failureDate = day
      }
    }
    return { outstanding: true, failureDate }
  }
  function patchMistakeHint(key: string, hint: string) {
    const id = `${key}|${writerId()}`
    const old = readRecord<MistakePart>(
      'mistake_parts_v2',
      id,
      currentUser.value,
    )
    if (
      old
      && old.count > 0
      && (!old.hint || old.hint.startsWith(`${old.title}: `))
      && old.epoch === (resets.state.value[key]?.epoch ?? '')
    )
      parts.set(id, { ...old, hint })
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
    patchMistakeHint,
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
  const spelling = useRecordMap<any>('vocabulary_spell_v2')
  const progress = computed(() => {
    const out = { ...store.state.value }
    const grouped = new Map<string, Set<string>>()
    const add = (chapter: string, id: string, value: any) => {
      if (typeof value === 'string' ? value.trim() : value?.text?.trim()) {
        if (!grouped.has(chapter))
          grouped.set(chapter, new Set())
        grouped.get(chapter)!.add(id)
      }
    }
    const old = readValue<Record<string, Record<string, string>>>(
      nsKey('vocabulary_spell_v1'),
      {},
    )
    for (const [chapter, words] of Object.entries(old || {})) {
      for (const [id, value] of Object.entries(words || {})) {
        const key = entryKey(
          'vocabulary_spell_v2',
          `${chapter}|${id}`,
          useAuth().currentUser.value,
        )
        if (
          !localStorage.getItem(key)
          && !deletionEnvelope(key, useAuth().currentUser.value)
        )
          add(chapter, id, value)
      }
    }
    for (const [key, value] of Object.entries(spelling.state.value)) {
      const split = key.lastIndexOf('|')
      add(key.slice(0, split), key.slice(split + 1), value)
    }
    for (const [chapter, ids] of grouped) {
      const key = `spelling:${chapter}`
      if (!out[key]) {
        out[key] = {
          done: ids.size,
          total:
            (vocabularyCounts as Record<string, number>)[chapter] || ids.size,
          updatedAt: 0,
        }
      }
    }
    return out
  })
  function setProgress(
    module: ProgressModule | `flashcard:${string}`,
    done: number,
    total: number,
  ) {
    store.set(module, { done, total, updatedAt: Date.now() })
  }
  const getProgress = (module: ProgressModule) =>
    progress.value[module] || { done: 0, total: 0, updatedAt: 0 }
  const chapterModules = computed(() =>
    Object.entries(progress.value)
      .filter(
        ([key]) => key.startsWith('flashcard:') || key.startsWith('spelling:'),
      )
      .map(([module, value]) => ({
        module,
        label: module.startsWith('spelling:')
          ? `词汇拼写 · ${module.slice(9)}`
          : `单词自测 · ${module.slice(10)}（该章最近一轮）`,
        ...value,
      })),
  )
  const modules = computed(() => [
    ...(Object.keys(PROGRESS_MODULE_LABEL) as ProgressModule[])
      .filter(
        module =>
          (module !== 'flashcard'
            || !chapterModules.value.some(row =>
              row.module.startsWith('flashcard:'),
            ))
          && (module !== 'vocabulary'
            || !chapterModules.value.some(row =>
              row.module.startsWith('spelling:'),
            )),
      )
      .map(module => ({
        module,
        label:
          (PROGRESS_MODULE_LABEL as Record<string, string>)[module]
          ?? (module.startsWith('spelling:')
            ? `词汇拼写 · ${module.slice(9)}`
            : module),
        ...getProgress(module),
      })),
    ...chapterModules.value,
  ])
  return {
    progress,
    setProgress,
    clearChapterProgress() {
      for (const key of Object.keys(store.state.value)) {
        if (key.startsWith('flashcard:'))
          store.set(key, undefined)
      }
    },
    getProgress,
    modules,
    hasAnyProgress: computed(() => Object.keys(progress.value).length > 0),
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

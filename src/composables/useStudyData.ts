// 学习进度 + 错词本：统一的 localStorage 数据层
// 数据按账号隔离：未登录用 myielts_ 前缀（游客模式），
// 登录后用 myielts_u_<用户名>_ 前缀，每个账号一套独立数据

import { readJson, useAuth, writeJson } from './useAuth'

export type MistakeModule = 'vocabulary' | 'typing' | 'listening' | 'reading'
export type ProgressModule = 'vocabulary' | 'flashcard' | 'typing' | 'listening' | 'reading' | 'writing' | 'listening_flashcard' | 'reading_flashcard'

export interface MistakeItem {
  key: string // 全站唯一，如 `vocabulary:123`
  module: MistakeModule
  title: string // 单词本身
  detail: string // 词性 + 释义
  hint?: string // 例句等提示
  count: number // 累计记错次数
  firstAt: number
  lastAt: number
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
  reading: '阅读 538',
}

export const PROGRESS_MODULE_LABEL: Record<ProgressModule, string> = {
  vocabulary: '词汇拼写',
  flashcard: '单词自测',
  typing: '打字练习',
  listening: '听力',
  reading: '阅读',
  writing: '写作',
  listening_flashcard: '听力自测',
  reading_flashcard: '阅读自测',
}

// 按当前账号拼出实际存储 key
export function nsKey(base: string): string {
  const { currentUser } = useAuth()
  const user = currentUser.value
  return user ? `myielts_u_${user}_${base}` : `myielts_${base}`
}

// 用全局单例，保证导航栏徽标和各页面看到的是同一份响应式数据
export const useMistakes = createGlobalState(() => {
  const { currentUser } = useAuth()
  const mistakes = ref<MistakeItem[]>([])

  function load() {
    mistakes.value = readJson<MistakeItem[]>(nsKey('mistakes_v1'), [])
  }
  load()

  // 切换账号时重新加载该账号的数据
  watch(currentUser, load)
  watch(mistakes, v => writeJson(nsKey('mistakes_v1'), v), { deep: true })

  function addMistake(module: MistakeModule, input: { key: string, title: string, detail?: string, hint?: string }) {
    const now = Date.now()
    const exist = mistakes.value.find(m => m.key === input.key)
    if (exist) {
      exist.count += 1
      exist.lastAt = now
      if (input.detail)
        exist.detail = input.detail
      if (input.hint)
        exist.hint = input.hint
    }
    else {
      mistakes.value.unshift({
        key: input.key,
        module,
        title: input.title,
        detail: input.detail || '',
        hint: input.hint,
        count: 1,
        firstAt: now,
        lastAt: now,
      })
    }
  }

  function removeMistake(key: string) {
    mistakes.value = mistakes.value.filter(m => m.key !== key)
  }

  function clearMistakes(module?: MistakeModule) {
    mistakes.value = module ? mistakes.value.filter(m => m.module !== module) : []
  }

  const totalCount = computed(() => mistakes.value.length)

  const countByModule = computed(() => {
    const map = {} as Record<MistakeModule, number>
    for (const m of mistakes.value)
      map[m.module] = (map[m.module] || 0) + 1
    return map
  })

  const grouped = computed(() => {
    return (Object.keys(MISTAKE_MODULE_LABEL) as MistakeModule[])
      .map(module => ({
        module,
        label: MISTAKE_MODULE_LABEL[module],
        items: mistakes.value.filter(m => m.module === module),
      }))
      .filter(g => g.items.length > 0)
  })

  return { mistakes, addMistake, removeMistake, clearMistakes, totalCount, countByModule, grouped }
})

export const useProgress = createGlobalState(() => {
  const { currentUser } = useAuth()
  const progress = ref<Record<string, ModuleProgress>>({})

  function load() {
    progress.value = readJson<Record<string, ModuleProgress>>(nsKey('progress_v1'), {})
  }
  load()

  watch(currentUser, load)
  watch(progress, v => writeJson(nsKey('progress_v1'), v), { deep: true })

  function setProgress(module: ProgressModule, done: number, total: number) {
    progress.value[module] = { done, total, updatedAt: Date.now() }
  }

  function getProgress(module: ProgressModule): ModuleProgress {
    return progress.value[module] || { done: 0, total: 0, updatedAt: 0 }
  }

  const modules = computed(() => {
    return (Object.keys(PROGRESS_MODULE_LABEL) as ProgressModule[]).map(module => ({
      module,
      label: PROGRESS_MODULE_LABEL[module],
      ...getProgress(module),
    }))
  })

  const hasAnyProgress = computed(() => Object.keys(progress.value).length > 0)

  return { progress, setProgress, getProgress, modules, hasAnyProgress }
})

// 通用“已掌握”标记（如写作 100 句、阅读 538 词），按账号隔离
export function useMastered(base: string) {
  const { currentUser } = useAuth()
  const mastered = ref<string[]>([])

  function load() {
    mastered.value = readJson<string[]>(nsKey(base), [])
  }
  load()

  watch(currentUser, load)
  watch(mastered, v => writeJson(nsKey(base), v))

  function isMastered(id: string | number) {
    return mastered.value.includes(String(id))
  }

  function toggleMastered(id: string | number) {
    const key = String(id)
    if (isMastered(key))
      mastered.value = mastered.value.filter(v => v !== key)
    else
      mastered.value = [...mastered.value, key]
  }

  const masteredCount = computed(() => mastered.value.length)

  return { mastered, isMastered, toggleMastered, masteredCount }
}

export function formatDate(ts: number) {
  const d = new Date(ts)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

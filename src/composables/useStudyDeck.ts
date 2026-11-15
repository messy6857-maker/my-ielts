import type { DeckId } from '../utils/studyDeck'
import type { WordSchedule } from './useSpacedRepetition'
import { useDeckStore } from './useDeckStore'
import { useDailyGoal, useWordSchedule } from './useSpacedRepetition'

/**
 * 统一卡片按词库读写原来那份记录：词汇表用 sr_vocabulary_v1（键 vocab:<id>）和词汇每日新词，
 * 其他词库用各自的 <词库>_sr_v1 和每日新词。不迁移、不换键，新旧页面看到的是同一份进度。
 */
export interface StudyDeckStore {
  schedules: () => Record<string, WordSchedule | undefined>
  getSchedule: (id: string | number) => WordSchedule | undefined
  setSchedule: (id: string | number, value: WordSchedule) => void
  removeSchedule: (id: string | number) => void
  clear: () => void
  goal: () => number
  dailyCount: () => number
  remaining: () => number
  setGoal: (n: number) => void
  recordNewWord: (id: string | number) => string
  decrementNewWord: (id: string | number, date?: string) => void
  resetDaily: () => void
}

export function useStudyDeck(deck: DeckId): StudyDeckStore {
  if (deck === 'vocabulary') {
    const schedule = useWordSchedule()
    const daily = useDailyGoal()
    return {
      schedules: () => schedule.schedules.value,
      getSchedule: schedule.get,
      setSchedule: schedule.set,
      removeSchedule: schedule.remove,
      clear: schedule.clear,
      goal: () => daily.goal.value,
      dailyCount: () => daily.dailyCount.value,
      remaining: () => daily.remaining.value,
      setGoal: daily.setGoal,
      recordNewWord: daily.recordNewWord,
      decrementNewWord: daily.decrementNewWord,
      resetDaily: daily.resetDaily,
    }
  }
  const store = useDeckStore(deck)
  return {
    schedules: () => store.schedules.value,
    getSchedule: store.getSchedule,
    setSchedule: store.setSchedule,
    removeSchedule: store.removeSchedule,
    clear: store.clear,
    goal: () => store.goal.value,
    dailyCount: () => store.dailyCount.value,
    remaining: () => store.remaining.value,
    setGoal: store.setGoal,
    recordNewWord: store.recordNewWord,
    decrementNewWord: store.decrementNewWord,
    resetDaily: store.resetDaily,
  }
}

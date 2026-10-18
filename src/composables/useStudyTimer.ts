// 学习计时：进入自测卡片自动开始，退出时结算
// 每日累计按账号隔离，目标每天 2 小时
import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey } from './useStudyData'

export const DAILY_STUDY_GOAL = 2 * 3600 // 秒：每天 2 小时

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  if (sec < 60)
    return `${sec} 秒`
  const m = Math.floor(sec / 60)
  if (m < 60)
    return `${m} 分钟`
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`
}

export function formatClock(sec: number): string {
  sec = Math.max(0, Math.floor(sec))
  const m = Math.floor(sec / 60)
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

export function useStudyTimer() {
  const { currentUser } = useAuth()
  const KEY = 'study_time_v1'
  const dailySeconds = ref(0)
  const elapsed = ref(0) // 本次会话秒数（实时跳动）
  const running = ref(false)
  let startAt = 0
  let tickId = 0
  let hideHandler: (() => void) | null = null

  function load() {
    const rec = readJson<{ date: string, seconds: number }>(nsKey(KEY), { date: '', seconds: 0 })
    dailySeconds.value = rec.date === todayStr() ? rec.seconds : 0
  }

  function persist() {
    writeJson(nsKey(KEY), { date: todayStr(), seconds: dailySeconds.value })
  }

  function start() {
    if (running.value)
      return
    load()
    startAt = Date.now()
    elapsed.value = 0
    running.value = true
    tickId = window.setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startAt) / 1000)
    }, 1000)
    hideHandler = () => pause()
    window.addEventListener('pagehide', hideHandler)
  }

  /** 暂停并结算：本次时长计入今日累计，返回本次秒数 */
  function pause(): number {
    if (!running.value)
      return 0
    const sec = Math.floor((Date.now() - startAt) / 1000)
    running.value = false
    window.clearInterval(tickId)
    if (hideHandler) {
      window.removeEventListener('pagehide', hideHandler)
      hideHandler = null
    }
    if (sec > 0) {
      dailySeconds.value += sec
      persist()
    }
    elapsed.value = 0
    return sec
  }

  function resume() {
    start()
  }

  watch(currentUser, load)
  onUnmounted(() => pause())

  return {
    dailySeconds,
    elapsed,
    running,
    dailyGoal: DAILY_STUDY_GOAL,
    start,
    pause,
    resume,
  }
}

// 学习计时：进入自测卡片自动开始，退出时结算
// 每日累计按账号隔离，目标每天 2 小时
import { studyPrefix, writeStudyBatch } from '../utils/studyStorage'
import { nextStudyDay, studyDate } from '../utils/studyDate'
import { notifyLocalWrite, onBeforeLogout, readJson, useAuth } from './useAuth'

export const DAILY_STUDY_GOAL = 2 * 3600 // 秒：每天 2 小时

// 多设备同步场景下，云端按整 key 覆盖，单 key 累计会丢失其他设备的时长。
// 因此计时按「每设备一个 key」累计，展示时把各设备今日秒数求和。
const DEVICE_ID_KEY = 'myielts_device_id'

type IdStorage = Pick<Storage, 'getItem' | 'setItem'>

/** 本设备唯一标识：首次生成后存在非账号隔离的 localStorage，各设备互不相同 */
export function getDeviceId(storage?: IdStorage): string {
  const s: IdStorage | undefined = storage
    ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  let id = s?.getItem(DEVICE_ID_KEY) ?? ''
  if (!id) {
    id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e12).toString(36)}`
    try {
      s?.setItem(DEVICE_ID_KEY, id)
    }
    catch {
      // 配额不足等情况静默失败
    }
  }
  return id
}

/** 某设备的计时 key：myielts_u_<用户>_study_time_v1_<deviceId>，前缀扫描会自动同步 */
export function deviceTimerKey(baseKey: string, deviceId: string): string {
  return `${baseKey}_${deviceId}`
}

/** 对多条设备计时记录按日期求和（非今日/负数不计） */
export function sumDeviceTimerRecords(records: Array<{ date: string; seconds: number }>, date: string): number {
  return records.reduce((sum, r) => sum + (r.date === date ? Math.max(0, Math.round(r.seconds) || 0) : 0), 0)
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
  let ownSeconds = 0 // 本设备今日累计（不含其他设备），写入本设备 key
  let owner = currentUser.value
  const deviceId = getDeviceId()
  let recordDate = studyDate()
  let settledAt = 0
  let legacyPending = false

  function baseKey(): string {
    return `${studyPrefix(owner)}${KEY}`
  }

  function ownKey(): string {
    return deviceTimerKey(baseKey(), deviceId)
  }

  function load(date = studyDate()) {
    const base = baseKey()
    recordDate = date
    const me = ownKey()
    legacyPending = false
    let legacySeconds = 0
    // Write the replacement and remove the original as one rollback-safe batch.
    try {
      const raw = localStorage.getItem(base)
      if (raw !== null) {
        const rec = readJson<{ date: string; seconds: number }>(base, { date: '', seconds: 0 }, KEY)
        const oldOwn = readJson<{ date: string; seconds: number }>(me, { date: '', seconds: 0 }, KEY)
        legacySeconds = rec.date === date ? rec.seconds : 0
        const merged = (oldOwn.date === date ? oldOwn.seconds : 0) + legacySeconds
        legacyPending = true
        writeStudyBatch([[me, JSON.stringify({ date, seconds: merged })]], [base])
        legacyPending = false
        legacySeconds = 0
        notifyLocalWrite()
      }
    }
    catch {
      // 忽略
    }
    // 第二步：汇总所有设备 key 的今日秒数
    let own = 0
    let others = 0
    try {
      const prefix = `${base}_`
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !k.startsWith(prefix))
          continue
        const rec = readJson<{ date: string; seconds: number }>(k, { date: '', seconds: 0 }, KEY)
        const sec = rec.date === date ? rec.seconds : 0
        if (k === me)
          own = sec
        else others += sec
      }
    }
    catch {
      // 忽略
    }
    ownSeconds = own + legacySeconds
    dailySeconds.value = ownSeconds + others
  }

  function persist() {
    // 只写本设备自己的累计，不把求和后的总数写回，避免其他设备重复计算
    try {
      writeStudyBatch([[ownKey(), JSON.stringify({ date: recordDate, seconds: ownSeconds })]], legacyPending ? [baseKey()] : [])
      legacyPending = false
      notifyLocalWrite()
    }
    catch {
      // Retain the original legacy record if storage is full.
    }
  }

  function settleUntil(now: number) {
    // Split by local midnight (including DST), without re-labelling old totals.
    while (settledAt < now) {
      const boundary = Math.min(now, nextStudyDay(settledAt))
      const seconds = Math.max(0, Math.floor((boundary - settledAt) / 1000))
      ownSeconds += seconds
      dailySeconds.value += seconds
      settledAt = boundary
      if (studyDate(boundary) !== recordDate) {
        persist()
        load(studyDate(boundary))
      }
    }
  }

  function start() {
    if (running.value)
      return
    owner = currentUser.value
    load()
    startAt = Date.now()
    settledAt = startAt
    elapsed.value = 0
    running.value = true
    tickId = window.setInterval(() => {
      const now = Date.now()
      if (studyDate(now) !== recordDate) {
        settleUntil(now)
        persist()
      }
      elapsed.value = Math.max(0, Math.floor((now - startAt) / 1000))
    }, 1000)
    hideHandler = () => pause()
    window.addEventListener('pagehide', hideHandler)
  }

  /** 暂停并结算：本次时长计入今日累计，返回本次秒数 */
  function pause(): number {
    if (!running.value)
      return 0
    const now = Date.now()
    const sec = Math.max(0, Math.floor((now - startAt) / 1000))
    running.value = false
    window.clearInterval(tickId)
    if (hideHandler) {
      window.removeEventListener('pagehide', hideHandler)
      hideHandler = null
    }
    if (sec > 0) {
      settleUntil(now)
      persist()
    }
    elapsed.value = 0
    return sec
  }

  function resume() {
    start()
  }

  watch(currentUser, () => {
    pause()
    owner = currentUser.value
    load()
  }, { flush: 'sync' })
  const removeLogoutListener = onBeforeLogout(() => pause())
  onUnmounted(() => {
    pause()
    removeLogoutListener()
  })

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

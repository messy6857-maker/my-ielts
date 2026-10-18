// 学习计时：进入自测卡片自动开始，退出时结算
// 每日累计按账号隔离，目标每天 2 小时
import { readJson, useAuth, writeJson } from './useAuth'
import { nsKey } from './useStudyData'

export const DAILY_STUDY_GOAL = 2 * 3600 // 秒：每天 2 小时

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

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
export function sumDeviceTimerRecords(records: Array<{ date: string, seconds: number }>, date: string): number {
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

  function ownKey(): string {
    return deviceTimerKey(nsKey(KEY), getDeviceId())
  }

  function load() {
    const base = nsKey(KEY)
    const today = todayStr()
    const me = ownKey()
    // 第一步：一次性迁移旧的单 key 数据，并入本设备 key
    try {
      const raw = localStorage.getItem(base)
      if (raw !== null) {
        const rec = readJson<{ date: string, seconds: number }>(base, { date: '', seconds: 0 })
        const oldOwn = readJson<{ date: string, seconds: number }>(me, { date: '', seconds: 0 })
        const merged = (oldOwn.date === today ? oldOwn.seconds : 0)
          + (rec.date === today ? rec.seconds : 0)
        writeJson(me, { date: today, seconds: merged })
        localStorage.removeItem(base)
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
        const rec = readJson<{ date: string, seconds: number }>(k, { date: '', seconds: 0 })
        const sec = rec.date === today ? Math.max(0, Math.round(rec.seconds) || 0) : 0
        if (k === me)
          own = sec
        else others += sec
      }
    }
    catch {
      // 忽略
    }
    ownSeconds = own
    dailySeconds.value = own + others
  }

  function persist() {
    // 只写本设备自己的累计，不把求和后的总数写回，避免其他设备重复计算
    writeJson(ownKey(), { date: todayStr(), seconds: ownSeconds })
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
      ownSeconds += sec
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

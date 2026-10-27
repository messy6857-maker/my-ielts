import { getCurrentInstance, onUnmounted, ref, watch } from 'vue'
import {
  entryKey,
  readRecords,
  readValue,
  saveEnvelope,
  saveRecord,
  studyBaseOf,
} from '../utils/storage'
import { onBeforeLogout, useAuth } from './useAuth'
import { nsKey, studyDay } from './useStudyData'

export const DAILY_STUDY_GOAL = 2 * 3600
const DEVICE_ID_KEY = 'myielts_device_id'
type IdStorage = Pick<Storage, 'getItem' | 'setItem'>
export function getDeviceId(storage?: IdStorage) {
  const target = storage ?? localStorage
  let id = ''
  try {
    id = target.getItem(DEVICE_ID_KEY) ?? ''
  }
  catch {
    /* A transient storage failure must not stop a session. */
  }
  if (!id) {
    id = crypto.randomUUID()
    try {
      target.setItem(DEVICE_ID_KEY, id)
    }
    catch {
      /* Retain this in the session record. */
    }
  }
  return id
}
export function deviceTimerKey(base: string, device: string) {
  return `${base}_${device}`
}
export function sumDeviceTimerRecords(
  records: Array<{
    date: string
    seconds: number
  }>,
  date: string,
) {
  return records.reduce(
    (n, r) =>
      n + (r.date === date ? Math.max(0, Math.round(r.seconds) || 0) : 0),
    0,
  )
}
export function formatDuration(sec: number) {
  sec = Math.max(0, Math.round(sec))
  return sec < 60
    ? `${sec} 秒`
    : sec < 3600
      ? `${Math.floor(sec / 60)} 分钟`
      : `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分钟`
}
export function formatClock(sec: number) {
  sec = Math.max(0, Math.floor(sec))
  return `${`${Math.floor(sec / 60)}`.padStart(2, '0')}:${`${sec % 60}`.padStart(2, '0')}`
}
interface TimerSegment {
  date: string
  device: string
  start?: number
  end?: number
  legacySeconds?: number
}
/** The old single counter was folded into a device counter before its deletion. */
export function legacyTimerSeconds(
  parts: TimerSegment[],
  base: string,
  date: string,
) {
  const single = parts
    .filter(p => p.date === date && p.device === base)
    .reduce((n, p) => Math.max(n, p.legacySeconds ?? 0), 0)
  const devices = parts
    .filter(p => p.date === date && p.device !== base)
    .reduce((n, p) => n + Math.max(0, p.legacySeconds ?? 0), 0)
  // Original counters remain available in exports; the untraceable overlap is not counted twice.
  return Math.max(single, devices)
}
export function useStudyTimer() {
  const { currentUser } = useAuth()
  const dailySeconds = ref(0)
  const elapsed = ref(0)
  const running = ref(false)
  const device = getDeviceId()
  let owner: string | null = null
  let startAt = 0
  let session = ''
  let autoPaused = false
  let interval: ReturnType<typeof setInterval> | undefined
  let ticks = 0
  function migrate(user: string | null) {
    const base = nsKey('study_time_v1', user)
    for (const oldKey of Object.keys(localStorage).filter((k) => {
      const timerBase = studyBaseOf(k, user)
      return (
        k === base
        || (!!timerBase && /^study_time_v1_[a-z\d-]+$/i.test(timerBase))
      )
    })) {
      const old = readValue<{
        date: string
        seconds: number
      } | null>(oldKey, null)
      if (!old || !old.date || !Number.isFinite(old.seconds))
        continue
      const key = entryKey(
        'timer_sessions_v2',
        `legacy:${oldKey}:${old.date}`,
        user,
      )
      if (localStorage.getItem(key) === null) {
        saveEnvelope(
          key,
          {
            __ielts: 2,
            stamp: [0, 'legacy'],
            value: {
              date: old.date,
              device: oldKey,
              legacySeconds: old.seconds,
            },
          },
          'remote',
        )
      }
    }
  }
  function load(user = currentUser.value) {
    migrate(user)
    const date = studyDay()
    const groups = new Map<string, TimerSegment[]>()
    const parts = Object.values(
      readRecords<TimerSegment>('timer_sessions_v2', user),
    )
    let total = legacyTimerSeconds(parts, nsKey('study_time_v1', user), date)
    for (const part of parts) {
      if (part.date !== date)
        continue
      if (part.start !== undefined && part.end !== undefined)
        groups.set(part.device, [...(groups.get(part.device) ?? []), part])
    }
    for (const parts of groups.values()) {
      parts.sort((a, b) => a.start! - b.start!)
      let start = 0
      let end = 0
      for (const part of parts) {
        if (part.start! <= end) {
          end = Math.max(end, part.end!)
        }
        else {
          total += Math.floor((end - start) / 1000)
          start = part.start!
          end = part.end!
        }
      }
      total += Math.floor((end - start) / 1000)
    }
    dailySeconds.value = total
  }
  function persist(end = Date.now()) {
    let cursor = startAt
    while (cursor < end) {
      const date = studyDay(new Date(cursor))
      const next = new Date(cursor)
      next.setHours(24, 0, 0, 0)
      const segmentEnd = Math.min(end, next.getTime())
      saveRecord(
        'timer_sessions_v2',
        `${session}:${date}`,
        { date, device, start: cursor, end: segmentEnd },
        owner,
      )
      cursor = segmentEnd
    }
    load(owner)
  }
  function start() {
    if (running.value)
      return
    owner = currentUser.value
    load(owner)
    if (document.visibilityState === 'hidden') {
      autoPaused = true
      return
    }
    session = crypto.randomUUID()
    startAt = Date.now()
    elapsed.value = 0
    running.value = true
    ticks = 0
    interval = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startAt) / 1000)
      if (++ticks % 10 === 0)
        persist()
    }, 1000)
  }
  function pause() {
    if (!running.value)
      return 0
    const sec = Math.floor((Date.now() - startAt) / 1000)
    running.value = false
    clearInterval(interval)
    interval = undefined
    if (sec > 0)
      persist()
    elapsed.value = 0
    return sec
  }
  function visibility() {
    if (document.visibilityState === 'hidden' && running.value) {
      pause()
      autoPaused = true
    }
    else if (document.visibilityState === 'visible' && autoPaused) {
      autoPaused = false
      if (owner === currentUser.value)
        start()
    }
  }
  const offLogout = onBeforeLogout(pause)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', pause)
  watch(
    currentUser,
    () => {
      pause()
      autoPaused = false
      load()
    },
    { flush: 'sync' },
  )
  function dispose() {
    pause()
    offLogout()
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pagehide', pause)
  }
  if (getCurrentInstance())
    onUnmounted(dispose)
  return {
    dailySeconds,
    elapsed,
    running,
    dailyGoal: DAILY_STUDY_GOAL,
    start,
    pause,
    resume: start,
    refresh: () => load(),
    dispose,
  }
}

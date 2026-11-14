import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidSpeakingGrade } from '../src/composables/useAISettings'
import { useAuth } from '../src/composables/useAuth'
import { confirmLeaveRecording, isRecorderBusy, useRecorder } from '../src/composables/useRecorder'

function speakingGrade(overrides: Record<string, unknown> = {}) {
  return {
    scores: {
      fluency: 6.0,
      lexical: 6.0,
      grammar: 6.0,
      overall: 6.0,
    },
    comments: { fluency: 'a', lexical: 'b', grammar: 'c' },
    suggestion: 'keep going',
    ...overrides,
  }
}

it('s3: speaking grades must be half-step, consistent, and carry a suggestion', () => {
  expect(isValidSpeakingGrade(speakingGrade())).toBe(true)
  expect(isValidSpeakingGrade(speakingGrade({
    scores: {
      fluency: 6.3,
      lexical: 6.0,
      grammar: 6.0,
      overall: 6.0,
    },
  }))).toBe(false)
  expect(isValidSpeakingGrade(speakingGrade({
    scores: {
      fluency: 5.0,
      lexical: 5.0,
      grammar: 5.0,
      overall: 7.0,
    },
  }))).toBe(false)
  expect(isValidSpeakingGrade(speakingGrade({
    scores: {
      fluency: 6.0,
      lexical: 6.0,
      grammar: 6.0,
      overall: 7.0,
    },
  }))).toBe(false)
  expect(isValidSpeakingGrade(speakingGrade({
    scores: {
      fluency: 6.0,
      lexical: 6.0,
      grammar: 6.0,
      overall: 6.5,
    },
  }))).toBe(true)
  const noSuggestion: Record<string, unknown> = speakingGrade()
  delete noSuggestion.suggestion
  expect(isValidSpeakingGrade(noSuggestion)).toBe(false)
  expect(isValidSpeakingGrade(speakingGrade({ suggestion: '  ' }))).toBe(false)
})

it('s1: Part2 done stage explains missing transcripts and missing playback', () => {
  const src = readFileSync('src/pages/speaking/PartTwoPractice.vue', 'utf8')
  expect(src).toContain('未识别出语音内容')
  expect(src).toContain('当前浏览器不支持语音转写（请用 Chrome/Edge），AI')
  expect(src).toContain('本次没有录音可回放')
})

it('s2: speaking prompt and panel state the fluency-from-text limit', () => {
  expect(readFileSync('src/composables/useAISettings.ts', 'utf8')).toContain('丢弃 um/uh 等填充词')
  expect(readFileSync('src/pages/speaking/AIGradeSpeaking.vue', 'utf8')).toContain('流利度也只按文字稿估算')
})

it('s5: speaking tab falls back to part1 on an invalid stored value', () => {
  const src = readFileSync('src/pages/speaking/index.vue', 'utf8')
  expect(src).toContain('[\'part1\', \'part2\', \'part3\'].includes(tab.value)')
})

it('s6: tab/topic/card guards confirm before discarding a recording', () => {
  const src = readFileSync('src/pages/speaking/index.vue', 'utf8')
  expect(src).toContain('confirmLeaveRecording')
  expect(src).toContain('switchTab')
  expect(src).toContain('leavePractice')
  expect(readFileSync('src/composables/useRecorder.ts', 'utf8')).toContain('export function confirmLeaveRecording')
})

// ---- useRecorder behaviour (FakeRecorder pattern, same as recorderSafety.test.ts) ----
let recordings: any[] = []
let emptyRecordings: any[] = []
class FakeRecorder {
  static isTypeSupported(type: string) {
    return type === 'audio/mp4'
  }

  mimeType = 'audio/mp4'
  ondataavailable: any
  onstop: any
  onerror: any
  constructor(public stream: any, public options: any) {
    recordings.push(this)
  }

  start() {}
  stop() {
    this.ondataavailable?.({
      data: new Blob(['recording']),
    })
    this.onstop?.()
  }
}
class FakeEmptyRecorder {
  static isTypeSupported() {
    return true
  }

  mimeType = 'audio/webm'
  ondataavailable: any
  onstop: any
  onerror: any
  constructor(public stream: any, public options: any) {
    emptyRecordings.push(this)
  }

  start() {}
  stop() {
    this.ondataavailable?.({
      data: new Blob([]),
    })
    this.onstop?.()
  }
}
const sessions: ReturnType<typeof useRecorder>[] = []
function make() {
  const r = useRecorder()
  sessions.push(r)
  return r
}
beforeEach(() => {
  recordings = []
  emptyRecordings = []
  vi.useFakeTimers()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
    },
  })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:recording')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  sessions.splice(0).forEach(s => s.dispose())
  useAuth().currentUser.value = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('s4: an account change clears the previous identity recording and transcript', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [
      {
        stop: vi.fn(),
      },
    ],
  } as any)
  const r = make()
  await r.start()
  r.transcript.value = 'hello world this is a test'
  r.stop()
  expect(r.audioUrl.value).toBe('blob:recording')
  useAuth().currentUser.value = 'bob'
  expect(r.audioUrl.value).toBeNull()
  expect(r.transcript.value).toBe('')
})

it('s6: isRecorderBusy tracks recording and clears after the blob lands', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [
      {
        stop: vi.fn(),
      },
    ],
  } as any)
  const r = make()
  expect(isRecorderBusy()).toBe(false)
  expect(confirmLeaveRecording()).toBe(true)
  await r.start()
  expect(isRecorderBusy()).toBe(true)
  r.stop()
  expect(isRecorderBusy()).toBe(false)
})

it('s7: empty blob claims a retained recording only when one exists', async () => {
  vi.stubGlobal('MediaRecorder', FakeEmptyRecorder)
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [
      {
        stop: vi.fn(),
      },
    ],
  } as any)
  const fresh = make()
  await fresh.start()
  fresh.stop()
  expect(fresh.error.value).toBe('没有收到录音数据，请重试')
  expect(fresh.error.value).not.toContain('原录音已保留')

  const kept = make()
  kept.audioUrl.value = 'blob:previous'
  kept.transcript.value = 'old text'
  await kept.start()
  kept.stop()
  expect(kept.error.value).toContain('原录音已保留')
  expect(kept.audioUrl.value).toBe('blob:previous')
  expect(kept.transcript.value).toBe('old text')
})

it('s7: start failures split by error kind and by previous-recording existence', async () => {
  const rejectWith = (name: string) => {
    const e = new Error('failed')
    e.name = name
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(e)
  }
  const r = make()
  rejectWith('NotFoundError')
  expect(await r.start()).toBe(false)
  expect(r.error.value).toBe('未检测到麦克风设备')
  rejectWith('NotReadableError')
  expect(await r.start()).toBe(false)
  expect(r.error.value).toBe('麦克风正被其他应用占用，请关闭后重试')
  rejectWith('NotAllowedError')
  expect(await r.start()).toBe(false)
  expect(r.error.value).toBe('无法启动麦克风，请检查权限后重试')

  r.audioUrl.value = 'blob:previous'
  rejectWith('NotAllowedError')
  expect(await r.start()).toBe(false)
  expect(r.error.value).toBe('无法启动麦克风，请检查权限后重试；原录音已保留')
  rejectWith('Denied')
  expect(await r.start()).toBe(false)
  expect(r.error.value).toBe('无法启动麦克风，请重试；原录音已保留')
})

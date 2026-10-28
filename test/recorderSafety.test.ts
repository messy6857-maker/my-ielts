import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRecorder } from '../src/composables/useRecorder'

let recordings: any[] = []
class FakeRecorder {
  static isTypeSupported(type: string) {
    return type === 'audio/mp4'
  }

  mimeType = 'audio/mp4'
  ondataavailable: any
  onstop: any
  onerror: any
  constructor(
    public stream: any,
    public options: any,
  ) {
    recordings.push(this)
  }

  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['recording']) })
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
  vi.useFakeTimers()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:recording')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  sessions.splice(0).forEach(s => s.dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('stops a stream granted after the component exits', async () => {
  let grant!: (v: any) => void
  const track = { stop: vi.fn() }
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
  )
  const r = make()
  const pending = r.start()
  r.dispose()
  grant({ getTracks: () => [track] })
  expect(await pending).toBe(false)
  expect(track.stop).toHaveBeenCalled()
  expect(recordings).toHaveLength(0)
})
it('preserves an earlier recording and transcript when rerecording permission fails', async () => {
  const r = make()
  r.audioUrl.value = 'blob:previous'
  r.transcript.value = 'previous text'
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
    new Error('denied'),
  )
  expect(await r.start()).toBe(false)
  expect(r.audioUrl.value).toBe('blob:previous')
  expect(r.transcript.value).toBe('previous text')
  expect(r.error.value).toContain('原录音已保留')
})
it('chooses a browser-supported MIME type and publishes data after stop', async () => {
  const track = { stop: vi.fn() }
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [track],
  } as any)
  const r = make()
  expect(await r.start()).toBe(true)
  expect(recordings[0].options.mimeType).toBe('audio/mp4')
  r.stop()
  expect(r.audioUrl.value).toBe('blob:recording')
  expect(track.stop).toHaveBeenCalled()
})
it('allows only one active recording session across cards', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  } as any)
  const a = make()
  const b = make()
  await a.start()
  await b.start()
  expect(a.isRecording.value).toBe(false)
  expect(b.isRecording.value).toBe(true)
})
it('surfaces transcription errors while retaining the recording', async () => {
  let recognizer: any
  vi.stubGlobal(
    'SpeechRecognition',
    class {
      onerror: any
      start() {
        recognizer = Object.assign(
          Object.create(Object.getPrototypeOf(this)),
          this,
        )
      }

      stop() {}
    },
  )
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  } as any)
  const r = make()
  await r.start()
  recognizer.onerror({ error: 'network' })
  expect(r.error.value).toContain('network')
  expect(r.isRecording.value).toBe(true)
})
it('onend restart 抛错后不进入“健康却永久停摆”：延迟重试仍失败则明确降级', async () => {
  let recognizer: any
  // 具名函数声明（不用 class：start() 内引用闭包实例，不把 this 赋值给外部变量；声明式函数作参数不触发 prefer-arrow-callback）。
  function FakeRecognition() {
    const inst: any = {
      startCount: 0,
      onend: null,
      start() {
        inst.startCount++
        if (inst.startCount > 1)
          throw new Error('recognition not ended')
      },
      stop() {},
    }
    recognizer = inst
    return inst
  }
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  } as any)
  const r = make()
  await r.start()
  expect(recognizer.startCount).toBe(1)
  recognizer.onend()
  expect(r.error.value).toContain('正在重试')
  expect(r.isRecording.value).toBe(true)
  await vi.advanceTimersByTimeAsync(300)
  // 初次 1 + onend 重启 2 + 延迟重试 3；重试仍抛错后 healthy 置 false
  expect(recognizer.startCount).toBe(3)
  expect(r.error.value).toContain('无法自动恢复')
  expect(r.error.value).toContain('停止录音后可重录')
  // 降级后 onend 不再尝试重启：不再假装健康，也不再无声重试
  recognizer.onend()
  expect(recognizer.startCount).toBe(3)
})

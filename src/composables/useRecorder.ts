import { getCurrentInstance, onUnmounted, ref, watch } from 'vue'
import { onBeforeLogout, useAuth } from './useAuth'

let active: {
  stop: () => void
} | null = null
export function useRecorder() {
  const isRecording = ref(false)
  const processing = ref(false)
  const starting = ref(false)
  const audioUrl = ref<string | null>(null)
  const error = ref('')
  const elapsed = ref(0)
  const transcript = ref('')
  const transcriptionSupported = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  )
  let generation = 0
  let disposed = false
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let recognition: any = null
  let timer: ReturnType<typeof setInterval> | undefined
  let startedAt = 0
  function stopRecognition() {
    if (recognition) {
      recognition.onend = null
      try {
        recognition.stop()
      }
      catch {
        /* Already stopped. */
      }
      recognition = null
    }
  }
  const offLogout = onBeforeLogout(stop)
  const offOwner = watch(useAuth().currentUser, stop, { flush: 'sync' })
  const session = { stop: () => stop() }
  function stop() {
    generation++
    starting.value = false
    clearInterval(timer)
    timer = undefined
    stopRecognition()
    if (recorder && isRecording.value) {
      elapsed.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      processing.value = !disposed
      try {
        recorder.stop()
      }
      catch {
        processing.value = false
      }
    }
    isRecording.value = false
    stream?.getTracks().forEach(t => t.stop())
    stream = null
    if (active === session)
      active = null
  }
  async function start(): Promise<boolean> {
    if (disposed || starting.value)
      return false
    if (isRecording.value)
      return true
    active?.stop()
    active = session
    const sequence = ++generation
    error.value = ''
    starting.value = true
    let acquired: MediaStream | null = null
    try {
      if (
        !navigator.mediaDevices?.getUserMedia
        || typeof MediaRecorder === 'undefined'
      )
        throw new Error('当前浏览器不支持录音，请使用支持的浏览器')
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (disposed || sequence !== generation || active !== session) {
        acquired.getTracks().forEach(t => t.stop())
        return false
      }
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find(t => MediaRecorder.isTypeSupported?.(t))
      const current = new MediaRecorder(
        acquired,
        mimeType ? { mimeType } : undefined,
      )
      const chunks: Blob[] = []
      const currentStream = acquired
      const previousTranscript = transcript.value
      recorder = current
      stream = acquired
      current.ondataavailable = (e) => {
        if (e.data.size)
          chunks.push(e.data)
      }
      current.onstop = () => {
        currentStream.getTracks().forEach(t => t.stop())
        if (disposed || current !== recorder)
          return
        const blob = new Blob(chunks, {
          type: current.mimeType || mimeType || 'audio/webm',
        })
        if (blob.size) {
          const next = URL.createObjectURL(blob)
          if (audioUrl.value)
            URL.revokeObjectURL(audioUrl.value)
          audioUrl.value = next
        }
        else {
          error.value = '没有收到录音数据，请重试；原录音已保留'
          transcript.value = previousTranscript
        }
        processing.value = false
      }
      current.onerror = () => {
        error.value = '录音发生错误，请检查麦克风后重试'
        stop()
      }
      current.start()
      transcript.value = ''
      isRecording.value = true
      elapsed.value = 0
      startedAt = Date.now()
      timer = setInterval(() => {
        elapsed.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      }, 1000)
      const SR
        = (window as any).SpeechRecognition
        || (window as any).webkitSpeechRecognition
      if (SR) {
        try {
          const recognizer = new SR()
          recognition = recognizer
          recognizer.lang = 'en-US'
          recognizer.continuous = true
          recognizer.interimResults = true
          let finalText = ''
          let healthy = true
          recognizer.onresult = (event: any) => {
            if (recognition !== recognizer || !isRecording.value)
              return
            let interim = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal)
                finalText += `${event.results[i][0].transcript.trim()} `
              else interim += event.results[i][0].transcript
            }
            transcript.value = (finalText + interim).trim()
          }
          recognizer.onerror = (event: any) => {
            if (recognition === recognizer && isRecording.value) {
              // no-speech（静音停顿）与 aborted 属可恢复：不要置 healthy=false，
              // 否则 onend 不再重启，本轮后续说话再也不转写。
              if (event.error !== 'no-speech' && event.error !== 'aborted') {
                healthy = false
                error.value = `语音转写失败（${event.error || '未知错误'}），录音仍可回放；停止后可重录`
              }
            }
          }
          recognizer.onend = () => {
            if (recognition === recognizer && isRecording.value && healthy) {
              try {
                recognizer.start()
              }
              catch {
                error.value = '语音转写已停止，录音仍在继续'
              }
            }
          }
          recognizer.start()
        }
        catch {
          error.value = '语音转写无法启动，录音仍可正常回放'
        }
      }
      return true
    }
    catch (e) {
      acquired?.getTracks().forEach(t => t.stop())
      if (sequence === generation && !disposed) {
        error.value
          = e instanceof Error && e.message.includes('不支持')
            ? e.message
            : '无法启动麦克风，请检查权限后重试；原录音已保留'
      }
      if (active === session)
        active = null
      return false
    }
    finally {
      if (sequence === generation)
        starting.value = false
    }
  }
  function clear() {
    stop()
    recorder = null
    processing.value = false
    if (audioUrl.value)
      URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
    transcript.value = ''
    elapsed.value = 0
    error.value = ''
  }
  function dispose() {
    offLogout()
    offOwner()

    disposed = true
    stop()
    recorder = null
    if (audioUrl.value)
      URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
  }
  if (getCurrentInstance())
    onUnmounted(dispose)
  return {
    isRecording,
    processing,
    starting,
    audioUrl,
    error,
    elapsed,
    transcript,
    transcriptionSupported,
    start,
    stop,
    clear,
    dispose,
  }
}
export function formatRecordingClock(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(sec / 60)}:${`${sec % 60}`.padStart(2, '0')}`
}

import { getCurrentScope, onScopeDispose, ref } from 'vue'

/**
 * 浏览器录音（MediaRecorder），用于口语自测：
 * start() 请求麦克风权限并开始录音，stop() 结束并生成可回放的 audioUrl。
 * 注意：getUserMedia 需要 HTTPS 或 localhost 环境。
 */
export function useRecorder() {
  const isRecording = ref(false)
  const audioUrl = ref<string | null>(null)
  const error = ref('')
  const elapsed = ref(0)
  // 语音转写（Web Speech API，仅 Chrome/Edge 等支持）
  const transcript = ref('')
  const transcriptionSupported = typeof window !== 'undefined'
    && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let recognition: any = null
  let generation = 0
  let starting = false
  let disposed = false

  function startTranscription() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR)
      return
    detachTranscription()
    const ownGeneration = generation
    let finalText = ''
    transcript.value = ''
    const instance = new SR()
    recognition = instance
    instance.lang = 'en-US'
    instance.continuous = true
    instance.interimResults = true
    instance.onresult = (e: any) => {
      if (disposed || generation !== ownGeneration || recognition !== instance)
        return
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t: string = e.results[i][0].transcript
        if (e.results[i].isFinal)
          finalText += `${t.trim()} `
        else
          interim += t
      }
      transcript.value = (finalText + interim).trim()
    }
    instance.onerror = () => { /* 忽略，转写失败不影响录音 */ }
    instance.onend = () => {
      // 录音中途识别中断则自动重启
      if (!disposed && generation === ownGeneration && isRecording.value && recognition === instance) {
        try {
          instance.start()
        }
        catch { /* ignore */ }
      }
    }
    try {
      instance.start()
    }
    catch { /* ignore */ }
  }

  function stopTranscription() {
    if (recognition) {
      recognition.onend = null
      try {
        recognition.stop()
      }
      catch { /* ignore */ }
      // Keep this instance until clear/restart so its final current-session
      // result can arrive after stop(). Old sessions are detached separately.
    }
  }

  function detachTranscription() {
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition = null
    }
  }

  function cleanupTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function start(): Promise<boolean> {
    error.value = ''
    if (isRecording.value)
      return true
    if (disposed || starting)
      return false
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = '当前浏览器不支持录音'
      return false
    }
    starting = true
    const ownGeneration = ++generation
    let recordingStream: MediaStream
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    catch {
      error.value = '无法访问麦克风，请在浏览器设置中允许麦克风权限后重试'
      return false
    }
    finally {
      starting = false
    }
    if (disposed || ownGeneration !== generation) {
      recordingStream.getTracks().forEach(t => t.stop())
      return false
    }
    stream = recordingStream
    const chunks: Blob[] = []
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(recordingStream)
      recorder.start()
    }
    catch {
      error.value = '录音初始化失败，请换个浏览器试试'
      stream.getTracks().forEach(t => t.stop())
      stream = null
      return false
    }
    mediaRecorder = recorder
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0)
        chunks.push(e.data)
    }
    recorder.onstop = () => {
      recordingStream.getTracks().forEach(t => t.stop())
      if (stream === recordingStream)
        stream = null
      if (!disposed && ownGeneration === generation) {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (audioUrl.value)
          URL.revokeObjectURL(audioUrl.value)
        audioUrl.value = URL.createObjectURL(blob)
      }
    }
    isRecording.value = true
    elapsed.value = 0
    cleanupTimer()
    timer = setInterval(() => {
      elapsed.value++
    }, 1000)
    // 同步启动语音转写（支持的浏览器）
    startTranscription()
    return true
  }

  function stop() {
    const wasRecording = isRecording.value
    isRecording.value = false
    cleanupTimer()
    stopTranscription()
    if (starting)
      generation++
    if (mediaRecorder && wasRecording) {
      try {
        mediaRecorder.stop()
      }
      catch { /* ignore */ }
    }
    stream?.getTracks().forEach(t => t.stop())
    stream = null
  }

  function clear() {
    generation++
    stop()
    detachTranscription()
    if (audioUrl.value)
      URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
    elapsed.value = 0
    error.value = ''
    transcript.value = ''
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      clear()
    })
  }

  return { isRecording, audioUrl, error, elapsed, transcript, transcriptionSupported, start, stop, clear }
}

export function formatRecordingClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

import { ref } from 'vue'

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
  let chunks: Blob[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  let recognition: any = null
  let finalText = ''

  function startTranscription() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR)
      return
    finalText = ''
    transcript.value = ''
    recognition = new SR()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e: any) => {
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
    recognition.onerror = () => { /* 忽略，转写失败不影响录音 */ }
    recognition.onend = () => {
      // 录音中途识别中断则自动重启
      if (isRecording.value && recognition) {
        try {
          recognition.start()
        }
        catch { /* ignore */ }
      }
    }
    try {
      recognition.start()
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
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = '当前浏览器不支持录音'
      return false
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    catch {
      error.value = '无法访问麦克风，请在浏览器设置中允许麦克风权限后重试'
      return false
    }
    chunks = []
    try {
      mediaRecorder = new MediaRecorder(stream)
    }
    catch {
      error.value = '录音初始化失败，请换个浏览器试试'
      stream.getTracks().forEach(t => t.stop())
      stream = null
      return false
    }
    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0)
        chunks.push(e.data)
    }
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      if (audioUrl.value)
        URL.revokeObjectURL(audioUrl.value)
      audioUrl.value = URL.createObjectURL(blob)
      stream?.getTracks().forEach(t => t.stop())
      stream = null
    }
    mediaRecorder.start()
    isRecording.value = true
    elapsed.value = 0
    cleanupTimer()
    timer = setInterval(() => { elapsed.value++ }, 1000)
    // 同步启动语音转写（支持的浏览器）
    startTranscription()
    return true
  }

  function stop() {
    if (mediaRecorder && isRecording.value) {
      try {
        mediaRecorder.stop()
      }
      catch { /* ignore */ }
      isRecording.value = false
      cleanupTimer()
      stopTranscription()
    }
  }

  function clear() {
    stop()
    if (audioUrl.value)
      URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
    elapsed.value = 0
    error.value = ''
    transcript.value = ''
  }

  return { isRecording, audioUrl, error, elapsed, transcript, transcriptionSupported, start, stop, clear }
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

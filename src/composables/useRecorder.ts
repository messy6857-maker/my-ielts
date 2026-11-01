import { getCurrentInstance, onUnmounted, ref, watch } from 'vue'
import { onBeforeLogout, useAuth } from './useAuth'

let active: {
  stop: () => void
  busy: boolean
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
  // 账号实际变化时清空旧身份的录音与转写（防御纵深：主路径卸载时 dispose
  // 已清；此处防未来出现页内切换账号入口导致旧录音被新身份评分）。
  // 注意 onBeforeLogout 保持 stop：退出可被后续回调取消，取消时录音必须还在。
  const offOwner = watch(useAuth().currentUser, clear, { flush: 'sync' })
  const session = {
    stop: () => stop(),
    get busy() { return isRecording.value || processing.value },
  }
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
    // blob 落盘窗口内 active 保留到 onstop：收起/切 Tab 的确认不漏判该窗口
    if (active === session && !processing.value)
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
          // 空数据时不虚构“原录音已保留”：只有此前已有录音
          // （audioUrl 未被新 blob 覆盖）时该断言才成立
          error.value = audioUrl.value
            ? '没有收到录音数据，请重试；原录音已保留'
            : '没有收到录音数据，请重试'
          transcript.value = previousTranscript
        }
        processing.value = false
        if (active === session)
          active = null
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
                // restart 抛错（如识别器尚未完全结束）不能成为终态：healthy
                // 仍为真却再无 onend 可触发，转写会静默永久停摆。先延迟重试
                // 一次；重试仍抛错则明确降级为不可恢复：healthy 置 false，
                // 并给出“停止后可重录”的明确提示，不再假装健康。
                error.value = '语音转写重启失败，正在重试；录音仍在继续'
                setTimeout(() => {
                  if (recognition !== recognizer || !isRecording.value || !healthy)
                    return
                  try {
                    recognizer.start()
                  }
                  catch {
                    healthy = false
                    error.value = '语音转写已停止（无法自动恢复），录音仍在继续；停止录音后可重录'
                  }
                }, 300)
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
        if (e instanceof Error && e.message.includes('不支持')) {
          error.value = e.message
        }
        else {
          // 按失败原因分流，不再把无设备/被占用都写成“权限”；
          // “原录音已保留”只在确实有上一段录音时才追加
          const kept = audioUrl.value ? '；原录音已保留' : ''
          const name = (e as any)?.name
          if (name === 'NotAllowedError')
            error.value = `无法启动麦克风，请检查权限后重试${kept}`
          else if (name === 'NotFoundError')
            error.value = `未检测到麦克风设备${kept}`
          else if (name === 'NotReadableError')
            error.value = `麦克风正被其他应用占用，请关闭后重试${kept}`
          else
            error.value = `无法启动麦克风，请重试${kept}`
        }
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
    if (active === session)
      active = null
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
/** 任一录音会话正在录音或落盘中（收起话题/切 Tab 会丢弃它时需先确认）。 */
export function isRecorderBusy(): boolean {
  return !!active && active.busy
}
/** 录音忙时离开前确认一次；确认本身不阻止卸载时关麦克风（卸载方仍 stop）。 */
export function confirmLeaveRecording(): boolean {
  if (!isRecorderBusy())
    return true
  // eslint-disable-next-line no-alert
  return window.confirm('正在录音，离开将丢失本次录音，确定吗？')
}
export function formatRecordingClock(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(sec / 60)}:${`${sec % 60}`.padStart(2, '0')}`
}

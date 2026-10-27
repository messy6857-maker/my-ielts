// 全站单音频协调：同一时间只允许一个声音在播放
// - 任意 <audio> 开始播放时，自动暂停页面上其他所有 <audio>，并停止 TTS 朗读
// - TTS 朗读前调用 stopAllAudio()，先暂停所有 <audio>
// 用法：在 App.vue 的 setup 中调用一次 initSingleAudio()
const detached = new Set<HTMLAudioElement>()
export function registerAudio(audio: HTMLAudioElement) {
  detached.add(audio)
  const play = () => stopAllAudio(audio)
  audio.addEventListener('play', play)
  return () => {
    detached.delete(audio)
    audio.removeEventListener('play', play)
  }
}
export function stopAllAudio(except?: HTMLAudioElement) {
  for (const audio of detached) {
    if (audio !== except)
      audio.pause()
  }

  if (typeof document !== 'undefined') {
    document.querySelectorAll('audio').forEach((a) => {
      if (a !== except && !a.paused)
        a.pause()
    })
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.cancel()
}
let inited = false
export function initSingleAudio() {
  if (inited || typeof document === 'undefined')
    return
  inited = true
  // play 事件不冒泡，用捕获阶段在 document 上统一拦截
  document.addEventListener(
    'play',
    (e) => {
      const target = e.target as HTMLElement
      if (!target || target.tagName !== 'AUDIO')
        return
      stopAllAudio(target as HTMLAudioElement)
    },
    true,
  )
}

import { getCurrentScope, onScopeDispose } from 'vue'
import { resolveAudioUrl } from './useAudio'

// Detached audio does not send events through document; register it explicitly.
const managed = new Set<HTMLAudioElement>()
let inited = false

function stopOthers(except?: HTMLAudioElement) {
  const all = new Set(managed)
  if (typeof document !== 'undefined')
    document.querySelectorAll('audio').forEach(audio => all.add(audio))
  all.forEach((audio) => {
    if (audio !== except && !audio.paused)
      audio.pause()
  })
  if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.cancel()
}

export function stopAllAudio() {
  stopOthers()
}

export function initSingleAudio() {
  if (inited || typeof document === 'undefined')
    return
  inited = true
  document.addEventListener('play', (e) => {
    const audio = e.target
    if (audio instanceof HTMLAudioElement)
      stopOthers(audio)
  }, true)
}

export function createManagedAudio(): HTMLAudioElement {
  initSingleAudio()
  const audio = document.createElement('audio')
  managed.add(audio)
  audio.addEventListener('play', () => stopOthers(audio))
  return audio
}

export function useAudioPlayer() {
  let audio: HTMLAudioElement | null = null
  function stop() {
    audio?.pause()
  }
  function dispose() {
    stop()
    if (audio) {
      managed.delete(audio)
      audio.removeAttribute('src')
      audio = null
    }
  }
  function play(path: string) {
    audio ??= createManagedAudio()
    stopOthers(audio)
    audio.pause()
    audio.src = resolveAudioUrl(path)
    audio.currentTime = 0
    return audio.play().then(() => true, () => false)
  }
  if (getCurrentScope())
    onScopeDispose(dispose)
  return { play, stop, dispose }
}

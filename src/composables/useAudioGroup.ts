import { onUnmounted } from 'vue'
import { registerAudio } from './useSingleAudio'

export function speechLanguage() {
  return localStorage.getItem('myielts_tts_language') === 'en-GB'
    ? 'en-GB'
    : 'en-US'
}
export function useAudioGroup() {
  const players = new Map<HTMLAudioElement, () => void>()
  function dispose() {
    for (const [audio, off] of players) {
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      off()
    }
    players.clear()
    window.speechSynthesis?.cancel()
  }
  onUnmounted(dispose)
  function create() {
    for (const [old, off] of players) {
      if (old.paused && players.size > 3) {
        old.onerror = null
        old.removeAttribute('src')
        off()
        players.delete(old)
      }
    }
    const audio = document.createElement('audio')
    players.set(audio, registerAudio(audio))
    return audio
  }
  return { create, dispose }
}

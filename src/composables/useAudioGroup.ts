import { onUnmounted } from 'vue'
import { registerAudio } from './useSingleAudio'

export function speechLanguage() {
  return localStorage.getItem('myielts_tts_language') === 'en-GB'
    ? 'en-GB'
    : 'en-US'
}
export function useAudioGroup() {
  let generation = 0
  let wordPlayer: HTMLAudioElement | null = null
  const players = new Map<HTMLAudioElement, () => void>()
  function dispose() {
    generation++
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
  function play(src: string, text: string, onFailure?: () => void) {
    const sequence = ++generation
    if (wordPlayer) {
      wordPlayer.onerror = null
      wordPlayer.pause()
    }
    window.speechSynthesis?.cancel()
    const audio = create()
    wordPlayer = audio
    let failed = false
    const fallback = () => {
      if (failed || sequence !== generation)
        return
      failed = true
      onFailure?.()
      if (!text || !window.speechSynthesis)
        return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = speechLanguage()
      window.speechSynthesis.speak(utterance)
    }
    audio.onerror = fallback
    audio.src = src
    audio.play().catch(fallback)
    return audio
  }
  return { create, play, dispose }
}

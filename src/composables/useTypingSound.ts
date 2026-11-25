import type { TypingSound } from '../utils/typingSound'
import { playTypingSound } from '../utils/typingSound'
import { usePersistentBool } from './usePersistentBool'

// 打字音效开关：设备级设置（不同设备可能一个外放一个戴耳机），默认打开。
export const TYPING_SOUND_KEY = 'myielts_typing_sound_v1'

export function useTypingSound() {
  const enabled = usePersistentBool(TYPING_SOUND_KEY, true)
  function play(kind: TypingSound) {
    if (enabled.value)
      playTypingSound(kind)
  }
  return { enabled, play }
}

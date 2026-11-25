// 打字音效：用 Web Audio 现场合成，不需要音频文件。
// 浏览器要求用户先有交互才允许发声，第一次按键时才创建 AudioContext。
export type TypingSound = 'key' | 'wrong' | 'done'

let context: AudioContext | null = null
function audioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctor)
      return null
    context ??= new Ctor() as AudioContext
    if (context.state === 'suspended')
      void context.resume().catch(() => {})
    return context
  }
  catch {
    return null
  }
}

function tone(
  ctx: AudioContext,
  frequency: number,
  seconds: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
) {
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(volume, start)
  // 指数衰减到接近 0，听起来像短促的敲击而不是“嘀”
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + seconds + 0.02)
}

export function playTypingSound(kind: TypingSound) {
  const ctx = audioContext()
  if (!ctx)
    return
  try {
    if (kind === 'key') {
      tone(ctx, 1900, 0.03, 'square', 0.03)
    }
    else if (kind === 'wrong') {
      tone(ctx, 170, 0.14, 'sawtooth', 0.06)
    }
    else {
      tone(ctx, 660, 0.09, 'sine', 0.08)
      tone(ctx, 990, 0.14, 'sine', 0.08, 0.08)
    }
  }
  catch {
    /* 音效失败不影响练习 */
  }
}

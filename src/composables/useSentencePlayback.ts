import type { ComputedRef, Ref } from 'vue'
import type { SentenceTiming } from '../pages/listening/timings/loadTimings'
import { ref } from 'vue'
import { prefersOriginalAudio, shouldUseTtsFallback } from '../pages/listening/timings/loadTimings'
import { speechLanguage } from './useAudioGroup'

// 精听里的“点读一句”：有句级时间戳就把原录音定位到这一句播放、到句尾自动停；
// 只有确认音频里没有这一句时才用浏览器朗读兜底。播放状态（哪一句在读、出错提示）
// 写回页面传进来的 ref。

export function useSentencePlayback(options: {
  sentences: ComputedRef<string[]>
  sentenceEntries: ComputedRef<Array<{ text: string }>>
  sentenceTiming: (idx: number) => SentenceTiming | undefined
  timingsLoading: Ref<boolean>
  /** 整段原录音的播放器（点读前先暂停它） */
  audioEl: Ref<HTMLAudioElement | null>
  playbackRate: Ref<number>
  speakingIndex: Ref<number>
  mediaError: Ref<string>
  ttsError: Ref<string>
}) {
  const {
    sentences,
    sentenceEntries,
    sentenceTiming,
    timingsLoading,
    audioEl,
    playbackRate,
    speakingIndex,
    mediaError,
    ttsError,
  } = options
  let playbackGeneration = 0
  const sentenceAudioEl = ref<HTMLAudioElement | null>(null)
  let sentenceEndAt: number | null = null
  let sentencePlayGeneration = 0
  let sentenceStopRaf = 0
  let seekController: AbortController | undefined

  function stopSentenceAudio() {
    sentencePlayGeneration++
    seekController?.abort()
    seekController = undefined
    if (sentenceStopRaf) {
      cancelAnimationFrame(sentenceStopRaf)
      sentenceStopRaf = 0
    }
    sentenceAudioEl.value?.pause()
    sentenceEndAt = null
  }

  function whenAudioSeekable(el: HTMLAudioElement, signal: AbortSignal): Promise<boolean> {
    if (el.error || signal.aborted)
      return Promise.resolve(false)
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA)
      return Promise.resolve(true)
    return new Promise((resolve) => {
      const timeout = setTimeout(onError, 8000)
      function finish(ready: boolean) {
        clearTimeout(timeout)
        el.removeEventListener('loadedmetadata', onReady)
        el.removeEventListener('error', onError)
        signal.removeEventListener('abort', onError)
        resolve(ready)
      }
      function onReady() {
        finish(true)
      }
      function onError() {
        finish(false)
      }
      el.addEventListener('loadedmetadata', onReady)
      el.addEventListener('error', onError)
      signal.addEventListener('abort', onError, { once: true })
    })
  }

  function armSentenceEndWatch(el: HTMLAudioElement, generation: number) {
    if (sentenceStopRaf) {
      cancelAnimationFrame(sentenceStopRaf)
      sentenceStopRaf = 0
    }
    // timeupdate 间隔较粗，用 rAF 在句尾更准时停，避免吞掉下一句开头。
    const tick = () => {
      if (generation !== sentencePlayGeneration) {
        sentenceStopRaf = 0
        return
      }
      if (sentenceEndAt != null && el.currentTime >= sentenceEndAt - 0.02) {
        el.pause()
        try {
          el.currentTime = sentenceEndAt
        }
        catch {
          /* ignore seek clamp */
        }
        sentenceEndAt = null
        speakingIndex.value = -1
        sentenceStopRaf = 0
        return
      }
      sentenceStopRaf = requestAnimationFrame(tick)
    }
    sentenceStopRaf = requestAnimationFrame(tick)
  }

  async function playOriginalSentence(idx: number, start: number, end: number) {
    const el = sentenceAudioEl.value
    // 已有原音时间戳时绝不回退 TTS：播放失败只提示重试媒体。
    if (!el) {
      mediaError.value = '原音播放器未就绪，请刷新后重试'
      return
    }
    audioEl.value?.pause()
    if (typeof speechSynthesis !== 'undefined')
      window.speechSynthesis?.cancel()
    stopSentenceAudio()
    const controller = new AbortController()
    seekController = controller
    ttsError.value = ''
    const generation = sentencePlayGeneration
    speakingIndex.value = idx
    sentenceEndAt = end
    el.playbackRate = playbackRate.value
    const ready = await whenAudioSeekable(el, controller.signal)
    if (generation !== sentencePlayGeneration || sentenceAudioEl.value !== el)
      return
    if (!ready) {
      sentenceEndAt = null
      speakingIndex.value = -1
      mediaError.value = '原音尚未加载完成，请稍候或点上方重试'
      return
    }
    try {
      el.currentTime = start
    }
    catch {
      sentenceEndAt = null
      speakingIndex.value = -1
      mediaError.value = '原音定位失败，请检查网络后重试'
      return
    }
    armSentenceEndWatch(el, generation)
    const p = el.play()
    if (p) {
      p.catch(() => {
        if (generation !== sentencePlayGeneration)
          return
        stopSentenceAudio()
        speakingIndex.value = -1
        mediaError.value = '原音播放失败，请检查网络后重试'
      })
    }
  }

  function onSentenceTimeUpdate() {
    const el = sentenceAudioEl.value
    if (el && sentenceEndAt != null && el.currentTime >= sentenceEndAt - 0.02) {
      el.pause()
      sentenceEndAt = null
      speakingIndex.value = -1
      if (sentenceStopRaf) {
        cancelAnimationFrame(sentenceStopRaf)
        sentenceStopRaf = 0
      }
    }
  }

  function playSentence(idx: number) {
    const s = sentences.value[idx]
    // B-1: while timings load, the sentence's true status is unknown; never
    // fall through to TTS for a sentence that may have original audio.
    if (!s || timingsLoading.value)
      return
    const timing = sentenceTiming(idx)
    // B-4:分流走 loadTimings.ts 的共用 helper，不再内联重复（闭集 ok/weak/
    // tts/skip 下与旧内联逻辑逐项一致；未知状态默认不播，fail-closed）。
    // ok/weak：一律原音。仅 status=tts（对齐确认音频中无此句）才朗读兜底。
    if (prefersOriginalAudio(timing)) {
      playOriginalSentence(idx, timing![0]!, timing![1]!)
      return
    }
    if (!shouldUseTtsFallback(timing))
      return
    playTtsSentence(idx)
  }

  function playTtsSentence(idx: number) {
    const s = sentences.value[idx]
    if (!s)
      return
    if (typeof speechSynthesis === 'undefined') {
      ttsError.value = '当前浏览器不支持语音朗读，点读暂不可用，可改用上方原录音对照原文。'
      return
    }
    ttsError.value = ''
    // 先暂停原录音，再朗读本句，避免两路叠加
    audioEl.value?.pause()
    stopSentenceAudio()
    playbackGeneration++
    window.speechSynthesis?.cancel()
    speakingIndex.value = idx
    // 去掉说话人标识再朗读
    const text = sentenceEntries.value[idx].text
    const sequence = ++playbackGeneration
    const u = new SpeechSynthesisUtterance(text)
    u.lang = speechLanguage()
    u.onend = () => {
      if (sequence === playbackGeneration)
        speakingIndex.value = -1
    }
    u.onerror = () => {
      if (sequence === playbackGeneration) {
        speakingIndex.value = -1
        ttsError.value = '语音朗读失败（可能无可用语音包），点读暂不可用，可改用上方原录音对照原文。'
      }
    }
    speechSynthesis.speak(u)
  }

  function stopSentence() {
    playbackGeneration++
    window.speechSynthesis?.cancel()
    stopSentenceAudio()
    speakingIndex.value = -1
  }

  /** 停掉浏览器朗读（切篇、离页时用） */
  function cancelSpeech() {
    playbackGeneration++
    window.speechSynthesis?.cancel()
  }

  return {
    sentenceAudioEl,
    stopSentenceAudio,
    onSentenceTimeUpdate,
    playSentence,
    stopSentence,
    cancelSpeech,
  }
}

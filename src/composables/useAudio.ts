// 音频地址解析：
// - 网页版：相对路径（自动适配部署基址）
// - 安卓 App（Capacitor）：vocabulary 的 480MB 音频不打进包，改为从线上站点流式加载
import { Capacitor } from '@capacitor/core'

const SITE_BASE = 'https://messy6857-maker.github.io/my-ielts'

export function vocabularyChapterAudio(file: string): string {
  return `https://raw.githubusercontent.com/messy6857-maker/my-ielts/master/public/vocabulary/audio/${encodeURIComponent(file)}`
}

/** chef has no local clip; use the same dictionary voice as reading practice. */
export function vocabularyWordAudio(chapter: string, word: string): string {
  return word.toLowerCase() === 'chef'
    ? `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`
    : `vocabulary/audio/${chapter}/${word}.mp3`
}

/** Packaged/static assets stay local in Capacitor as well as on the web. */
export function resolveAssetUrl(path: string): string {
  if (/^(?:https?:|blob:|data:|\/\/)/i.test(path)) return path
  const relative = path.replace(/^\/+/, '')
  if (typeof document === 'undefined') return relative
  const base = new URL(import.meta.env.BASE_URL || './', document.baseURI)
  return new URL(relative, base).href
}

export function resolveAudioUrl(path: string): string {
  if (/^(?:https?:|blob:|data:|\/\/)/i.test(path)) return path
  return Capacitor.isNativePlatform() ? `${SITE_BASE}/${path.replace(/^\/+/, '')}` : resolveAssetUrl(path)
}

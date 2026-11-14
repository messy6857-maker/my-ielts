import { triggerBlobDownload } from '../utils/download'

// 媒体地址解析：全部媒体（模考音频/图、词汇发音、179 发音、
// 写作图表、语法讲义）都放在独立媒体仓库 my-ielts-media，
// 经 GitHub Pages 对外提供，不再随站点仓库发布。
// 网页版与安卓 App 统一走媒体站绝对地址；本地开发时同样走线上媒体站。
export const MEDIA_BASE = 'https://messy6857-maker.github.io/my-ielts-media'
export function resolveMediaUrl(path: string): string {
  return `${MEDIA_BASE}/${path
    .replace(/^\/+/, '')
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')}`
}
// 旧名保留：现有词汇/179 音频调用方不用改。
export function resolveAudioUrl(path: string): string {
  return resolveMediaUrl(path)
}

/**
 * Download a media-site file as a Blob so the `download` attribute works
 * cross-origin. On fetch failure, open the absolute URL in a new tab.
 */
/** 是否运行在安卓 App（Capacitor 原生壳）里；原生壳会注入全局 Capacitor */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

export async function downloadMediaFile(
  path: string,
  filename: string,
): Promise<void> {
  const url = resolveMediaUrl(path)
  // 安卓 WebView 不处理 blob: 下载链接（点了没反应），直接交给系统浏览器打开
  if (isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)
    triggerBlobDownload(await response.blob(), filename)
  }
  catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

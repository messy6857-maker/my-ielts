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
export async function downloadMediaFile(
  path: string,
  filename: string,
): Promise<void> {
  const url = resolveMediaUrl(path)
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

// 音频地址解析：
// - 网页版：相对路径（自动适配部署基址）
// - 安卓 App（Capacitor）：vocabulary 的 480MB 音频不打进包，改为从线上站点流式加载
import { Capacitor } from '@capacitor/core'

const SITE_BASE = 'https://messy6857-maker.github.io/my-ielts'

export function resolveAudioUrl(path: string): string {
  if (Capacitor.isNativePlatform())
    return `${SITE_BASE}/${path}`
  return path
}

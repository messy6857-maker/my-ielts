import { ref } from 'vue'

declare const __APP_BUILD__: number

/**
 * 网站更新提示：每次构建有个版本号（构建时间）。打开页面时把自己的版本号写进 localStorage；
 * 其他页签写入了更新的版本号（或本页签是从缓存打开的旧版），就提示刷新——
 * 升级期间还开着的旧页签会按旧逻辑读写数据，尽早刷新能避免新旧版本交错写入。
 */
const BUILD_KEY = 'myielts_app_build'
const myBuild = typeof __APP_BUILD__ === 'number'
  ? __APP_BUILD__
  : 0
/** 有更新的版本在运行：本页签该刷新了 */
export const appOutdated = ref(false)

function check(value: string | null) {
  const other = Number(value)
  if (Number.isFinite(other) && other > myBuild)
    appOutdated.value = true
}

let started = false
export function startAppUpdateWatch(): void {
  if (started || typeof window === 'undefined')
    return
  started = true
  try {
    const stored = localStorage.getItem(BUILD_KEY)
    check(stored)
    if (!appOutdated.value && Number(stored) !== myBuild)
      localStorage.setItem(BUILD_KEY, String(myBuild))
  }
  catch {}
  window.addEventListener('storage', (event) => {
    if (event.key === BUILD_KEY)
      check(event.newValue)
  })
}
export function reloadApp(): void {
  window.location.reload()
}

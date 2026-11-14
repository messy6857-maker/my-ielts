import { ref } from 'vue'

// 站内确认/提示弹窗：替代浏览器原生 alert/confirm（样式统一、支持深色模式）。
// 页面调用 confirmDialog / alertDialog 拿 Promise；App.vue 里的 <AppDialog> 负责显示。
// 没有挂载 AppDialog 时（如单独挂载页面的测试）退回原生弹窗，行为与以前一致。
export interface DialogOptions {
  confirmText?: string
  cancelText?: string
  /** 危险操作（清空、重置）：确认按钮显示为红色 */
  danger?: boolean
}
export interface DialogRequest {
  id: number
  kind: 'alert' | 'confirm'
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  resolve: (ok: boolean) => void
}

export const dialogQueue = ref<DialogRequest[]>([])
let hosts = 0
let nextId = 0

export function registerDialogHost() {
  hosts++
  return () => {
    hosts--
    if (!hosts) {
      const pending = dialogQueue.value
      dialogQueue.value = []
      pending.forEach(d => d.resolve(false))
    }
  }
}

function open(kind: DialogRequest['kind'], message: string, options: DialogOptions): Promise<boolean> {
  if (!hosts) {
    if (kind === 'alert') {
      // eslint-disable-next-line no-alert
      window.alert(message)
      return Promise.resolve(true)
    }
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message))
  }
  return new Promise((resolve) => {
    dialogQueue.value = [
      ...dialogQueue.value,
      {
        id: ++nextId,
        kind,
        message,
        confirmText: options.confirmText ?? '确定',
        cancelText: options.cancelText ?? '取消',
        danger: options.danger ?? false,
        resolve,
      },
    ]
  })
}

/** 确认框：点确定返回 true，取消/Esc/点遮罩返回 false */
export function confirmDialog(message: string, options: DialogOptions = {}) {
  return open('confirm', message, options)
}

/** 提示框：只有一个“知道了”按钮 */
export async function alertDialog(message: string, options: DialogOptions = {}) {
  await open('alert', message, { confirmText: '知道了', ...options })
}

export function settleDialog(id: number, ok: boolean) {
  const request = dialogQueue.value.find(d => d.id === id)
  if (!request)
    return
  dialogQueue.value = dialogQueue.value.filter(d => d.id !== id)
  request.resolve(request.kind === 'alert' ? true : ok)
}

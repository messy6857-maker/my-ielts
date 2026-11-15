import { ref, watch } from 'vue'
import { useAuth } from './useAuth'

// 站内确认/提示弹窗：替代浏览器原生 alert/confirm（样式统一、支持深色模式）。
// 页面调用 confirmDialog / chooseDialog / alertDialog 拿 Promise；App.vue 里的 <AppDialog> 负责显示。
// 没有挂载 AppDialog 时（如单独挂载页面的测试）退回原生弹窗，行为与以前一致。
//
// 三种结果：
//   confirm —— 点了确认按钮
//   cancel  —— 点了取消按钮（取消按钮本身可能代表一个操作，如“放弃草稿”）
//   dismiss —— 按 Esc、点遮罩，或弹窗打开期间账号变了：什么都不做
// 弹窗记住打开时的账号；账号一变，所有打开的弹窗都按 dismiss 结束，确认不会落到新账号头上。
export type DialogResult = 'confirm' | 'cancel' | 'dismiss'
export interface DialogOptions {
  confirmText?: string
  cancelText?: string
  /** 危险操作（清空、重置）：确认按钮显示为红色，默认焦点放在取消按钮 */
  danger?: boolean
}
export interface DialogRequest {
  id: number
  kind: 'alert' | 'confirm'
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  /** 打开时的账号（游客为 null） */
  owner: string | null
  resolve: (result: DialogResult) => void
}

export const dialogQueue = ref<DialogRequest[]>([])
let hosts = 0
let nextId = 0
let stopOwnerWatch: (() => void) | null = null

function dismissAll() {
  const pending = dialogQueue.value
  dialogQueue.value = []
  pending.forEach(d => d.resolve('dismiss'))
}

export function registerDialogHost() {
  hosts++
  if (!stopOwnerWatch) {
    stopOwnerWatch = watch(useAuth().currentUser, (user) => {
      // 账号变了：打开的弹窗全部作废，避免旧账号的操作在新账号上执行
      const stale = dialogQueue.value.filter(d => d.owner !== user)
      if (!stale.length)
        return
      dialogQueue.value = dialogQueue.value.filter(d => d.owner === user)
      stale.forEach(d => d.resolve('dismiss'))
    }, { flush: 'sync' })
  }
  let registered = true
  return () => {
    if (!registered)
      return
    registered = false
    hosts--
    if (!hosts) {
      stopOwnerWatch?.()
      stopOwnerWatch = null
      dismissAll()
    }
  }
}

function open(kind: DialogRequest['kind'], message: string, options: DialogOptions): Promise<DialogResult> {
  const owner = useAuth().currentUser.value
  if (!hosts) {
    // 原生弹窗会阻塞页面，期间账号不会变；只有确认/取消两种结果
    if (kind === 'alert') {
      // eslint-disable-next-line no-alert
      window.alert(message)
      return Promise.resolve('confirm')
    }
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message)
      ? 'confirm'
      : 'cancel')
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
        owner,
        resolve,
      },
    ]
  })
}

/** 确认框：只有点了确认按钮才返回 true；取消、Esc、点遮罩、期间换账号都返回 false */
export async function confirmDialog(message: string, options: DialogOptions = {}): Promise<boolean> {
  return (await open('confirm', message, options)) === 'confirm'
}

/** 二选一框：取消按钮本身也是一个操作时用，需要区分“点了取消按钮”和“关掉弹窗” */
export function chooseDialog(message: string, options: DialogOptions = {}): Promise<DialogResult> {
  return open('confirm', message, options)
}

/** 提示框：只有一个“知道了”按钮 */
export async function alertDialog(message: string, options: DialogOptions = {}) {
  await open('alert', message, { confirmText: '知道了', ...options })
}

export function settleDialog(id: number, result: DialogResult) {
  const request = dialogQueue.value.find(d => d.id === id)
  if (!request)
    return
  dialogQueue.value = dialogQueue.value.filter(d => d.id !== id)
  // 兜底：结算时账号已经不是打开时的账号，一律按关闭处理
  request.resolve(request.owner !== useAuth().currentUser.value
    ? 'dismiss'
    : result)
}

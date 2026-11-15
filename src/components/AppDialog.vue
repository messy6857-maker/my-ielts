<script setup lang="ts">
import type { DialogResult } from '../composables/useDialog'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { dialogQueue, registerDialogHost, settleDialog } from '../composables/useDialog'

const current = computed(() => dialogQueue.value[0] ?? null)
const panel = ref<HTMLElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
let previousFocus: Element | null = null

// 默认焦点：危险操作放在“取消”上，避免一按回车就执行；其余放在确认按钮上
function focusDefault() {
  const target = current.value?.danger && cancelButton.value
    ? cancelButton.value
    : confirmButton.value
  target?.focus()
}

watch(
  () => current.value?.id,
  async (id, oldId) => {
    if (id && !oldId)
      previousFocus = document.activeElement
    if (id) {
      await nextTick()
      focusDefault()
    }
    else if (previousFocus instanceof HTMLElement) {
      previousFocus.focus()
      previousFocus = null
    }
  },
)

function close(result: DialogResult) {
  if (current.value)
    settleDialog(current.value.id, result)
}

function focusables(): HTMLElement[] {
  return [cancelButton.value, confirmButton.value].filter((el): el is HTMLButtonElement => !!el)
}

// 捕获阶段处理：Esc 关闭（不触发页面自己的 Esc 逻辑），Tab 只在弹窗按钮间循环
function onKey(event: KeyboardEvent) {
  if (!current.value)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close('dismiss')
    return
  }
  if (event.key !== 'Tab')
    return
  const items = focusables()
  if (!items.length)
    return
  event.preventDefault()
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = index === -1
    ? (event.shiftKey ? items.length - 1 : 0)
    : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length
  items[next].focus()
}

// 焦点跑到弹窗外（如程序聚焦了背景控件）时拉回弹窗
function onFocusIn(event: FocusEvent) {
  if (current.value && panel.value && !panel.value.contains(event.target as Node))
    focusDefault()
}

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerDialogHost()
  window.addEventListener('keydown', onKey, true)
  document.addEventListener('focusin', onFocusIn)
})
onUnmounted(() => {
  unregister?.()
  window.removeEventListener('keydown', onKey, true)
  document.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="current"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      @click.self="close('dismiss')"
    >
      <div
        ref="panel"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`app-dialog-${current.id}`"
        class="max-w-md w-full border border-gray-200 rounded-xl bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      >
        <p
          :id="`app-dialog-${current.id}`"
          class="whitespace-pre-line text-sm text-gray-800 leading-6 dark:text-gray-100"
        >
          {{ current.message }}
        </p>
        <div class="mt-5 flex flex-wrap justify-end gap-3">
          <button
            v-if="current.kind === 'confirm'"
            ref="cancelButton"
            type="button"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            @click="close('cancel')"
          >
            {{ current.cancelText }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="rounded-lg px-4 py-2 text-sm text-white font-medium"
            :class="current.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
            @click="close('confirm')"
          >
            {{ current.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

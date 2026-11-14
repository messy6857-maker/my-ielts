<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { dialogQueue, registerDialogHost, settleDialog } from '../composables/useDialog'

const current = computed(() => dialogQueue.value[0] ?? null)
const confirmButton = ref<HTMLButtonElement | null>(null)
let previousFocus: Element | null = null

watch(
  () => current.value?.id,
  async (id, oldId) => {
    if (id && !oldId)
      previousFocus = document.activeElement
    if (id) {
      await nextTick()
      confirmButton.value?.focus()
    }
    else if (previousFocus instanceof HTMLElement) {
      previousFocus.focus()
      previousFocus = null
    }
  },
)

function close(ok: boolean) {
  if (current.value)
    settleDialog(current.value.id, ok)
}
function onKey(event: KeyboardEvent) {
  if (current.value && event.key === 'Escape') {
    event.preventDefault()
    close(false)
  }
}

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerDialogHost()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  unregister?.()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="current"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      @click.self="close(false)"
    >
      <div
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
        <div class="mt-5 flex justify-end gap-3">
          <button
            v-if="current.kind === 'confirm'"
            type="button"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 dark:border-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            @click="close(false)"
          >
            {{ current.cancelText }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="rounded-lg px-4 py-2 text-sm text-white font-medium"
            :class="current.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
            @click="close(true)"
          >
            {{ current.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

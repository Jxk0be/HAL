import { readonly, ref } from 'vue'
import type { Toast, ToastKind } from '@/components/ui/types'

const toasts = ref<Toast[]>([])
let nextId = 1

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function push(message: string, kind: ToastKind = 'info', timeoutMs = 5000) {
  const id = nextId++
  toasts.value = [...toasts.value, { id, kind, message }]
  if (timeoutMs > 0) setTimeout(() => dismiss(id), timeoutMs)
  return id
}

/** App-wide toasts. Render <UiToastHost /> once (in App.vue). */
export function useToast() {
  return {
    toasts: readonly(toasts),
    show: push,
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error', 8000),
    dismiss,
  }
}

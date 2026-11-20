<script setup lang="ts">
import { useId, useTemplateRef, watch, onMounted } from 'vue'

/**
 * Accessible modal built on the native <dialog>: focus is trapped, Esc closes it, and focus
 * returns to the opener. Use v-model to open/close.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const open = defineModel<boolean>({ default: false })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const id = useId()

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  if (!value && el.open) el.close()
}

watch(open, sync)
onMounted(() => sync(open.value))

function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) open.value = false
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="description ? `${id}-desc` : undefined"
    class="m-auto w-[calc(100%-2rem)] rounded-lg border border-line-strong bg-surface p-0 text-text shadow-pop backdrop:bg-black/70 backdrop:backdrop-blur-[2px]"
    :class="widths[size]"
    @close="open = false"
    @click="onBackdrop"
  >
    <div class="p-5 sm:p-6">
      <header class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 :id="`${id}-title`" class="font-heading text-xl">{{ title }}</h2>
          <p v-if="description" :id="`${id}-desc`" class="mt-1 text-sm text-muted">
            {{ description }}
          </p>
        </div>
        <button
          type="button"
          class="-m-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Close dialog"
          @click="open = false"
        >
          <svg viewBox="0 0 20 20" class="size-5" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </header>
      <slot />
      <footer v-if="$slots.footer" class="mt-6 flex flex-wrap justify-end gap-2">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

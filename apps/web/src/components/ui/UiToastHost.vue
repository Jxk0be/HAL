<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

const accents = {
  info: 'border-l-gold',
  success: 'border-l-win',
  error: 'border-l-loss',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-4 bottom-4 z-50 print:hidden flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
  >
    <!-- Polite region for info/success; errors are announced assertively. -->
    <div aria-live="polite" class="contents">
      <template v-for="t in toasts" :key="t.id">
        <div
          v-if="t.kind !== 'error'"
          class="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-md border border-l-4 border-line-strong bg-surface-2 px-4 py-3 text-sm shadow-pop"
          :class="accents[t.kind]"
        >
          <p class="flex-1">{{ t.message }}</p>
          <button
            type="button"
            class="text-muted hover:text-text"
            aria-label="Dismiss notification"
            @click="dismiss(t.id)"
          >
            <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </template>
    </div>
    <div role="alert" class="contents">
      <template v-for="t in toasts" :key="t.id">
        <div
          v-if="t.kind === 'error'"
          class="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-md border border-l-4 border-line-strong bg-surface-2 px-4 py-3 text-sm shadow-pop"
          :class="accents.error"
        >
          <p class="flex-1">{{ t.message }}</p>
          <button
            type="button"
            class="text-muted hover:text-text"
            aria-label="Dismiss notification"
            @click="dismiss(t.id)"
          >
            <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

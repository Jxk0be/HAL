<script setup lang="ts">
defineProps<{ variant: 'important' | 'note'; html: string }>()
</script>

<template>
  <aside
    class="my-4 flex gap-3 rounded-md border px-4 py-3 text-sm leading-relaxed print:border-black print:bg-transparent"
    :class="variant === 'important' ? 'border-accent-dim bg-accent-soft' : 'border-line-strong bg-surface-2/60'"
    :aria-label="variant === 'important' ? 'Important' : 'Note'"
  >
    <svg
      v-if="variant === 'important'"
      viewBox="0 0 20 20"
      class="mt-0.5 size-4 shrink-0 text-accent"
      fill="none"
      aria-hidden="true"
    >
      <path d="M10 2.5l8 14H2l8-14z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M10 8v4M10 14.5v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 20 20" class="mt-0.5 size-4 shrink-0 text-muted" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M10 9v5M10 6.5v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <div>
      <p class="eyebrow mb-0.5" :class="variant === 'important' ? 'text-accent' : 'text-muted'">
        {{ variant === 'important' ? 'Important' : 'Note' }}
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized inline fragment (lib/rulebook.ts) -->
      <p class="rule-prose text-text" v-html="html" />
    </div>
  </aside>
</template>

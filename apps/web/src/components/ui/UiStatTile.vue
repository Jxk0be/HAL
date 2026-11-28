<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  label: string
  value: string | number
  hint?: string
  /** Red top border (default) or neutral. */
  accent?: 'red' | 'neutral'
  to?: RouteLocationRaw
}>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'div'"
    :to="to"
    class="card-accent block rounded-xl border border-line bg-surface p-4 sm:p-5"
    :class="to ? 'transition-colors hover:border-line-strong' : ''"
    :style="accent === 'neutral' ? { '--card-accent': 'var(--color-line-strong)' } : undefined"
  >
    <p class="eyebrow text-faint">{{ label }}</p>
    <div class="mt-2 flex items-end justify-between gap-2">
      <p class="tnum font-heading text-3xl leading-none text-text">{{ value }}</p>
      <slot name="trend" />
    </div>
    <p v-if="hint" class="mt-2 text-sm text-muted">{{ hint }}</p>
  </component>
</template>

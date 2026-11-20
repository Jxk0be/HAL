<script setup lang="ts">
type Variant = 'neutral' | 'gold' | 'win' | 'loss' | 'outline' | 'live'

withDefaults(defineProps<{ variant?: Variant }>(), { variant: 'neutral' })

const variants: Record<Variant, string> = {
  neutral: 'bg-surface-3 text-muted border-line-strong',
  gold: 'bg-gold-soft text-gold border-gold-dim',
  win: 'bg-win-soft text-win border-win/40',
  loss: 'bg-loss-soft text-loss border-loss/40',
  outline: 'bg-transparent text-text border-line-strong',
  live: 'bg-loss-soft text-loss border-loss/50',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-heading text-[0.7rem] leading-4 tracking-[0.12em] whitespace-nowrap"
    :class="variants[variant]"
  >
    <span
      v-if="variant === 'live'"
      class="size-1.5 animate-pulse rounded-full bg-live"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>

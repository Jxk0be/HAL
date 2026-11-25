<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    /** Internal route: renders a RouterLink. */
    to?: RouteLocationRaw
    /** External URL: renders an <a> that opens in a new tab. */
    href?: string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    block?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
)

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong border border-brand hover:border-brand-strong',
  secondary: 'bg-surface-2 text-text border border-line-strong hover:border-accent-dim hover:bg-surface-3',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-surface-2',
  danger: 'bg-transparent text-loss border border-loss/50 hover:bg-loss-soft hover:border-loss',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-md font-heading tracking-wider whitespace-nowrap',
  'transition-colors duration-150 select-none',
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  variants[props.variant],
  sizes[props.size],
  props.block ? 'w-full' : '',
])
</script>

<template>
  <RouterLink v-if="to && !disabled" :to="to" :class="classes">
    <slot />
  </RouterLink>
  <a
    v-else-if="href && !disabled"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="classes"
  >
    <slot />
    <span class="sr-only"> (opens in a new tab)</span>
  </a>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span
      v-if="loading"
      class="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

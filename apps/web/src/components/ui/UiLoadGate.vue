<script setup lang="ts">
import UiPageSkeleton from './UiPageSkeleton.vue'
import type { PageSkeletonVariant } from './types'

/**
 * Shows a skeleton until `ready`, then fades the real content in. Use it with `useReady()` so the
 * page only renders once its data has loaded, and never flashes empty states or the wrong UI.
 * Classes and attributes go on both the skeleton and the content wrapper so layout stays stable.
 * Pass a `#skeleton` slot for a page-specific placeholder, or pick a generic `variant`.
 */
defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    ready: boolean
    variant?: PageSkeletonVariant
    /** Item count for the generic skeleton (cards, rows). */
    count?: number
    /** Screen reader text while loading. */
    label?: string
  }>(),
  { variant: 'list', label: 'Loading…' },
)
</script>

<template>
  <Transition name="reveal" mode="out-in">
    <div v-if="!ready" key="skeleton" v-bind="$attrs" role="status" aria-busy="true">
      <span class="sr-only">{{ label }}</span>
      <slot name="skeleton">
        <UiPageSkeleton :variant="variant" :count="count" />
      </slot>
    </div>
    <div v-else key="content" v-bind="$attrs">
      <slot />
    </div>
  </Transition>
</template>

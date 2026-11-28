<script setup lang="ts">
defineProps<{
  title: string
  eyebrow?: string
  description?: string
  /** Smaller title for admin and tool pages. */
  compact?: boolean
  /** The description depends on data that is still loading: show a placeholder line instead. */
  pending?: boolean
}>()
</script>

<template>
  <div class="border-b border-line">
    <div class="mx-auto max-w-7xl px-4 sm:px-6" :class="compact ? 'pt-8 pb-6' : 'pt-10 pb-8 sm:pt-14 sm:pb-10'">
      <p v-if="eyebrow" class="eyebrow-line text-faint">{{ eyebrow }}</p>
      <div class="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 :class="compact ? 'font-heading text-3xl sm:text-4xl' : 'title-xl'">{{ title }}</h1>
        <div v-if="$slots.actions" class="flex shrink-0 flex-wrap gap-2">
          <slot name="actions" />
        </div>
      </div>
      <div v-if="pending" class="skeleton mt-4 h-5 w-full max-w-md rounded-sm" aria-hidden="true" />
      <p v-else-if="description" class="mt-3 max-w-2xl text-muted" :class="compact ? '' : 'sm:text-lg'">{{ description }}</p>
    </div>
  </div>
</template>

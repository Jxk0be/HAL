<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center"
  >
    <div
      class="mb-4 grid size-12 place-items-center rounded-md border border-accent-dim text-accent"
      aria-hidden="true"
    >
      <slot name="icon">
        <svg viewBox="0 0 24 24" class="size-5" fill="none">
          <path d="M4 7h16M4 12h10M4 17h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </slot>
    </div>
    <h3 class="font-heading text-lg">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-md text-sm text-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>

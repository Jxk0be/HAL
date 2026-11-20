<script setup lang="ts">
defineProps<{
  title: string
  eyebrow?: string
  description?: string
}>()
</script>

<template>
  <div class="border-b border-line">
    <div class="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
      <p v-if="eyebrow" class="eyebrow text-gold">{{ eyebrow }}</p>
      <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 class="font-heading text-4xl sm:text-5xl">{{ title }}</h1>
        <div v-if="$slots.actions" class="flex flex-wrap gap-2">
          <slot name="actions" />
        </div>
      </div>
      <p v-if="description" class="mt-3 max-w-2xl text-muted">{{ description }}</p>
    </div>
  </div>
</template>

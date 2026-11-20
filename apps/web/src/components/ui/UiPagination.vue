<script setup lang="ts">
defineProps<{ pages: number; total: number; label: string }>()
const page = defineModel<number>({ required: true })
</script>

<template>
  <nav v-if="pages > 1" :aria-label="label" class="flex items-center justify-between gap-4 text-sm">
    <button
      type="button"
      class="rounded-md border border-line-strong px-3 py-2 font-heading tracking-wider hover:border-gold-dim disabled:opacity-40"
      :disabled="page === 0"
      @click="page--"
    >
      ← Previous
    </button>
    <p class="tnum text-muted" aria-live="polite">Page {{ page + 1 }} of {{ pages }} · {{ total }} total</p>
    <button
      type="button"
      class="rounded-md border border-line-strong px-3 py-2 font-heading tracking-wider hover:border-gold-dim disabled:opacity-40"
      :disabled="page >= pages - 1"
      @click="page++"
    >
      Next →
    </button>
  </nav>
</template>

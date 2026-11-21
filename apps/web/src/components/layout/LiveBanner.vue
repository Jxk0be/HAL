<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'

/**
 * Live broadcast banner slot at the very top of the shell. Renders nothing until a broadcast is
 * passed in; step 17 feeds it from matches.broadcast_live.
 */
defineProps<{
  broadcast?: { title: string; url: string } | null
}>()
</script>

<template>
  <div v-if="broadcast" class="border-b border-loss/30 bg-loss-soft print:hidden">
    <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
      <UiBadge variant="live">Live</UiBadge>
      <p class="truncate">{{ broadcast.title }}</p>
      <a
        :href="broadcast.url"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto shrink-0 font-heading tracking-wider text-gold hover:text-gold-strong"
      >
        Watch<span class="sr-only"> {{ broadcast.title }} (opens in a new tab)</span> →
      </a>
    </div>
  </div>
</template>

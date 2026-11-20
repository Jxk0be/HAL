<script setup lang="ts">
import type { Platform } from '@/lib/teams'

defineProps<{ platform: Platform | null }>()

const labels: Record<Platform, { short: string; long: string }> = {
  playstation: { short: 'PS', long: 'PlayStation' },
  xbox: { short: 'XB', long: 'Xbox' },
  pc: { short: 'PC', long: 'PC (controller)' },
}
</script>

<template>
  <span
    v-if="platform"
    class="inline-flex h-5 min-w-7 items-center justify-center rounded-sm border border-line-strong px-1 font-heading text-[0.65rem] tracking-wider text-muted"
    :title="labels[platform].long"
  >
    <span aria-hidden="true">{{ labels[platform].short }}</span>
    <span class="sr-only">{{ labels[platform].long }}</span>
  </span>
  <span v-else class="text-faint" aria-label="No platform">—</span>
</template>

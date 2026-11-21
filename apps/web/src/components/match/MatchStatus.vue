<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import type { MatchCardData } from '@/composables/useMatches'

defineProps<{ match: MatchCardData }>()

const labels: Record<MatchCardData['status'], string> = {
  scheduled: 'Scheduled',
  checkin_open: 'Check-in open',
  live: 'In progress',
  awaiting_reports: 'Awaiting reports',
  disputed: 'Disputed',
  confirmed: 'Final',
  forfeit: 'Forfeit',
  cancelled: 'Cancelled',
}
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5">
    <UiBadge v-if="match.broadcastLive" variant="live">Live</UiBadge>
    <UiBadge
      :variant="
        match.status === 'confirmed' ? 'win'
        : match.status === 'disputed' || match.status === 'forfeit' || match.status === 'cancelled' ? 'loss'
        : match.status === 'checkin_open' || match.status === 'live' ? 'gold'
        : 'neutral'
      "
    >
      {{ labels[match.status] }}
    </UiBadge>
    <UiBadge v-if="match.scheduledAt !== match.defaultAt && match.status !== 'confirmed'" variant="outline">Rescheduled</UiBadge>
  </span>
</template>

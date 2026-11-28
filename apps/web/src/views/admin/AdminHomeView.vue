<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import UiStatTile from '@/components/ui/UiStatTile.vue'
import UiCard from '@/components/ui/UiCard.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useSeasonSchedule } from '@/composables/useMatches'
import { useAdminOverview } from '@/composables/useAdmin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { overview, loading } = useAdminOverview()
const { matches, loading: matchesLoading } = useSeasonSchedule()
const ready = useReady(() => loading.value || matchesLoading.value)

// Matches starting in the next 24 hours, with whether each side has checked in (status only).
const next24 = computed(() => {
  const now = Date.now()
  return matches.value.filter((m) => {
    const t = new Date(m.scheduledAt).getTime()
    return t > now - 30 * 60_000 && t < now + 24 * 3600_000 && !['confirmed', 'forfeit', 'cancelled'].includes(m.status)
  })
})
const checkinLabel: Record<string, string> = {
  scheduled: 'Check-in not open',
  checkin_open: 'Checking in',
  live: 'Live',
  awaiting_reports: 'Awaiting reports',
  disputed: 'Disputed',
}

const tiles = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    { label: 'Matches with mismatches', value: o.open_mismatch_matches, hint: `${o.open_mismatch_fields} fields to settle`, to: '/admin/mismatches', alert: o.open_mismatch_matches > 0 },
    { label: 'Open disputes', value: o.open_disputes, hint: 'Reason, evidence, decision', to: '/admin/disputes', alert: o.open_disputes > 0 },
    { label: 'Roster requests', value: o.pending_roster_requests, hint: 'Emergency subs and fixes', to: '/admin/rosters', alert: o.pending_roster_requests > 0 },
    { label: 'Teams to approve', value: o.pending_teams, hint: 'Season → Team approvals', to: '/admin/season', alert: o.pending_teams > 0 },
    { label: 'Unreported 24h+', value: o.unreported_past_24h, hint: 'No accepted result yet', to: '/admin/content', alert: o.unreported_past_24h > 0 },
    { label: 'Matches this week', value: o.matches_this_week, hint: 'Monday to Sunday, Eastern', to: '/matches', alert: false },
  ]
})
</script>

<template>
  <div>
    <PageHeader compact eyebrow="Control center" title="Overview" description="What needs attention. Staff never act on matches or teams they play on; the database enforces it." />
    <div class="px-4 py-8 sm:px-6">
      <p v-if="!auth.isAdmin" class="text-sm text-muted">Casters: claim matches and go live from the <RouterLink to="/admin/casting" class="text-accent hover:text-accent-strong">casting desk</RouterLink>.</p>
      <div v-else-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="tiles" :count="3" /></div>
      <template v-else>
        <ul class="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <li v-for="t in tiles" :key="t.label">
            <UiStatTile :label="t.label" :value="t.value" :hint="t.hint" :to="t.to" :accent="t.alert ? 'red' : 'neutral'" />
          </li>
        </ul>
        <UiCard accent="neutral" title="Next 24 hours" class="mt-6">
          <p v-if="!next24.length" class="text-sm text-muted">No matches in the next 24 hours.</p>
          <ul v-else class="flex flex-col divide-y divide-line text-sm">
            <li v-for="m in next24" :key="m.id" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <RouterLink :to="`/matches/${m.id}`" class="font-heading text-base hover:text-accent">{{ m.home.tag }} vs {{ m.away.tag }}</RouterLink>
              <span class="text-muted"><LeagueTime :iso="m.scheduledAt" /></span>
              <span :class="m.status === 'checkin_open' || m.status === 'live' ? 'text-win' : 'text-muted'">{{ checkinLabel[m.status] ?? m.status }}</span>
            </li>
          </ul>
        </UiCard>
      </template>
    </div>
  </div>
</template>

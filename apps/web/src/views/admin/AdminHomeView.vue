<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useAdminOverview } from '@/composables/useAdmin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { overview, loading } = useAdminOverview()

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
    <PageHeader eyebrow="Staff" title="Overview" description="What needs attention. Staff never act on matches or teams they play on; the database enforces it." />
    <div class="px-4 py-8 sm:px-6">
      <p v-if="!auth.isAdmin" class="text-sm text-muted">Casters: claim matches and go live from the <RouterLink to="/admin/casting" class="text-accent hover:text-accent-strong">casting desk</RouterLink>.</p>
      <UiSkeleton v-else-if="loading" :lines="4" />
      <ul v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="t in tiles" :key="t.label">
          <RouterLink
            :to="t.to"
            class="group flex h-full flex-col rounded-lg border bg-surface p-5 transition-colors hover:border-accent-dim focus-visible:outline-2 focus-visible:outline-accent"
            :class="t.alert ? 'border-accent-dim' : 'border-line'"
          >
            <span class="eyebrow text-muted">{{ t.label }}</span>
            <span class="tnum mt-2 font-heading text-4xl" :class="t.alert ? 'text-accent' : ''">{{ t.value }}</span>
            <span class="mt-1 text-sm text-muted group-hover:text-text">{{ t.hint }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>

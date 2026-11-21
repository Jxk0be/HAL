<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { useAuditLog } from '@/composables/useStats'

const log = useAuditLog()
const { rows, page, total, table, loading } = log

const tableOptions = [
  { value: '', label: 'Everything' },
  { value: 'matches', label: 'Matches' },
  { value: 'match_maps', label: 'Map results' },
  { value: 'player_map_stats', label: 'Stats' },
  { value: 'teams', label: 'Teams' },
  { value: 'team_members', label: 'Rosters' },
  { value: 'penalties', label: 'Penalties' },
  { value: 'disputes', label: 'Disputes' },
  { value: 'staff_roles', label: 'Staff roles' },
  { value: 'seasons', label: 'Seasons' },
]
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Transparency"
      title="Audit Log"
      description="Every action taken by league staff or the HAL bot, in public. Private details are never shown."
    />
    <div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div class="max-w-xs">
        <UiSelect v-model="table" label="Show" :options="tableOptions" />
      </div>
      <UiSkeleton v-if="loading" :lines="10" />
      <UiEmptyState v-else-if="rows.length === 0" title="Nothing logged yet" description="Staff actions appear here as they happen." />
      <ol v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <li v-for="r in rows" :key="r.id ?? 0" class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
          <time :datetime="r.created_at ?? undefined" class="tnum shrink-0 text-xs text-muted sm:w-40 sm:pt-0.5">{{ when(r.created_at) }}</time>
          <p class="min-w-0 flex-1 text-sm break-words">{{ r.summary }}</p>
          <UiBadge :variant="r.actor_role === 'system' ? 'neutral' : 'gold'" class="self-start">{{ r.actor_role === 'system' ? 'bot' : r.actor_role }}</UiBadge>
        </li>
      </ol>
      <UiPagination v-model="page" :pages="log.pages()" :total="total" label="Audit log pages" />
    </div>
  </div>
</template>

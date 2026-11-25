<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useMismatchQueue } from '@/composables/useAdmin'

const { items, loading } = useMismatchQueue()
</script>

<template>
  <div>
    <PageHeader eyebrow="Admin" title="Mismatch queue" description="Fields where the two captains' reports disagree, oldest first. Map mismatches hold up the result; player stats don't." />
    <div class="px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="5" />
      <UiEmptyState v-else-if="!items.length" title="Nothing to settle" description="Every report matches its opponent's." />
      <ul v-else class="flex flex-col gap-3">
        <li v-for="q in items" :key="q.match_id">
          <component
            :is="q.recused ? 'div' : 'RouterLink'"
            :to="q.recused ? undefined : `/admin/mismatches/${q.match_id}`"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-4"
            :class="q.recused ? 'opacity-60' : 'transition-colors hover:border-accent-dim focus-visible:outline-2 focus-visible:outline-accent'"
          >
            <span class="min-w-0 flex-1">
              <span class="block font-heading text-lg">{{ q.home.tag }} vs {{ q.away.tag }}</span>
              <span class="text-xs text-muted">Week {{ q.week }} · <LeagueTime :iso="q.scheduled_at" /></span>
            </span>
            <UiBadge v-if="q.map_fields" variant="loss">{{ q.map_fields }} map {{ q.map_fields === 1 ? 'field' : 'fields' }}</UiBadge>
            <UiBadge v-if="q.player_fields" variant="accent">{{ q.player_fields }} player {{ q.player_fields === 1 ? 'stat' : 'stats' }}</UiBadge>
            <RecusedNotice v-if="q.recused" />
            <span v-else class="text-sm text-accent">Settle <span aria-hidden="true">→</span></span>
          </component>
        </li>
      </ul>
    </div>
  </div>
</template>

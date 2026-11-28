<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import StandingsPanel from '@/components/season/StandingsPanel.vue'
import { useActiveSeason } from '@/composables/useActiveSeason'

const { season, loading } = useActiveSeason()
// Latched: later reloads (after an action, realtime) keep the content instead of re-showing the skeleton.
const ready = useReady(() => loading.value)
</script>

<template>
  <div>
    <PageHeader
      :eyebrow="season?.name ?? 'Season'"
      title="Standings"
      description="Series wins first, then map differential, head-to-head and deciding-map rounds (rule 5.5)."
    >
      <template #actions>
        <UiButton to="/season" variant="secondary">Season hub</UiButton>
        <UiButton to="/playoffs" variant="secondary">Playoff bracket</UiButton>
      </template>
    </PageHeader>
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div v-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="table" :count="8" /></div>
      <UiEmptyState v-else-if="!season" title="No season running" description="Standings appear once the season starts." />
      <StandingsPanel v-else :season-id="season.id" :season-name="season.name" :playoff-teams="season.playoff_teams" />
    </div>
  </div>
</template>

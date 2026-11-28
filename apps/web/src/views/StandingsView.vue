<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import StandingsPanel from '@/components/season/StandingsPanel.vue'
import { useActiveSeason } from '@/composables/useActiveSeason'

const { season, loading } = useActiveSeason()
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
      <UiSkeleton v-if="loading" :lines="8" />
      <UiEmptyState v-else-if="!season" title="No season running" description="Standings appear once the season starts." />
      <StandingsPanel v-else :season-id="season.id" :season-name="season.name" :playoff-teams="season.playoff_teams" />
    </div>
  </div>
</template>

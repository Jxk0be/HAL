<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import UiButton from '@/components/ui/UiButton.vue'
import BracketPanel from '@/components/season/BracketPanel.vue'
import { usePlayoffSeason } from '@/composables/usePlayoffs'

const { season, loading } = usePlayoffSeason()
// Latched: later reloads (after an action, realtime) keep the content instead of re-showing the skeleton.
const ready = useReady(() => loading.value)
const size = computed(() => season.value?.playoffTeams ?? 8)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Postseason"
      title="Playoffs"
      :description="`Top ${size} by regular-season standings, single elimination. The bracket fills in as results are confirmed.`"
    >
      <template #actions>
        <UiButton to="/standings" variant="secondary">Standings</UiButton>
      </template>
    </PageHeader>

    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div v-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="cards" :count="4" /></div>
      <UiEmptyState v-else-if="!season" title="No season yet" description="The bracket shows up once a season reaches the playoffs." />
      <BracketPanel v-else :season-id="season.id" :season-name="season.name" :size="size" />
    </div>
  </div>
</template>

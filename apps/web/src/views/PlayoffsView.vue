<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PlayoffBracket from '@/components/stats/PlayoffBracket.vue'
import { usePlayoffMatches, usePlayoffSeason } from '@/composables/usePlayoffs'
import { useDivisions } from '@/composables/useStats'

const { season, loading: seasonLoading } = usePlayoffSeason()
const seasonId = computed(() => season.value?.id)
const { divisions } = useDivisions(seasonId)
const picked = ref<string | null>(null)
const divisionId = computed(() => picked.value ?? divisions.value[0]?.id ?? null)
const tabs = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })))
const tabModel = computed({ get: () => divisionId.value ?? '', set: (v: string) => (picked.value = v) })

const { matches, seeds, loading } = usePlayoffMatches(seasonId, divisionId)
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

    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <UiSkeleton v-if="seasonLoading" :lines="6" />
      <UiEmptyState v-else-if="!season" title="No season yet" description="The bracket shows up once a season reaches the playoffs." />
      <template v-else>
        <UiTabs v-if="tabs.length > 1" v-model="tabModel" :tabs="tabs" label="Division">
          <PlayoffBracket :matches="matches" :seeds="seeds" :size="size" :season-name="season.name" :loading="loading" />
        </UiTabs>
        <PlayoffBracket v-else :matches="matches" :seeds="seeds" :size="size" :season-name="season.name" :loading="loading" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import { useReady } from '@/composables/useReady'
import StandingsTable from '@/components/stats/StandingsTable.vue'
import StatLeaderboard from '@/components/stats/StatLeaderboard.vue'
import { useDivisions, useLeaderboards, useStandings } from '@/composables/useStats'

const props = defineProps<{ seasonId: string; seasonName: string; playoffTeams: number }>()

const seasonId = computed(() => props.seasonId)
const { divisions, loading: divisionsLoading } = useDivisions(seasonId)
const division = ref<string>('league')
watch(divisions, (d) => (division.value = d[0]?.id ?? 'league'), { immediate: true })
const divisionId = computed(() => (division.value === 'league' ? null : division.value))
const tabs = computed(() =>
  divisions.value.length ? divisions.value.map((d) => ({ value: d.id, label: d.name })) : [{ value: 'league', label: 'League' }],
)

const { rows, loading } = useStandings(seasonId, divisionId)
const { boards, loading: boardsLoading } = useLeaderboards(seasonId)
// First paint waits for divisions, the table and the leaderboards; later reloads stay in place.
const ready = useReady(() => divisionsLoading.value || loading.value || boardsLoading.value)
const anyTies = computed(() => rows.value.some((r) => r.needs_admin_decision))
</script>

<template>
  <UiLoadGate :ready="ready" class="flex flex-col gap-10" variant="table" label="Loading standings…">
    <UiTabs v-model="division" label="Divisions" :tabs="tabs" variant="pill">
      <UiSkeleton v-if="loading" :lines="8" />
      <UiEmptyState v-else-if="rows.length === 0" title="No teams yet" description="Approved teams appear here once signups close." />
      <template v-else>
        <StandingsTable :rows="rows" :cutoff="Math.min(playoffTeams, rows.length)" :caption="`${seasonName} standings`" />
        <p class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span><span class="mr-1 inline-block h-0.5 w-6 bg-accent-dim align-middle" aria-hidden="true" />Playoff line: top {{ playoffTeams }}</span>
          <span v-if="anyTies"><span class="text-accent">*</span> Still tied after every tiebreak; league staff decide the order.</span>
        </p>
      </template>
    </UiTabs>

    <section aria-labelledby="leaders-title">
      <h2 id="leaders-title" class="eyebrow-line mb-1 text-faint">Leaderboards</h2>
      <p class="mb-4 text-xs text-muted">
        Top 10 for each stat. <RouterLink to="/leaderboard" class="text-accent hover:text-accent-strong">Full leaderboard →</RouterLink>
      </p>
      <div class="grid gap-4 md:grid-cols-3">
        <StatLeaderboard title="K/D" :rows="boards.kd" :value="(r) => (r.kd ?? 0).toFixed(2)" />
        <StatLeaderboard title="Kills" :rows="boards.kills" :value="(r) => String(r.kills ?? 0)" />
        <StatLeaderboard title="Avg score per map" :rows="boards.avg_score" :value="(r) => (r.avg_score ?? 0).toLocaleString()" />
      </div>
    </section>
  </UiLoadGate>
</template>

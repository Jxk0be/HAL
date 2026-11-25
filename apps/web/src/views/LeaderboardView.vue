<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTable from '@/components/ui/UiTable.vue'
import type { TableColumn, TableSort } from '@/components/ui/types'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useLeaderboardSeasons, useSeasonLeaderboard } from '@/composables/useStats'
import { boardTeams, filterRows, formatKd, formatPlusMinus, type LeaderboardRow } from '@/lib/leaderboard'

const { season: active } = useActiveSeason()
const { seasons, loading: seasonsLoading } = useLeaderboardSeasons()

// Default to the running season, else the newest one.
const seasonId = ref<string>('')
watch([active, seasons], () => {
  if (!seasonId.value) seasonId.value = active.value?.id ?? seasons.value[0]?.id ?? ''
}, { immediate: true })
const seasonName = computed(() => seasons.value.find((s) => s.id === seasonId.value)?.name)

const { rows, loading, error } = useSeasonLeaderboard(seasonId)

const team = ref<string>('all')
const search = ref('')
watch(seasonId, () => (team.value = 'all'))
const teamOptions = computed(() => [
  { value: 'all', label: 'All players' },
  { value: 'free', label: 'Free agents' },
  ...boardTeams(rows.value).map((t) => ({ value: t.id, label: `${t.tag} · ${t.name}` })),
])
const shown = computed(() => filterRows(rows.value, { team: team.value || 'all', search: search.value }))
const incompleteCount = computed(() => shown.value.filter((r) => r.incomplete).length)

const sort = ref<TableSort | null>({ key: 'kills', dir: 'desc' })
const columns: TableColumn[] = [
  { key: 'rank', label: '#', class: 'w-10 text-muted' },
  { key: 'activision_id', label: 'Player', sortable: true, class: 'sticky left-0 z-10 bg-surface min-w-40' },
  { key: 'team_tag', label: 'Current status', sortable: true },
  { key: 'maps_played', label: 'Maps', sortable: true, numeric: true },
  { key: 'kills', label: 'Kills', sortable: true, numeric: true },
  { key: 'deaths', label: 'Deaths', sortable: true, numeric: true },
  { key: 'kd', label: 'K/D', sortable: true, numeric: true },
  { key: 'plus_minus', label: '+/-', sortable: true, numeric: true },
  { key: 'avg_score', label: 'Avg score', sortable: true, numeric: true },
]
const asRow = (r: unknown) => r as LeaderboardRow
</script>

<template>
  <div>
    <PageHeader :eyebrow="seasonName ?? 'Season'" title="Player leaderboard" description="Every player with stats this season, from confirmed results. Click a column to sort." />
    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div class="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,16rem))]">
        <UiSelect
          v-if="seasons.length > 1"
          v-model="seasonId"
          label="Season"
          :options="seasons.map((s) => ({ value: s.id, label: s.name }))"
        />
        <UiSelect v-model="team" label="Show" :options="teamOptions" />
        <UiInput v-model="search" label="Search players" placeholder="Activision ID" autocomplete="off" />
      </div>

      <UiSkeleton v-if="seasonsLoading || loading" :lines="10" />
      <UiEmptyState v-else-if="!seasonId" title="No season yet" description="The leaderboard fills in once matches are confirmed." />
      <p v-else-if="error" class="text-sm text-loss" role="alert">{{ error }}</p>
      <UiEmptyState v-else-if="rows.length === 0" title="No stats yet" description="Players appear here as soon as their first match is confirmed." />
      <template v-else>
        <UiTable v-model:sort="sort" :columns="columns" :rows="shown" row-key="user_id" :caption="`${seasonName ?? 'Season'} player leaderboard`" sort-rows>
          <template #cell-rank="{ index }">{{ index + 1 }}</template>
          <template #cell-activision_id="{ row }">
            <span class="flex items-center gap-2.5">
              <UiAvatar :src="asRow(row).avatar_url" :name="asRow(row).activision_id" size="xs" decorative />
              <span class="min-w-0">
                <RouterLink :to="`/players/${asRow(row).user_id}`" class="block truncate font-medium hover:text-accent">
                  {{ asRow(row).activision_id ?? 'Unknown player' }}
                </RouterLink>
                <span
                  v-if="asRow(row).incomplete"
                  class="mt-0.5 inline-flex items-center gap-1 rounded-sm border border-accent-dim px-1.5 text-[0.65rem] font-semibold tracking-wide text-accent uppercase"
                  :title="asRow(row).incomplete_reason ?? undefined"
                >
                  Incomplete data<span class="sr-only">: {{ asRow(row).incomplete_reason }}</span>
                </span>
              </span>
            </span>
          </template>
          <template #cell-team_tag="{ row }">
            <RouterLink v-if="asRow(row).team_id" :to="`/teams/${asRow(row).team_id}`" class="font-medium text-accent hover:text-accent-strong">
              {{ asRow(row).team_tag }}<span class="sr-only"> ({{ asRow(row).team_name }})</span>
            </RouterLink>
            <span v-else class="text-muted">Free agent</span>
          </template>
          <template #cell-kills="{ row }"><span class="font-semibold text-accent">{{ asRow(row).kills }}</span></template>
          <template #cell-kd="{ row }"><span class="font-semibold">{{ formatKd(asRow(row).kd) }}</span></template>
          <template #cell-plus_minus="{ row }">
            <span :class="asRow(row).plus_minus > 0 ? 'text-win' : asRow(row).plus_minus < 0 ? 'text-loss' : ''">{{ formatPlusMinus(asRow(row).plus_minus) }}</span>
          </template>
          <template #cell-avg_score="{ row }">{{ asRow(row).avg_score?.toLocaleString() ?? '—' }}</template>
          <template #empty>No players match these filters.</template>
        </UiTable>
        <p class="text-xs text-muted">
          {{ shown.length }} {{ shown.length === 1 ? 'player' : 'players' }}.
          <template v-if="incompleteCount">
            <span class="text-accent">Incomplete data</span> means some of a player's numbers are missing or still being checked;
            hover it for the reason. Their totals cover the maps we have.
          </template>
          K/D with no deaths is shown as kills.
        </p>
      </template>
    </div>
  </div>
</template>

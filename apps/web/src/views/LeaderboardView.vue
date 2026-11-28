<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import UiTable from '@/components/ui/UiTable.vue'
import type { TableColumn, TableSort } from '@/components/ui/types'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useHallOfChampions, useLeaderboardSeasons, usePlayerRanks, useSeasonLeaderboard, useStandings } from '@/composables/useStats'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiPodium from '@/components/ui/UiPodium.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import RankBadge from '@/components/players/RankBadge.vue'
import { formatLeagueTime } from '@/lib/time'
import { boardTeams, filterRows, formatKd, formatPlusMinus, type LeaderboardRow } from '@/lib/leaderboard'

const { season: active, loading: activeLoading } = useActiveSeason()
const { seasons, loading: seasonsLoading } = useLeaderboardSeasons()

// Default to the running season, else the newest one.
const seasonId = ref<string>('')
// Wait for both lists so the newest season can't win the race against the running one.
watch([active, seasons, activeLoading, seasonsLoading], () => {
  if (seasonId.value || activeLoading.value || seasonsLoading.value) return
  seasonId.value = active.value?.id ?? seasons.value[0]?.id ?? ''
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

type Tab = 'players' | 'teams' | 'champions'
const tab = ref<Tab>('players')
const tabs = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
  { value: 'champions', label: 'Hall of Champions' },
] as const

// ---- Podium: the top 3 by whatever the table is sorted by -------------------------
const statLabel: Record<string, string> = {
  kills: 'Kills', deaths: 'Deaths', kd: 'K/D', plus_minus: '+/-', avg_score: 'Avg score', maps_played: 'Maps',
  activision_id: 'Kills', team_tag: 'Kills',
}
const podiumKey = computed(() => {
  const k = sort.value?.key ?? 'kills'
  return ['activision_id', 'team_tag'].includes(k) ? 'kills' : k
})
function statValue(r: LeaderboardRow, key: string): string {
  if (key === 'kd') return formatKd(r.kd)
  if (key === 'plus_minus') return formatPlusMinus(r.plus_minus)
  if (key === 'avg_score') return r.avg_score?.toLocaleString() ?? '—'
  return String(r[key] ?? 0)
}
const podiumRows = computed(() => {
  const key = podiumKey.value
  const asc = sort.value?.key === key && sort.value.dir === 'asc'
  return [...shown.value]
    .filter((r) => r.maps_played > 0)
    .sort((a, b) => {
      const av = a[key] as number | null
      const bv = b[key] as number | null
      if (av == null) return 1
      if (bv == null) return -1
      return asc ? av - bv : bv - av
    })
    .slice(0, 3)
})
const podium = computed(() =>
  podiumRows.value.map((r) => ({
    key: r.user_id,
    name: r.activision_id ?? 'Unknown player',
    meta: r.team_tag ?? 'Free agent',
    to: `/players/${r.user_id}`,
    row: r,
  })),
)
const { ranks } = usePlayerRanks(() => podiumRows.value.map((r) => r.user_id))

// ---- Teams --------------------------------------------------------------------------
const { rows: standings, loading: standingsLoading } = useStandings(seasonId, null)
const teamRows = computed(() =>
  [...standings.value]
    .sort((a, b) => b.wins - a.wins || b.map_diff - a.map_diff || a.name.localeCompare(b.name))
    .map((t) => ({ ...t, win_pct: t.played ? Math.round((t.wins / t.played) * 100) : 0 })),
)
type TeamRow = (typeof teamRows.value)[number]
const asTeam = (r: unknown) => r as TeamRow
const teamSort = ref<TableSort | null>(null)
const teamColumns: TableColumn[] = [
  { key: 'pos', label: '#', class: 'w-10 text-muted' },
  { key: 'name', label: 'Team', sortable: true, class: 'min-w-40' },
  { key: 'wins', label: 'Series', sortable: true, numeric: true },
  { key: 'maps_won', label: 'Maps', sortable: true, numeric: true },
  { key: 'map_diff', label: 'Map +/-', sortable: true, numeric: true },
  { key: 'win_pct', label: 'Win %', sortable: true, numeric: true },
]
const teamPodium = computed(() =>
  teamRows.value
    .filter((t) => t.played > 0)
    .slice(0, 3)
    .map((t) => ({ key: t.team_id, name: t.name, meta: `${t.wins}–${t.losses} · ${t.map_diff > 0 ? '+' : ''}${t.map_diff} maps`, to: `/teams/${t.team_id}`, row: t })),
)

// ---- Hall of Champions -------------------------------------------------------------
const { champions, loading: championsLoading } = useHallOfChampions()

const ready = useReady(
  () => activeLoading.value || seasonsLoading.value || loading.value || standingsLoading.value || championsLoading.value,
)
</script>

<template>
  <div>
    <PageHeader eyebrow="Leaderboard" title="Rankings across players and teams" :description="`${seasonName ?? 'This season'}, from confirmed results. Click a column to sort.`" :pending="!ready">
      <template v-if="ready && tab === 'players'" #actions>
        <div class="w-full sm:w-64">
          <UiInput v-model="search" label="Search players" type="search" placeholder="Activision ID" autocomplete="off" />
        </div>
      </template>
    </PageHeader>
    <UiLoadGate :ready="ready" class="mx-auto max-w-7xl px-4 py-8 sm:px-6" label="Loading the leaderboard…">
      <template #skeleton>
        <div class="mb-6 flex gap-6 border-b border-line pb-3"><div v-for="n in 3" :key="n" class="skeleton h-4 w-20 rounded-sm" /></div>
        <div class="mb-6 grid grid-cols-3 items-end gap-3 sm:gap-4">
          <div class="skeleton h-40 rounded-xl" /><div class="skeleton h-52 rounded-xl" /><div class="skeleton h-36 rounded-xl" />
        </div>
        <UiPageSkeleton variant="table" :count="8" />
      </template>
      <UiTabs v-model="tab" :tabs="tabs" label="Leaderboard sections" hash-sync>
      <template #default="{ active: section }">
      <div v-if="section === 'players'" class="flex flex-col gap-6">
      <div class="grid gap-4 sm:grid-cols-[repeat(2,minmax(0,16rem))]">
        <UiSelect
          v-if="seasons.length > 1"
          v-model="seasonId"
          label="Season"
          :options="seasons.map((s) => ({ value: s.id, label: s.name }))"
        />
        <UiSelect v-model="team" label="Show" :options="teamOptions" />
      </div>

      <UiSkeleton v-if="seasonsLoading || loading" :lines="10" />
      <UiEmptyState v-else-if="!seasonId" title="No season yet" description="The leaderboard fills in once matches are confirmed." />
      <p v-else-if="error" class="text-sm text-loss" role="alert">{{ error }}</p>
      <UiEmptyState v-else-if="rows.length === 0" title="No stats yet" description="Players appear here as soon as their first match is confirmed." />
      <template v-else>
        <UiPodium v-if="podium.length" :entries="podium" :label="`Top 3 by ${statLabel[podiumKey]}`">
          <template #corner="{ entry }">
            <RankBadge :rank="ranks[entry.key]?.rank" :exception-at="ranks[entry.key]?.exceptionAt" />
          </template>
          <template #media="{ entry }">
            <UiAvatar :src="entry.row.avatar_url" :name="entry.name" decorative />
          </template>
          <template #stat="{ entry, rank }">
            <p class="mt-4 flex items-baseline justify-between gap-2 border-t border-line pt-3">
              <span class="eyebrow text-faint">{{ statLabel[podiumKey] }}</span>
              <span class="tnum font-heading text-3xl" :class="rank === 1 ? 'text-accent' : 'text-text'">{{ statValue(entry.row, podiumKey) }}</span>
            </p>
            <p class="tnum mt-1 text-xs text-muted">{{ formatKd(entry.row.kd) }} K/D · {{ entry.row.maps_played }} maps</p>
          </template>
        </UiPodium>
        <UiTable v-model:sort="sort" :columns="columns" :rows="shown" row-key="user_id" :caption="`${seasonName ?? 'Season'} player leaderboard`" sort-rows>
          <template #cell-rank="{ index }"><span class="font-heading text-base">{{ index + 1 }}</span></template>
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

      <!-- Teams -->
      <div v-else-if="section === 'teams'" class="flex flex-col gap-6">
        <UiSkeleton v-if="standingsLoading" :lines="8" />
        <UiEmptyState v-else-if="!teamRows.length" title="No teams yet" description="Team rankings fill in once teams are approved." />
        <template v-else>
          <UiPodium v-if="teamPodium.length" :entries="teamPodium" label="Top 3 teams">
            <template #media="{ entry }">
              <TeamLogo :tag="entry.row.tag" :logo-url="entry.row.logo_url" size="lg" decorative />
            </template>
          </UiPodium>
          <UiTable v-model:sort="teamSort" :columns="teamColumns" :rows="teamRows" row-key="team_id" caption="Team rankings" sort-rows>
            <template #cell-pos="{ index }"><span class="font-heading text-base">{{ index + 1 }}</span></template>
            <template #cell-name="{ row }">
              <span class="flex items-center gap-2.5">
                <TeamLogo :tag="asTeam(row).tag" :logo-url="asTeam(row).logo_url" size="sm" decorative />
                <RouterLink :to="`/teams/${asTeam(row).team_id}`" class="truncate font-medium hover:text-accent">{{ asTeam(row).name }}</RouterLink>
              </span>
            </template>
            <template #cell-wins="{ row }"><span class="font-semibold">{{ asTeam(row).wins }}–{{ asTeam(row).losses }}</span></template>
            <template #cell-maps_won="{ row }">{{ asTeam(row).maps_won }}–{{ asTeam(row).maps_lost }}</template>
            <template #cell-map_diff="{ row }">
              <span :class="asTeam(row).map_diff > 0 ? 'text-win' : asTeam(row).map_diff < 0 ? 'text-loss' : ''">{{ asTeam(row).map_diff > 0 ? '+' : '' }}{{ asTeam(row).map_diff }}</span>
            </template>
            <template #cell-win_pct="{ row }">{{ asTeam(row).win_pct }}%</template>
          </UiTable>
          <p class="text-xs text-muted">Regular season only. Win % is series won out of series played.</p>
        </template>
      </div>

      <!-- Hall of Champions -->
      <div v-else-if="section === 'champions'">
        <UiSkeleton v-if="championsLoading" :lines="6" />
        <UiEmptyState
          v-else-if="!champions.length"
          title="No champions yet"
          :description="`${seasons[seasons.length - 1]?.name ?? 'Season 1'}'s champion will be crowned here.`"
        />
        <ul v-else class="grid gap-4 md:grid-cols-2">
          <li
            v-for="c in champions"
            :key="`${c.season_id}-${c.team_id}`"
            class="card-accent texture-stripes rounded-xl border border-line bg-surface p-6"
          >
            <p class="eyebrow-line text-faint">{{ c.season_name }}<template v-if="c.division_name"> · {{ c.division_name }}</template></p>
            <div class="mt-4 flex items-center gap-4">
              <TeamLogo :tag="c.team_tag" :logo-url="c.logo_url" size="xl" decorative />
              <div class="min-w-0">
                <RouterLink :to="`/teams/${c.team_id}`" class="block truncate font-heading text-3xl hover:text-accent">{{ c.team_name }}</RouterLink>
                <p class="tnum text-sm text-muted">
                  Beat {{ c.opponent_tag }} <span class="font-heading text-text">{{ c.champion_series }}–{{ c.opponent_series }}</span> ·
                  {{ formatLeagueTime(c.final_at) }}
                </p>
              </div>
            </div>
            <ul v-if="c.starters.length" class="mt-4 flex flex-wrap gap-2" aria-label="Starters in the final">
              <li v-for="p in c.starters" :key="p" class="rounded-full bg-chip px-3 py-1 text-sm text-text">{{ p }}</li>
            </ul>
          </li>
        </ul>
      </div>
      </template>
      </UiTabs>
    </UiLoadGate>
  </div>
</template>

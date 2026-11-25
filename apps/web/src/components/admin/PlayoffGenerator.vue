<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import type { AdminTeam, Division } from '@/composables/useSeasonAdmin'
import { useSeasonMatches } from '@/composables/useSeasonMatches'
import { useToast } from '@/composables/useToast'
import { computeStandings } from '@/lib/standings'
import { playoffPairs } from '@/lib/schedule'
import { formatLeagueTime, zonedToUtc } from '@/lib/time'
import type { Database } from '@/types/database'

const props = defineProps<{
  season: Database['public']['Tables']['seasons']['Row']
  divisions: Division[]
  teams: AdminTeam[]
  canEdit: boolean
}>()

const toast = useToast()
const sm = useSeasonMatches(() => props.season.id)

const divisionId = ref('')
watch(
  () => props.divisions,
  (d) => (divisionId.value = d[0]?.id ?? ''),
  { immediate: true },
)
const divisionOptions = computed(() =>
  props.divisions.length ? props.divisions.map((d) => ({ value: d.id, label: d.name })) : [{ value: '', label: 'Whole league' }],
)
const divTeams = computed(() => props.teams.filter((t) => (props.divisions.length ? t.divisionId === divisionId.value : true)))
const name = (id: string) => props.teams.find((t) => t.id === id)?.name ?? 'Unknown'

// Seeds from standings (rule 5.5), adjustable when the tiebreaks run out.
const standings = computed(() =>
  computeStandings(
    divTeams.value.map((t) => ({ id: t.id, name: t.name })),
    sm.results.value.filter((r) => (r.divisionId ?? '') === divisionId.value),
  ),
)
const seeds = ref<string[]>([])
watch(standings, (s) => (seeds.value = s.slice(0, props.season.playoff_teams).map((r) => r.teamId)), { immediate: true })
const needsDecision = computed(() => standings.value.filter((s) => s.needsAdminDecision).map((s) => s.teamId))
function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= seeds.value.length) return
  const next = [...seeds.value]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  seeds.value = next
}

const playoffMatches = computed(() =>
  sm.matches.value.filter((m) => m.stage === 'playoff' && (m.divisionId ?? '') === divisionId.value),
)
const rounds = computed(() => [...new Set(playoffMatches.value.map((m) => m.playoffRound ?? 1))].sort())
const lastRound = computed(() => rounds.value.at(-1) ?? 0)
const lastRoundMatches = computed(() =>
  playoffMatches.value
    .filter((m) => m.playoffRound === lastRound.value)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id)),
)
const lastRoundDone = computed(() => lastRoundMatches.value.length > 0 && lastRoundMatches.value.every((m) => m.winnerTeamId))

// Next round's pairs: round 1 from seeds, later rounds from winners (adjustable).
const pairs = ref<[string, string][]>([])
watch(
  [seeds, lastRoundMatches, lastRound],
  () => {
    if (lastRound.value === 0) {
      pairs.value = seeds.value.length === props.season.playoff_teams ? playoffPairs(seeds.value) : []
    } else {
      const winners = lastRoundMatches.value.map((m) => m.winnerTeamId ?? '')
      pairs.value = []
      for (let i = 0; i + 1 < winners.length; i += 2) pairs.value.push([winners[i]!, winners[i + 1]!])
    }
  },
  { immediate: true },
)
const roundName = (r: number, total = Math.log2(props.season.playoff_teams)) =>
  r === total ? 'Final' : r === total - 1 ? 'Semifinals' : r === total - 2 ? 'Quarterfinals' : `Round ${r}`
const nextRound = computed(() => lastRound.value + 1)
const finished = computed(() => lastRound.value >= Math.log2(props.season.playoff_teams) && lastRoundDone.value)

const date = ref('')
const time = ref(props.season.match_time.slice(0, 5))
const teamOptions = computed(() => divTeams.value.map((t) => ({ value: t.id, label: t.name })))

async function create() {
  if (!date.value) return toast.error('Pick a date for this round.')
  const at = zonedToUtc(date.value, time.value, props.season.timezone).toISOString()
  const rows = pairs.value.map(([home, away]) => ({
    division_id: divisionId.value || null,
    week: props.season.regular_weeks + nextRound.value,
    stage: 'playoff' as const,
    playoff_round: nextRound.value,
    home_team_id: home,
    away_team_id: away,
    default_at: at,
  }))
  if (rows.some((r) => !r.home_team_id || !r.away_team_id || r.home_team_id === r.away_team_id)) {
    return toast.error('Every match needs two different teams.')
  }
  const r = await sm.createMatches(rows, false)
  if (!r.ok) return toast.error(r.message)
  toast.success(`${roundName(nextRound.value)} created.`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-3">
      <div class="w-56">
        <UiSelect v-model="divisionId" label="Division" :options="divisionOptions" :disabled="divisions.length === 0" />
      </div>
      <p class="pb-2 text-sm text-muted">Top {{ season.playoff_teams }}, single elimination. The higher seed is the home team.</p>
    </div>

    <UiEmptyState v-if="divTeams.length < season.playoff_teams" title="Not enough teams for the bracket" :description="`This division has ${divTeams.length} approved teams; the bracket needs ${season.playoff_teams}. Change the playoff size on the Season tab.`" />

    <template v-else>
      <!-- Seeds (round 1 only) -->
      <section v-if="lastRound === 0" aria-labelledby="seeds-title">
        <h3 id="seeds-title" class="font-heading text-xl">Seeds</h3>
        <p class="mt-1 text-sm text-muted">
          From the standings: series wins, map differential, head-to-head, deciding-map rounds. Teams flagged
          as tied after every tiebreak need an admin decision; use the arrows to set their order.
        </p>
        <ol class="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          <li v-for="(id, i) in seeds" :key="id" class="flex items-center gap-3 px-4 py-2 text-sm">
            <span class="tnum w-6 font-mono text-accent">{{ i + 1 }}</span>
            <span class="flex-1">{{ name(id) }}</span>
            <UiBadge v-if="needsDecision.includes(id)" variant="accent">Tied: admin decides</UiBadge>
            <span v-if="canEdit" class="flex gap-1">
              <UiButton size="sm" variant="ghost" :disabled="i === 0" @click="move(i, -1)">↑<span class="sr-only"> Move {{ name(id) }} up</span></UiButton>
              <UiButton size="sm" variant="ghost" :disabled="i === seeds.length - 1" @click="move(i, 1)">↓<span class="sr-only"> Move {{ name(id) }} down</span></UiButton>
            </span>
          </li>
        </ol>
      </section>

      <!-- Existing rounds -->
      <section v-for="r in rounds" :key="r" :aria-labelledby="`round-${r}`">
        <h3 :id="`round-${r}`" class="font-heading text-xl">{{ roundName(r) }}</h3>
        <ul class="mt-2 flex flex-col gap-2">
          <li v-for="m in playoffMatches.filter((x) => x.playoffRound === r)" :key="m.id" class="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5 text-sm">
            <span class="flex-1">{{ name(m.homeTeamId) }} <span class="text-muted">vs</span> {{ name(m.awayTeamId) }}</span>
            <span class="text-xs text-muted">{{ formatLeagueTime(m.scheduledAt, season.timezone) }}</span>
            <UiBadge v-if="m.winnerTeamId" variant="win">{{ name(m.winnerTeamId) }} won</UiBadge>
            <UiBadge v-else>{{ m.status }}</UiBadge>
          </li>
        </ul>
      </section>

      <!-- Create the next round -->
      <section v-if="canEdit && !finished && (lastRound === 0 || lastRoundDone)" aria-labelledby="next-title" class="rounded-lg border border-line bg-surface p-5">
        <h3 id="next-title" class="font-heading text-xl">Create {{ roundName(nextRound) }}</h3>
        <ul class="mt-3 flex flex-col gap-3">
          <li v-for="(p, i) in pairs" :key="i" class="grid gap-2 sm:grid-cols-2">
            <UiSelect v-model="p[0]" :label="`Match ${i + 1} home`" :options="teamOptions" />
            <UiSelect v-model="p[1]" :label="`Match ${i + 1} away`" :options="teamOptions" />
          </li>
        </ul>
        <div class="mt-4 grid gap-3 sm:grid-cols-[12rem_10rem_auto] sm:items-end">
          <UiInput v-model="date" type="date" label="Date (ET)" />
          <UiInput v-model="time" type="time" label="Time (ET)" />
          <UiButton :loading="sm.busy.value" @click="create">Create {{ roundName(nextRound) }}</UiButton>
        </div>
      </section>
      <p v-else-if="lastRound > 0 && !lastRoundDone" class="text-sm text-muted">
        The next round can be created once every {{ roundName(lastRound) }} match has a confirmed winner.
      </p>
    </template>
  </div>
</template>

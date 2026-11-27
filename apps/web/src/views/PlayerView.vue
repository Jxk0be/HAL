<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import RankBadge from '@/components/players/RankBadge.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import KdTrendChart from '@/components/players/KdTrendChart.vue'
import { usePlayer } from '@/composables/useDirectory'
import { usePlayerBreakdown, usePlayerStats } from '@/composables/useStats'
import { site } from '@/config/site'
import { bestBy, formatKd, percent, type NamedLine } from '@/lib/playerStats'
import { profileColorVar, SOCIALS } from '@/lib/profileExtras'

const route = useRoute()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { player, rank, extras, freeAgentPost, loading } = usePlayer(id)
// The role they set under Customize, else the one on their free agent post.
const mainRole = computed(() => extras.value?.mainRole ?? freeAgentPost.value?.role ?? null)
const { rows: seasons, history } = usePlayerStats(id)
const current = computed(() => seasons.value[0] ?? null)
// Career totals, modes and maps across every season; the trend is this season's weeks.
const { breakdown: career } = usePlayerBreakdown(id)
const { breakdown: thisSeason } = usePlayerBreakdown(id, () => current.value?.season_id ?? null)

const accent = computed(() => profileColorVar(extras.value?.color))
const headerStyle = computed(() => ({
  borderTopColor: accent.value,
  backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${accent.value} 14%, transparent), transparent 70%)`,
}))
const socials = computed(() =>
  SOCIALS.flatMap((s) => {
    const handle = extras.value?.socials[s.key]
    return handle ? [{ key: s.key, label: s.label, handle, url: s.url(handle) }] : []
  }),
)
const record = computed(() => career.value.career)
const groups = computed(() => [
  { title: 'Modes', rows: career.value.modes, best: bestBy(career.value.modes) },
  { title: 'Maps', rows: career.value.maps, best: bestBy(career.value.maps) },
])
const lineKd = (l: NamedLine) => formatKd(l.kills, l.deaths)

const roleLabel = computed(() => {
  const p = player.value
  if (!p?.team) return ''
  if (p.isCaptain) return 'Captain'
  if (p.isCoCaptain) return 'Co-captain'
  return p.teamRole === 'sub' ? 'Sub' : 'Starter'
})

watch(player, (p) => {
  if (p) document.title = `${p.name} · ${site.shortName}`
})

const statSlots = computed(() => {
  const s = current.value
  return [
    { label: 'K/D', value: s?.kd != null ? Number(s.kd).toFixed(2) : '—' },
    { label: '+/-', value: s?.plus_minus != null ? (s.plus_minus > 0 ? `+${s.plus_minus}` : String(s.plus_minus)) : '—' },
    { label: 'Avg score', value: s?.avg_score != null ? s.avg_score.toLocaleString() : '—' },
    { label: 'Maps played', value: s?.maps_played != null ? String(s.maps_played) : '—' },
  ]
})
</script>

<template>
  <div>
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-14 sm:px-6"><UiSkeleton :lines="6" /></div>
    <div v-else-if="!player" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Player not found" description="This player doesn't exist or hasn't set up their profile.">
        <UiButton to="/players" variant="secondary">All players</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <section class="border-b border-t-4 border-line" :style="headerStyle" aria-labelledby="player-name">
        <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14">
          <UiAvatar :src="player.avatarUrl" :name="player.name" size="lg" decorative />
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-accent">Player</p>
            <h1 id="player-name" class="mt-1 truncate font-heading text-4xl sm:text-5xl">{{ player.name }}</h1>
            <p class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <PlatformBadge :platform="player.platform" />
              <RankBadge :rank="rank?.rank" :exception-at="rank?.exceptionAt" />
              <span v-if="player.discordUsername">{{ player.activisionId }}</span>
              <UiBadge v-if="mainRole" variant="outline">{{ mainRole }}</UiBadge>
              <UiBadge v-if="player.banned" variant="loss">Banned</UiBadge>
              <UiBadge v-else-if="player.isFreeAgent" variant="win">Free agent</UiBadge>
            </p>
            <p v-if="extras?.bio" class="mt-4 max-w-2xl text-sm whitespace-pre-line text-text">{{ extras.bio }}</p>
            <ul v-if="socials.length" class="mt-4 flex flex-wrap gap-2" aria-label="Socials">
              <li v-for="s in socials" :key="s.key">
                <a
                  :href="s.url"
                  target="_blank"
                  rel="noopener noreferrer me"
                  class="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs hover:border-line-strong hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span class="font-medium">{{ s.label }}</span>
                  <span class="text-muted">{{ s.key === 'twitch' ? s.handle : '@' + s.handle }}</span>
                  <span class="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[20rem_1fr]">
        <div class="flex flex-col gap-6">
        <UiCard eyebrow="This season" title="Team">
          <RouterLink v-if="player.team" :to="`/teams/${player.team.id}`" class="flex items-center gap-3 hover:text-accent">
            <TeamLogo :tag="player.team.tag" :name="player.team.name" :logo-url="player.team.logoUrl" decorative />
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ player.team.name }}</span>
              <span class="text-xs text-muted">{{ roleLabel }}</span>
            </span>
          </RouterLink>
          <p v-else class="text-sm text-muted">
            {{ player.isFreeAgent ? 'Free agent, looking for a team.' : 'Not on a team.' }}
            <RouterLink v-if="player.isFreeAgent" to="/free-agents" class="text-accent hover:text-accent-strong">See free agents</RouterLink>
          </p>
        </UiCard>
        <UiCard v-if="freeAgentPost" eyebrow="Free agent" title="Looking for a team">
          <dl class="flex flex-col gap-3 text-sm">
            <div v-if="freeAgentPost.role">
              <dt class="eyebrow text-muted">Role</dt>
              <dd class="mt-0.5">{{ freeAgentPost.role }}</dd>
            </div>
            <div v-if="freeAgentPost.availability">
              <dt class="eyebrow text-muted">Availability</dt>
              <dd class="mt-0.5 whitespace-pre-line">{{ freeAgentPost.availability }}</dd>
            </div>
            <div v-if="freeAgentPost.note">
              <dt class="eyebrow text-muted">About</dt>
              <dd class="mt-0.5 whitespace-pre-line">{{ freeAgentPost.note }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-muted">Posted <LeagueTime :iso="freeAgentPost.updatedAt" /></p>
        </UiCard>
        <UiCard eyebrow="All seasons" title="Career">
          <p v-if="!record.matches" class="text-sm text-muted">No league matches yet.</p>
          <template v-else>
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="eyebrow text-muted">Record</dt>
                <dd class="tnum mt-0.5 font-heading text-2xl">{{ record.wins }}–{{ record.losses }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">Win rate</dt>
                <dd class="tnum mt-0.5 font-heading text-2xl">{{ percent(record.wins, record.wins + record.losses) }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">K/D</dt>
                <dd class="tnum mt-0.5 font-heading text-2xl">{{ formatKd(record.kills, record.deaths) }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">Match MVPs</dt>
                <dd class="tnum mt-0.5 font-heading text-2xl">{{ record.mvps }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">Maps won</dt>
                <dd class="tnum mt-0.5">{{ record.map_wins }} of {{ record.maps }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">Seasons</dt>
                <dd class="tnum mt-0.5">{{ record.seasons }}</dd>
              </div>
            </dl>
            <p class="mt-3 text-xs text-muted">MVP means the top score in the match, both teams. Preseason doesn't count.</p>
            <div v-if="career.best_match" class="mt-4 border-t border-line pt-4 text-sm">
              <p class="eyebrow text-muted">Best match</p>
              <RouterLink :to="`/matches/${career.best_match.match_id}`" class="mt-1 block hover:text-accent">
                <span class="tnum font-heading text-xl">{{ career.best_match.kills }}–{{ career.best_match.deaths }}</span>
                <span class="text-muted"> vs {{ career.best_match.opponent ?? 'Unknown' }}</span>
              </RouterLink>
              <p class="text-xs text-muted">
                {{ career.best_match.maps }} {{ career.best_match.maps === 1 ? 'map' : 'maps' }} ·
                <LeagueTime :iso="career.best_match.scheduled_at" />
              </p>
            </div>
          </template>
        </UiCard>
        </div>

        <div class="flex flex-col gap-6">
          <section aria-labelledby="stats-title">
            <h2 id="stats-title" class="eyebrow mb-3 text-accent">Season stats</h2>
            <dl class="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4" style="gap: 1px">
              <div v-for="s in statSlots" :key="s.label" class="bg-surface p-4">
                <dt class="eyebrow text-muted">{{ s.label }}</dt>
                <dd class="tnum mt-1 font-heading text-2xl" :class="s.value === '—' ? 'text-faint' : ''">{{ s.value }}</dd>
              </div>
            </dl>
            <p class="mt-2 text-xs text-muted">
              <template v-if="current">
                {{ current.kills }} kills, {{ current.deaths }} deaths across {{ current.maps_played }} maps.
              </template>
              <template v-else>Stats fill in once matches are confirmed.</template>
            </p>
          </section>
          <UiCard v-if="thisSeason.weeks.length" eyebrow="This season" title="K/D by week">
            <KdTrendChart :weeks="thisSeason.weeks" :color="accent" />
          </UiCard>
          <div v-if="career.modes.length" class="grid gap-6 md:grid-cols-2">
            <UiCard v-for="group in groups" :key="group.title" eyebrow="All seasons" :title="group.title">
              <table class="w-full text-sm">
                <caption class="sr-only">{{ group.title }}: maps played, K/D, average score and wins</caption>
                <thead>
                  <tr class="text-left text-xs text-muted">
                    <th scope="col" class="pb-2 font-normal">{{ group.title === 'Modes' ? 'Mode' : 'Map' }}</th>
                    <th scope="col" class="pb-2 text-right font-normal">Played</th>
                    <th scope="col" class="pb-2 text-right font-normal">K/D</th>
                    <th scope="col" class="pb-2 text-right font-normal">Avg</th>
                    <th scope="col" class="pb-2 text-right font-normal">Won</th>
                  </tr>
                </thead>
                <tbody class="tnum">
                  <tr v-for="l in group.rows.slice(0, 8)" :key="l.name" class="border-t border-line">
                    <th scope="row" class="py-1.5 text-left font-normal">
                      {{ l.name }}<span v-if="group.best?.name === l.name" class="ml-1 text-xs text-accent">best</span>
                    </th>
                    <td class="py-1.5 text-right">{{ l.maps }}</td>
                    <td class="py-1.5 text-right">{{ lineKd(l) }}</td>
                    <td class="py-1.5 text-right">{{ l.avg_score.toLocaleString() }}</td>
                    <td class="py-1.5 text-right">{{ l.wins }}</td>
                  </tr>
                </tbody>
              </table>
            </UiCard>
          </div>
          <UiCard eyebrow="Matches" title="Match history">
            <p v-if="!history.length" class="text-sm text-muted">No matches played yet.</p>
            <ul v-else class="flex flex-col gap-3 text-sm">
              <li v-for="h in history" :key="h.matchId" class="flex flex-wrap items-center gap-3">
                <span
                  v-if="h.won !== null"
                  class="grid size-6 place-items-center rounded-sm font-heading text-xs"
                  :class="h.won ? 'bg-win-soft text-win' : 'bg-loss-soft text-loss'"
                  :aria-label="h.won ? 'Win' : 'Loss'"
                >{{ h.won ? 'W' : 'L' }}</span>
                <RouterLink :to="`/matches/${h.matchId}`" class="min-w-0 flex-1 truncate hover:text-accent">vs {{ h.opponent }}</RouterLink>
                <span class="tnum text-xs text-muted">{{ h.kills }}–{{ h.deaths }} over {{ h.maps }} {{ h.maps === 1 ? 'map' : 'maps' }}</span>
                <span class="text-xs text-muted"><LeagueTime :iso="h.scheduledAt" /></span>
              </li>
            </ul>
          </UiCard>
        </div>
      </div>
    </template>
  </div>
</template>

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
import { usePlayer } from '@/composables/useDirectory'
import { usePlayerStats } from '@/composables/useStats'
import { site } from '@/config/site'

const route = useRoute()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { player, rank, loading } = usePlayer(id)
const { rows: seasons, history } = usePlayerStats(id)
const current = computed(() => seasons.value[0] ?? null)

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
      <section class="border-b border-line" aria-labelledby="player-name">
        <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14">
          <UiAvatar :src="player.avatarUrl" :name="player.name" size="lg" decorative />
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-accent">Player</p>
            <h1 id="player-name" class="mt-1 truncate font-heading text-4xl sm:text-5xl">{{ player.name }}</h1>
            <p class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <PlatformBadge :platform="player.platform" />
              <RankBadge :rank="rank?.rank" :exception-at="rank?.exceptionAt" />
              <span v-if="player.discordUsername">{{ player.activisionId }}</span>
              <UiBadge v-if="player.banned" variant="loss">Banned</UiBadge>
              <UiBadge v-else-if="player.isFreeAgent" variant="win">Free agent</UiBadge>
            </p>
          </div>
        </div>
      </section>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[20rem_1fr]">
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

<script setup lang="ts">
import { computed } from 'vue'
import HalWordmark from '@/components/brand/HalWordmark.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import MatchCard from '@/components/match/MatchCard.vue'
import StandingsTable from '@/components/stats/StandingsTable.vue'
import { site } from '@/config/site'
import { homeContent as c } from '@/content/home'
import { currentWeek, useSeasonSchedule } from '@/composables/useMatches'
import { useLeaderboards, useStandings } from '@/composables/useStats'
import { useLiveBroadcasts } from '@/composables/useBroadcasts'
import { streamPlatform } from '@/lib/broadcast'
import { formatLeagueTime, toZoned } from '@/lib/time'

const { season, matches, loading } = useSeasonSchedule()
const seasonId = computed(() => season.value?.id)
const { rows: standings } = useStandings(seasonId, () => null)
const { boards } = useLeaderboards(seasonId, 1)
const { live } = useLiveBroadcasts()

const now = Date.now()
const week = computed(() => (matches.value.length ? currentWeek(matches.value, now) : null))
const inSeason = computed(() => season.value?.status === 'regular' || season.value?.status === 'playoffs')

// Tonight (league date) or the next match night.
const upcoming = computed(() =>
  matches.value
    .filter((m) => new Date(m.scheduledAt).getTime() > now - 3 * 3600_000 && !['confirmed', 'forfeit', 'cancelled'].includes(m.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
)
const nextNight = computed(() => {
  const first = upcoming.value[0]
  if (!first) return null
  const date = toZoned(first.scheduledAt, season.value?.timezone).date
  return {
    date,
    isTonight: date === toZoned(new Date(now).toISOString(), season.value?.timezone).date,
    startsAt: first.scheduledAt,
    matches: upcoming.value.filter((m) => toZoned(m.scheduledAt, season.value?.timezone).date === date),
  }
})
const latest = computed(() =>
  matches.value
    .filter((m) => m.status === 'confirmed' || m.status === 'forfeit')
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 4),
)
const leaders = computed(() =>
  [
    { label: 'K/D', row: boards.value.kd[0], value: (boards.value.kd[0]?.kd ?? 0).toFixed(2) },
    { label: 'Kills', row: boards.value.kills[0], value: String(boards.value.kills[0]?.kills ?? 0) },
    { label: 'Avg score', row: boards.value.avg_score[0], value: (boards.value.avg_score[0]?.avg_score ?? 0).toLocaleString() },
  ].filter((l) => l.row),
)
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden border-b border-line" aria-labelledby="home-title">
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <!-- Soft halo glow behind the logo -->
        <div class="absolute top-1/2 right-[8%] hidden size-[520px] -translate-y-1/2 rounded-full bg-gold/10 blur-3xl lg:block" />
      </div>
      <div class="relative mx-auto grid max-w-7xl gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <div class="mb-8 flex justify-center lg:hidden"><HalWordmark :size="150" decorative /></div>
          <UiBadge variant="gold">
            <template v-if="season && inSeason && week">{{ season.name }} · Week {{ week }}</template>
            <template v-else-if="season">{{ season.name }} · {{ season.status === 'signups' ? 'Signups open' : season.status }}</template>
            <template v-else>{{ c.status }}</template>
          </UiBadge>
          <p class="eyebrow mt-6 text-muted">{{ c.eyebrow }}</p>
          <h1 id="home-title" class="mt-3 font-heading text-5xl leading-[0.95] sm:text-7xl">{{ c.headline }}</h1>
          <p class="mt-6 max-w-xl text-lg text-muted">{{ c.intro }}</p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UiButton :href="site.discordInviteUrl" size="lg">Join the Discord</UiButton>
            <UiButton :to="inSeason ? '/matches' : '/rules'" variant="secondary" size="lg">{{ inSeason ? 'See the schedule' : 'Read the rules' }}</UiButton>
          </div>
        </div>
        <div class="relative hidden justify-center lg:flex"><HalWordmark :size="330" decorative /></div>
      </div>
    </section>

    <div class="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-14 sm:px-6">
      <!-- Live now -->
      <section v-if="live.length" aria-labelledby="live-title">
        <h2 id="live-title" class="mb-4 flex items-center gap-2 font-heading text-2xl">
          <span class="size-2.5 animate-pulse rounded-full bg-live motion-reduce:animate-none" aria-hidden="true" />
          Live now
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="b in live" :key="b.matchId" class="flex items-center gap-3 rounded-lg border border-gold-dim bg-surface p-4">
            <span class="min-w-0 flex-1">
              <RouterLink :to="`/matches/${b.matchId}`" class="block truncate font-heading text-lg hover:text-gold">{{ b.homeTag }} vs {{ b.awayTag }}</RouterLink>
              <span class="block truncate text-xs text-muted">Cast by {{ b.caster }} on {{ streamPlatform(b.url) }}</span>
            </span>
            <UiButton :href="b.url" size="sm">Watch<span class="sr-only"> {{ b.homeName }} vs {{ b.awayName }}</span></UiButton>
          </li>
        </ul>
      </section>

      <!-- Next match night -->
      <section v-if="loading || nextNight" aria-labelledby="next-title">
        <UiSkeleton v-if="loading" :lines="3" />
        <template v-else-if="nextNight">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="eyebrow text-gold">{{ nextNight.isTonight ? "Tonight's matches" : 'Next match night' }}</p>
              <h2 id="next-title" class="mt-1 font-heading text-3xl">{{ formatLeagueTime(nextNight.startsAt, season?.timezone) }}</h2>
            </div>
            <UiCountdown :to="nextNight.startsAt" ended-label="Matches are on" />
          </div>
          <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="m in nextNight.matches" :key="m.id"><MatchCard :match="m" /></li>
          </ul>
        </template>
      </section>

      <div v-if="latest.length || standings.length" class="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <!-- Latest results -->
        <section v-if="latest.length" aria-labelledby="results-title">
          <div class="mb-4 flex items-end justify-between">
            <h2 id="results-title" class="font-heading text-2xl">Latest results</h2>
            <RouterLink to="/matches" class="text-sm text-gold hover:text-gold-strong">All matches →</RouterLink>
          </div>
          <ul class="grid gap-4 sm:grid-cols-2">
            <li v-for="m in latest" :key="m.id"><MatchCard :match="m" compact /></li>
          </ul>
        </section>

        <!-- Standings snapshot + leaders -->
        <div class="flex flex-col gap-8">
          <section v-if="standings.length" aria-labelledby="top-title">
            <div class="mb-4 flex items-end justify-between">
              <h2 id="top-title" class="font-heading text-2xl">Top of the table</h2>
              <RouterLink to="/standings" class="text-sm text-gold hover:text-gold-strong">Standings →</RouterLink>
            </div>
            <StandingsTable :rows="standings.slice(0, 3)" :cutoff="0" caption="Top 3 teams" compact />
          </section>
          <section v-if="leaders.length" aria-labelledby="leaders-title">
            <h2 id="leaders-title" class="mb-4 font-heading text-2xl">Season leaders</h2>
            <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              <div v-for="l in leaders" :key="l.label" class="bg-surface p-4">
                <dt class="eyebrow text-muted">{{ l.label }}</dt>
                <dd class="tnum mt-1 font-heading text-2xl text-gold">{{ l.value }}</dd>
                <dd class="mt-1 truncate text-xs">
                  <RouterLink :to="`/players/${l.row?.user_id}`" class="hover:text-gold">{{ l.row?.activision_id }}</RouterLink>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <!-- League pillars (before the season has results) -->
      <section v-if="!latest.length" aria-labelledby="pillars-title">
        <p class="eyebrow text-gold">The league</p>
        <h2 id="pillars-title" class="mt-2 font-heading text-3xl sm:text-4xl">Built like a pro circuit</h2>
        <div class="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          <article v-for="(p, i) in c.pillars" :key="p.title" class="bg-surface p-6 sm:p-8">
            <p class="tnum font-heading text-sm text-gold" aria-hidden="true">0{{ i + 1 }}</p>
            <h3 class="mt-3 font-heading text-xl">{{ p.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">{{ p.body }}</p>
          </article>
        </div>
      </section>

      <!-- Discord CTA -->
      <section aria-labelledby="cta-title" class="flex flex-col gap-6 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 id="cta-title" class="font-heading text-2xl">Want in?</h2>
          <p class="mt-1 max-w-lg text-sm text-muted">
            Join the Discord for announcements, match nights and free agents. Log in to land on the free agent list or build a team.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
          <UiButton to="/free-agents" variant="secondary">Free agents</UiButton>
        </div>
      </section>
    </div>
  </div>
</template>

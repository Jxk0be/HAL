<script setup lang="ts">
import { computed } from 'vue'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import { useReady } from '@/composables/useReady'
import MatchCard from '@/components/match/MatchCard.vue'
import StandingsTable from '@/components/stats/StandingsTable.vue'
import { site } from '@/config/site'
import { homeContent as c } from '@/content/home'
import { currentWeek, useSeasonSchedule } from '@/composables/useMatches'
import { useLeaderboards, useStandings } from '@/composables/useStats'
import { useLiveBroadcasts } from '@/composables/useBroadcasts'
import { streamPlatform } from '@/lib/broadcast'
import { formatLeagueTime, toZoned } from '@/lib/time'
import { ArrowRight } from 'lucide-vue-next'
import DiscordGlyph from '@/components/brand/DiscordGlyph.vue'
import ResultsTicker from '@/components/layout/ResultsTicker.vue'
import HeroBackdrop from '@/components/home/HeroBackdrop.vue'
import { navIcons } from '@/components/layout/navIcons'
import { useSiteCounts } from '@/composables/useStats'
import { useRecentResults } from '@/composables/useRecentResults'
import { useAuthStore } from '@/stores/auth'
import type { NavIcon } from '@/config/site'

const auth = useAuthStore()
const { counts, loading: countsLoading } = useSiteCounts()
const { results: recentResults, loaded: resultsLoaded } = useRecentResults()
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const featureIcon = (icon: string) => (icon === 'discord' ? DiscordGlyph : navIcons[icon as NavIcon])

const { season, matches, loading } = useSeasonSchedule()
const seasonId = computed(() => season.value?.id)
const { rows: standings, loading: standingsLoading } = useStandings(seasonId, () => null)
const { boards, loading: boardsLoading } = useLeaderboards(seasonId, 1)
const { live, loaded: liveLoaded } = useLiveBroadcasts()

// Render the page only once everything on it has arrived, so sections never pop in or swap.
const ready = useReady(
  () =>
    loading.value ||
    standingsLoading.value ||
    boardsLoading.value ||
    !liveLoaded.value ||
    (!auth.isSignedIn && (countsLoading.value || !resultsLoaded.value)),
)

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
  <UiLoadGate :ready="ready" label="Loading the home page…">
    <template #skeleton>
      <div class="border-b border-line">
        <div class="mx-auto flex max-w-4xl flex-col items-center gap-5 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24" :class="auth.isSignedIn ? 'lg:max-w-7xl lg:items-start' : ''">
          <div v-if="!auth.isSignedIn" class="skeleton size-40 rounded-2xl" />
          <div v-else class="skeleton h-20 w-full max-w-xl rounded-xl" />
          <div class="skeleton h-3 w-40 rounded-sm" />
          <div class="skeleton h-12 w-4/5 max-w-lg" />
          <div class="skeleton h-12 w-3/5 max-w-md" />
          <div class="skeleton h-4 w-full max-w-md rounded-sm" />
          <div class="mt-3 flex gap-3">
            <div class="skeleton h-12 w-40" />
            <div class="skeleton h-12 w-40" />
          </div>
        </div>
      </div>
      <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-14 sm:px-6">
        <div class="skeleton h-3 w-32 rounded-sm" />
        <div class="skeleton h-8 w-72 max-w-full" />
        <div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="n in 3" :key="n" class="skeleton h-36 rounded-xl" />
        </div>
      </div>
    </template>

    <!-- Logged out: landing hero -->
    <template v-if="!auth.isSignedIn">
      <div v-if="recentResults.length" class="h-11 border-b border-line bg-rail print:hidden"><div class="mx-auto flex h-full max-w-7xl px-2"><ResultsTicker /></div></div>
      <section class="relative isolate overflow-hidden border-b border-line bg-bg" aria-labelledby="home-title">
        <HeroBackdrop class="-z-10" />
        <div class="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-12 pb-16 text-center sm:px-6 sm:pt-16 sm:pb-24">
          <BrandLogo :size="220" variant="full" decorative />
          <p class="rise mt-8 flex items-center gap-3 eyebrow text-muted" style="--rise-delay: 80ms">
            <span class="h-px w-8 bg-accent sm:w-12" aria-hidden="true" />{{ c.hero.eyebrow }}<span class="h-px w-8 bg-accent sm:w-12" aria-hidden="true" />
          </p>
          <h1 id="home-title" class="title-xl mt-5 [text-shadow:0_4px_24px_rgb(0_0_0/0.6)]">
            <span class="rise inline-block" style="--rise-delay: 160ms">{{ c.hero.headline[0] }}</span><br /><span class="rise inline-block text-accent" style="--rise-delay: 260ms">{{ c.hero.headline[1] }}</span>
          </h1>
          <p class="rise mt-6 max-w-xl text-lg text-muted" style="--rise-delay: 380ms">{{ site.tagline }}</p>
          <ul class="rise mt-7 flex flex-wrap justify-center gap-2" style="--rise-delay: 480ms" aria-label="League at a glance">
            <template v-if="counts">
              <li class="tnum rounded-full border border-line bg-chip px-4 py-1.5 text-sm"><b class="font-heading text-text">{{ counts.players }}</b> <span class="text-muted">{{ plural(counts.players, 'player', 'players') }}</span></li>
              <li class="tnum rounded-full border border-line bg-chip px-4 py-1.5 text-sm"><b class="font-heading text-text">{{ counts.teams }}</b> <span class="text-muted">{{ plural(counts.teams, 'team', 'teams') }}</span></li>
              <li class="tnum rounded-full border border-line bg-chip px-4 py-1.5 text-sm"><b class="font-heading text-text">{{ counts.matches }}</b> <span class="text-muted">{{ plural(counts.matches, 'match played', 'matches played') }}</span></li>
            </template>
            <li>
              <a :href="site.discordInviteUrl" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 rounded-full bg-discord px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                <DiscordGlyph class="size-4" />Discord<span class="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
          <div class="rise mt-8 flex flex-wrap justify-center gap-3" style="--rise-delay: 580ms">
            <UiButton to="/login" size="lg">Join the league</UiButton>
            <UiButton to="/watch" variant="secondary" size="lg">Watch matches</UiButton>
          </div>
        </div>
      </section>
    </template>

    <!-- Signed in -->
    <template v-else>
      <section class="relative isolate overflow-hidden border-b border-line bg-bg" aria-labelledby="home-title">
        <HeroBackdrop class="-z-10" focus="right" />
        <div class="relative mx-auto grid max-w-7xl gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-14 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <RouterLink
              to="/dashboard"
              class="rise card-accent texture-stripes mb-8 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
            >
              <span>
                <span class="eyebrow block text-faint">Your dashboard</span>
                <span class="font-heading text-xl">Next match, to-dos and your team</span>
              </span>
              <ArrowRight class="size-5 shrink-0 text-accent" aria-hidden="true" />
            </RouterLink>
            <span class="rise inline-block" style="--rise-delay: 100ms"><UiBadge variant="accent">
              <template v-if="season && inSeason && week">{{ season.name }} · Week {{ week }}</template>
              <template v-else-if="season">{{ season.name }} · {{ season.status === 'signups' ? 'Signups open' : season.status }}</template>
              <template v-else>{{ c.status }}</template>
            </UiBadge></span>
            <p class="rise eyebrow-line mt-6 text-muted" style="--rise-delay: 160ms">{{ c.eyebrow }}</p>
            <h1 id="home-title" class="rise title-xl mt-3 [text-shadow:0_4px_24px_rgb(0_0_0/0.6)]" style="--rise-delay: 240ms">{{ c.headline }}</h1>
            <p class="rise mt-6 max-w-xl text-lg text-muted" style="--rise-delay: 340ms">{{ c.intro }}</p>
            <div class="rise mt-8 flex flex-wrap gap-3" style="--rise-delay: 440ms">
              <UiButton :to="inSeason ? '/matches' : '/season'" size="lg">{{ inSeason ? 'See the schedule' : 'Season hub' }}</UiButton>
              <UiButton :href="site.discordInviteUrl" variant="secondary" size="lg">Discord</UiButton>
            </div>
          </div>
          <div class="relative hidden justify-center lg:flex"><BrandLogo :size="360" variant="full" decorative /></div>
        </div>
      </section>
    </template>

    <div class="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-14 sm:px-6">
      <!-- Live now -->
      <section v-if="live.length" v-reveal aria-labelledby="live-title">
        <h2 id="live-title" class="mb-4 flex items-center gap-2 font-heading text-2xl">
          <span class="size-2.5 animate-pulse rounded-full bg-live motion-reduce:animate-none" aria-hidden="true" />
          Live now
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="b in live" :key="b.matchId" class="flex items-center gap-3 rounded-lg border border-accent-dim bg-surface p-4">
            <span class="min-w-0 flex-1">
              <RouterLink :to="`/matches/${b.matchId}`" class="block truncate font-heading text-lg hover:text-accent">{{ b.homeTag }} vs {{ b.awayTag }}</RouterLink>
              <span class="block truncate text-xs text-muted">Cast by {{ b.caster }} on {{ streamPlatform(b.url) }}</span>
            </span>
            <UiButton :to="{ path: '/watch', query: { match: b.matchId } }" size="sm">Watch<span class="sr-only"> {{ b.homeName }} vs {{ b.awayName }}</span></UiButton>
          </li>
        </ul>
      </section>

      <!-- Next match night -->
      <section v-if="nextNight" v-reveal aria-labelledby="next-title">
        <template v-if="nextNight">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="eyebrow text-accent">{{ nextNight.isTonight ? "Tonight's matches" : 'Next match night' }}</p>
              <h2 id="next-title" class="mt-1 font-heading text-3xl">{{ formatLeagueTime(nextNight.startsAt, season?.timezone) }}</h2>
            </div>
            <UiCountdown :to="nextNight.startsAt" ended-label="Matches are on" />
          </div>
          <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="(m, i) in nextNight.matches" :key="m.id" v-reveal="i * 70"><MatchCard :match="m" /></li>
          </ul>
        </template>
      </section>

      <div v-if="latest.length || standings.length" v-reveal class="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <!-- Latest results -->
        <section v-if="latest.length" aria-labelledby="results-title">
          <div class="mb-4 flex items-end justify-between">
            <h2 id="results-title" class="font-heading text-2xl">Latest results</h2>
            <RouterLink to="/matches" class="text-sm text-accent hover:text-accent-strong">All matches →</RouterLink>
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
              <RouterLink to="/standings" class="text-sm text-accent hover:text-accent-strong">Standings →</RouterLink>
            </div>
            <StandingsTable :rows="standings.slice(0, 3)" :cutoff="0" caption="Top 3 teams" compact />
          </section>
          <section v-if="leaders.length" aria-labelledby="leaders-title">
            <h2 id="leaders-title" class="mb-4 font-heading text-2xl">Season leaders</h2>
            <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              <div v-for="l in leaders" :key="l.label" class="bg-surface p-4">
                <dt class="eyebrow text-muted">{{ l.label }}</dt>
                <dd class="tnum mt-1 font-heading text-2xl text-accent">{{ l.value }}</dd>
                <dd class="mt-1 truncate text-xs">
                  <RouterLink :to="`/players/${l.row?.user_id}`" class="hover:text-accent">{{ l.row?.activision_id }}</RouterLink>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <!-- How the league works (visitors) -->
      <section v-if="!auth.isSignedIn" aria-labelledby="how-title">
        <div v-reveal>
          <p class="eyebrow-line text-faint">The league</p>
          <h2 id="how-title" class="mt-3 font-heading text-3xl sm:text-4xl">How the league works</h2>
        </div>
        <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="(f, i) in c.features" :key="f.title" v-reveal="(i % 3) * 90">
            <component
              :is="'discord' in f ? 'a' : 'RouterLink'"
              v-bind="'discord' in f ? { href: site.discordInviteUrl, target: '_blank', rel: 'noopener noreferrer' } : { to: f.to }"
              class="card-accent group flex h-full flex-col rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
              :style="i === 0 ? undefined : { '--card-accent': 'var(--color-line-strong)' }"
            >
              <span class="grid size-11 place-items-center rounded-lg bg-accent-soft text-accent">
                <component :is="featureIcon(f.icon)" class="size-5" aria-hidden="true" />
              </span>
              <h3 class="mt-4 font-heading text-xl">{{ f.title }}</h3>
              <p class="mt-2 flex-1 text-sm leading-relaxed text-muted">{{ f.body }}</p>
              <span class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                {{ 'discord' in f ? 'Join the Discord' : 'Learn more' }}
                <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </span>
            </component>
          </li>
        </ul>
      </section>

      <!-- League pillars (signed in, before the season has results) -->
      <section v-else-if="!latest.length" v-reveal aria-labelledby="pillars-title">
        <p class="eyebrow-line text-faint">The league</p>
        <h2 id="pillars-title" class="mt-3 font-heading text-3xl sm:text-4xl">Built like a pro circuit</h2>
        <div class="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          <article v-for="(p, i) in c.pillars" :key="p.title" class="bg-surface p-6 sm:p-8">
            <p class="tnum font-heading text-sm text-accent" aria-hidden="true">0{{ i + 1 }}</p>
            <h3 class="mt-3 font-heading text-xl">{{ p.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">{{ p.body }}</p>
          </article>
        </div>
      </section>

      <!-- CTA band -->
      <section
        v-if="!auth.isSignedIn"
        v-reveal
        aria-labelledby="cta-title"
        class="texture-stripes-brand flex flex-col gap-6 rounded-2xl bg-brand p-8 text-on-brand sm:flex-row sm:items-center sm:justify-between sm:p-10"
      >
        <div>
          <h2 id="cta-title" class="font-heading text-3xl sm:text-4xl">{{ c.cta.title }}</h2>
          <p class="mt-2 max-w-lg text-on-brand/85">{{ c.cta.body }}</p>
        </div>
        <RouterLink
          to="/login"
          class="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-bg px-6 font-heading tracking-wide text-text uppercase hover:bg-surface-2"
        >
          Join the league
        </RouterLink>
      </section>
      <section v-else v-reveal aria-labelledby="cta-title" class="flex flex-col gap-6 rounded-xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 id="cta-title" class="font-heading text-2xl">Looking for players?</h2>
          <p class="mt-1 max-w-lg text-sm text-muted">Free agents post on the board and in Discord. Captains can invite them while they have an open spot.</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <UiButton to="/free-agents">Free agents</UiButton>
          <UiButton :href="site.discordInviteUrl" variant="secondary">Join the Discord</UiButton>
        </div>
      </section>
    </div>
  </UiLoadGate>
</template>

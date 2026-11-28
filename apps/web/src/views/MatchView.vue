<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import { useReady } from '@/composables/useReady'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import MatchStatus from '@/components/match/MatchStatus.vue'
import ReportStatusPanel from '@/components/report/ReportStatusPanel.vue'
import DisputePanel from '@/components/match/DisputePanel.vue'
import RescheduleCard from '@/components/match/RescheduleCard.vue'
import CheckInCard from '@/components/match/CheckInCard.vue'
import EmergencySubCard from '@/components/match/EmergencySubCard.vue'
import ReplayCard from '@/components/match/ReplayCard.vue'
import { useMatchDetail } from '@/composables/useMatches'
import { useReportStatus } from '@/composables/useReport'
import { useAuthStore } from '@/stores/auth'
import { site } from '@/config/site'
import { streamPlatform } from '@/lib/broadcast'

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { match, maps, screenshots, checkins, dispute, loading, reload } = useMatchDetail(id)
// Only returned to the two teams and staff.
const { status: reportStatus, loading: statusLoading } = useReportStatus(id)
const ready = useReady(() => loading.value || statusLoading.value)

const mySide = computed(() => {
  const m = match.value
  const t = auth.team
  if (!m || !t) return null
  return t.id === m.home.id ? 'home' : t.id === m.away.id ? 'away' : null
})
const canReport = computed(() => {
  const m = match.value
  const t = auth.team
  return Boolean(
    m && t && mySide.value && (t.isCaptain || t.isCoCaptain)
      && !['confirmed', 'forfeit', 'cancelled'].includes(m.status)
      && new Date(m.scheduledAt).getTime() <= Date.now(),
  )
})
/** The viewer's team when they captain or co-captain one side of this match. */
const captainOf = computed(() => (mySide.value && (auth.team?.isCaptain || auth.team?.isCoCaptain) ? (auth.team?.id ?? null) : null))
/** Staff who can act here (not on either team). */
const neutralStaff = computed(() => auth.isAdmin && !mySide.value)
const iReported = computed(() =>
  Boolean(reportStatus.value && (mySide.value === 'home' ? reportStatus.value.homeReportedAt : reportStatus.value.awayReportedAt)),
)

const final = computed(() => match.value?.status === 'confirmed' || match.value?.status === 'forfeit')
/** Check-in is the one card that can need the viewer's action right now (red accent). */
const needsCheckin = computed(() => {
  const m = match.value
  if (!m || !captainOf.value) return false
  const start = new Date(m.scheduledAt).getTime()
  const now = Date.now()
  return now >= start - 15 * 60_000 && now <= start + 30 * 60_000 && !checkins.value.some((c) => c.teamId === captainOf.value)
})
const upcoming = computed(() => Boolean(match.value && new Date(match.value.scheduledAt).getTime() > Date.now()))
const series = (side: 'home' | 'away') => {
  const m = match.value
  if (!m) return null
  if (m.status === 'forfeit') return m.forfeitTeamId === m[side].id ? 0 : 3
  return side === 'home' ? m.homeSeries : m.awaySeries
}
const teamName = (teamId: string) =>
  match.value ? (match.value.home.id === teamId ? match.value.home.name : match.value.away.name) : ''
const kd = (k: number, d: number) => (d === 0 ? k.toFixed(2) : (k / d).toFixed(2))

watch(match, (m) => {
  if (m) document.title = `${m.home.tag} vs ${m.away.tag} · ${site.shortName}`
})
</script>

<template>
  <div>
    <div v-if="!ready" role="status" aria-busy="true">
      <span class="sr-only">Loading match…</span>
      <div class="border-b border-line bg-surface">
        <div class="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 py-10 sm:px-6 sm:py-14">
          <div class="flex w-full justify-between"><div class="skeleton h-4 w-32 rounded-sm" /><div class="skeleton h-6 w-20 rounded-full" /></div>
          <div class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div class="flex flex-col items-center gap-3"><div class="skeleton size-20 rounded-xl sm:size-24" /><div class="skeleton h-5 w-28 rounded-sm" /></div>
            <div class="skeleton h-14 w-24" />
            <div class="flex flex-col items-center gap-3"><div class="skeleton size-20 rounded-xl sm:size-24" /><div class="skeleton h-5 w-28 rounded-sm" /></div>
          </div>
          <div class="flex gap-2"><div v-for="n in 5" :key="n" class="skeleton h-10 w-24" /></div>
        </div>
      </div>
      <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6"><UiPageSkeleton variant="panel" /></div>
    </div>
    <div v-else-if="!match" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Match not found" description="This match doesn't exist or was removed.">
        <UiButton to="/matches" variant="secondary">All matches</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <!-- Scoreboard header -->
      <section class="texture-stripes relative overflow-hidden border-b border-line bg-surface" aria-labelledby="match-title">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-bg" aria-hidden="true" />
        <div class="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span class="eyebrow-line">
              <template v-if="match.stage === 'playoff'">Playoffs · </template>{{ weekLabel(match.week) }}
            </span>
            <MatchStatus :match="match" />
          </div>
          <h1 id="match-title" class="sr-only">{{ match.home.name }} vs {{ match.away.name }}</h1>
          <div class="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            <RouterLink :to="`/teams/${match.home.id}`" class="flex min-w-0 flex-col items-center gap-3 text-center hover:text-accent">
              <TeamLogo :tag="match.home.tag" :name="match.home.name" :logo-url="match.home.logoUrl" size="xl" decorative />
              <span class="w-full truncate font-heading text-lg sm:text-2xl">{{ match.home.name }}</span>
            </RouterLink>
            <div class="flex flex-col items-center text-center" :aria-label="final ? `Series ${series('home')} to ${series('away')}` : 'Not played yet'">
              <p v-if="final" class="title-xl tnum leading-none">
                <span :class="match.winnerTeamId === match.home.id ? 'text-accent' : 'text-muted'">{{ series('home') }}</span>
                <span class="mx-1 text-faint sm:mx-2">–</span>
                <span :class="match.winnerTeamId === match.away.id ? 'text-accent' : 'text-muted'">{{ series('away') }}</span>
              </p>
              <p v-else class="title-xl text-faint">VS</p>
            </div>
            <RouterLink :to="`/teams/${match.away.id}`" class="flex min-w-0 flex-col items-center gap-3 text-center hover:text-accent">
              <TeamLogo :tag="match.away.tag" :name="match.away.name" :logo-url="match.away.logoUrl" size="xl" decorative />
              <span class="w-full truncate font-heading text-lg sm:text-2xl">{{ match.away.name }}</span>
            </RouterLink>
          </div>
          <div class="mt-6 flex flex-col items-center gap-2 text-center">
            <p class="text-muted"><LeagueTime :iso="match.scheduledAt" /></p>
            <UiCountdown v-if="!final && upcoming" :to="match.scheduledAt" ended-label="Match time" />
          </div>

          <!-- Map strip -->
          <ol v-if="maps.length" class="mt-8 flex flex-wrap justify-center gap-2" aria-label="Maps">
            <li
              v-for="m in maps"
              :key="m.id"
              class="flex items-center gap-3 rounded-lg border bg-bg/60 px-3 py-2 text-sm"
              :class="m.winnerTeamId ? 'border-line-strong' : 'border-line'"
            >
              <span class="tnum font-heading text-faint">{{ m.number }}</span>
              <span class="min-w-0">
                <span class="block font-heading leading-tight">{{ m.map }}</span>
                <span class="block text-xs text-muted">{{ m.mode }}</span>
              </span>
              <span v-if="m.homeScore !== null" class="tnum font-heading">
                <span :class="m.winnerTeamId === match.home.id ? 'text-accent' : 'text-muted'">{{ m.homeScore }}</span><span class="text-faint">–</span><span
                  :class="m.winnerTeamId === match.away.id ? 'text-accent' : 'text-muted'"
                  >{{ m.awayScore }}</span
                >
              </span>
            </li>
          </ol>

          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <UiButton v-if="match.broadcastLive && match.broadcastUrl" :to="{ path: '/watch', query: { match: match.id } }">LIVE · Watch here</UiButton>
            <UiButton v-else-if="match.vodUrl" :to="{ hash: '#replay' }" variant="secondary">Watch the replay</UiButton>
            <UiButton v-else-if="match.broadcastUrl" :href="match.broadcastUrl" variant="secondary">Watch on {{ streamPlatform(match.broadcastUrl) }}</UiButton>
            <UiBadge v-if="match.scheduledAt !== match.defaultAt" variant="outline">
              Rescheduled from&nbsp;<LeagueTime :iso="match.defaultAt" />
            </UiBadge>
          </div>
        </div>
      </section>

      <div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
        <ReplayCard :match="match" accent="neutral" @saved="reload" />
        <UiCard
          v-if="reportStatus && !['forfeit', 'cancelled'].includes(match.status)"
          :accent="canReport && !iReported ? 'red' : 'neutral'"
          eyebrow="Teams and staff only"
          title="Match reports"
        >
          <ReportStatusPanel :status="reportStatus" :home-tag="match.home.tag" :away-tag="match.away.tag" :my-team-side="mySide" />
          <div v-if="canReport" class="mt-4">
            <UiButton :to="`/report/${match.id}`">{{ iReported ? 'Update your report' : 'Report this match' }}</UiButton>
          </div>
        </UiCard>

        <DisputePanel v-if="auth.isSignedIn" :match="match" :captain-of="captainOf" :staff="neutralStaff" @changed="reload()" />
        <UiCard v-else-if="dispute" eyebrow="Dispute" :title="dispute.status === 'open' ? 'Under review' : 'Resolved'">
          <p class="text-sm text-muted">{{ dispute.reason }}</p>
          <p v-if="dispute.resolution" class="mt-3 text-sm"><strong class="text-accent">Decision:</strong> {{ dispute.resolution }}</p>
        </UiCard>

        <RescheduleCard v-if="match.stage !== 'preseason'" accent="neutral" :match="match" :captain-of="captainOf" @changed="reload()" />
        <UiCard v-else-if="captainOf" eyebrow="Match time" title="Preseason match">
          <p class="text-sm text-muted">
            To move it, propose a new time on <RouterLink to="/my-team" class="text-accent hover:text-accent-strong">My team</RouterLink> or with
            <code>/preseason</code> in your shared preseason channel. The other captain accepts.
          </p>
        </UiCard>

        <CheckInCard :accent="needsCheckin ? 'red' : 'neutral'" :match="match" :checkins="checkins" :captain-of="captainOf" @changed="reload()" />

        <EmergencySubCard accent="neutral" :match="match" :captain-of="captainOf" />

        <section aria-labelledby="maps-title">
          <h2 id="maps-title" class="eyebrow-line mb-3 text-faint">Scoreboards</h2>
          <UiEmptyState
            v-if="maps.length === 0"
            :title="final ? 'No map details' : 'Not played yet'"
            :description="final ? 'This result was recorded without map details.' : 'Map scores and scoreboards appear once both captains report and the result is confirmed.'"
          />
          <div v-else class="flex flex-col gap-4">
            <article v-for="m in maps" :key="m.id" class="overflow-hidden rounded-xl border border-line bg-surface" :aria-labelledby="`map-${m.number}`">
              <header class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <span class="tnum font-mono text-sm text-accent">{{ m.number }}</span>
                <h3 :id="`map-${m.number}`" class="flex-1 font-heading text-lg">{{ m.mode }} · {{ m.map }}</h3>
                <span v-if="m.homeScore !== null" class="tnum font-heading text-lg">
                  <span :class="(m.homeScore ?? 0) > (m.awayScore ?? 0) ? 'text-accent' : 'text-muted'">{{ m.homeScore }}</span>
                  <span class="text-faint"> – </span>
                  <span :class="(m.awayScore ?? 0) > (m.homeScore ?? 0) ? 'text-accent' : 'text-muted'">{{ m.awayScore }}</span>
                </span>
              </header>
              <div v-if="m.players.length" class="overflow-x-auto">
                <table class="w-full text-sm">
                  <caption class="sr-only">Map {{ m.number }} scoreboard</caption>
                  <thead>
                    <tr class="border-b border-line">
                      <th scope="col" class="eyebrow px-4 py-2 text-left text-muted">Player</th>
                      <th scope="col" class="eyebrow hidden px-4 py-2 text-left text-muted sm:table-cell">Team</th>
                      <th scope="col" class="eyebrow px-4 py-2 text-right text-muted">K</th>
                      <th scope="col" class="eyebrow px-4 py-2 text-right text-muted">D</th>
                      <th scope="col" class="eyebrow px-4 py-2 text-right text-muted">K/D</th>
                      <th scope="col" class="eyebrow px-4 py-2 text-right text-muted">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in m.players" :key="p.userId" class="border-b border-line last:border-b-0">
                      <td class="px-4 py-2"><RouterLink :to="`/players/${p.userId}`" class="hover:text-accent">{{ p.name }}</RouterLink></td>
                      <td class="hidden px-4 py-2 text-muted sm:table-cell">{{ teamName(p.teamId) }}</td>
                      <td class="tnum px-4 py-2 text-right">{{ p.kills }}</td>
                      <td class="tnum px-4 py-2 text-right">{{ p.deaths }}</td>
                      <td class="tnum px-4 py-2 text-right">{{ kd(p.kills, p.deaths) }}</td>
                      <td class="tnum px-4 py-2 text-right">{{ p.score.toLocaleString() }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>

        <section v-if="screenshots.length" aria-labelledby="shots-title">
          <h2 id="shots-title" class="eyebrow mb-1 text-accent">Screenshots</h2>
          <p class="mb-3 text-xs text-muted">Visible to the two teams and league staff only. Until the result is confirmed, each team sees just its own.</p>
          <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <li v-for="s in screenshots" :key="s.path">
              <a :href="s.url" target="_blank" rel="noopener noreferrer" class="block overflow-hidden rounded-md border border-line hover:border-accent-dim">
                <img :src="s.url" :alt="`Scoreboard screenshot from ${teamName(s.teamId)}`" class="aspect-video w-full object-cover" loading="lazy" />
              </a>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

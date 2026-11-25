<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import MatchStatus from '@/components/match/MatchStatus.vue'
import ReportStatusPanel from '@/components/report/ReportStatusPanel.vue'
import DisputePanel from '@/components/match/DisputePanel.vue'
import RescheduleCard from '@/components/match/RescheduleCard.vue'
import CheckInCard from '@/components/match/CheckInCard.vue'
import EmergencySubCard from '@/components/match/EmergencySubCard.vue'
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
const { status: reportStatus } = useReportStatus(id)

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
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-14 sm:px-6"><UiSkeleton :lines="8" /></div>
    <div v-else-if="!match" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Match not found" description="This match doesn't exist or was removed.">
        <UiButton to="/matches" variant="secondary">All matches</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <!-- Scoreboard header -->
      <section class="border-b border-line" aria-labelledby="match-title">
        <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>
              <template v-if="match.stage === 'playoff'">Playoffs · </template>Week {{ match.week }} ·
              <LeagueTime :iso="match.scheduledAt" />
            </span>
            <MatchStatus :match="match" />
          </div>
          <h1 id="match-title" class="sr-only">{{ match.home.name }} vs {{ match.away.name }}</h1>
          <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <RouterLink :to="`/teams/${match.home.id}`" class="flex flex-col items-center gap-3 text-center hover:text-accent">
              <TeamLogo :tag="match.home.tag" :name="match.home.name" :logo-url="match.home.logoUrl" size="xl" decorative />
              <span class="font-heading text-xl sm:text-2xl">{{ match.home.name }}</span>
            </RouterLink>
            <div class="tnum text-center font-heading text-5xl sm:text-7xl" :aria-label="final ? `Series ${series('home')} to ${series('away')}` : 'Not played yet'">
              <template v-if="final">
                <span :class="match.winnerTeamId === match.home.id ? 'text-accent' : 'text-muted'">{{ series('home') }}</span>
                <span class="mx-2 text-faint">–</span>
                <span :class="match.winnerTeamId === match.away.id ? 'text-accent' : 'text-muted'">{{ series('away') }}</span>
              </template>
              <span v-else class="text-2xl text-muted sm:text-3xl">vs</span>
            </div>
            <RouterLink :to="`/teams/${match.away.id}`" class="flex flex-col items-center gap-3 text-center hover:text-accent">
              <TeamLogo :tag="match.away.tag" :name="match.away.name" :logo-url="match.away.logoUrl" size="xl" decorative />
              <span class="font-heading text-xl sm:text-2xl">{{ match.away.name }}</span>
            </RouterLink>
          </div>
          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <UiButton v-if="match.broadcastLive && match.broadcastUrl" :href="match.broadcastUrl">LIVE · Watch on {{ streamPlatform(match.broadcastUrl) }}</UiButton>
            <UiButton v-else-if="match.broadcastUrl" :href="match.broadcastUrl" variant="secondary">Watch broadcast</UiButton>
            <UiBadge v-if="match.scheduledAt !== match.defaultAt" variant="outline">
              Rescheduled from&nbsp;<LeagueTime :iso="match.defaultAt" />
            </UiBadge>
          </div>
        </div>
      </section>

      <div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
        <UiCard
          v-if="reportStatus && !['forfeit', 'cancelled'].includes(match.status)"
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

        <RescheduleCard :match="match" :captain-of="captainOf" @changed="reload()" />

        <CheckInCard :match="match" :checkins="checkins" :captain-of="captainOf" @changed="reload()" />

        <EmergencySubCard :match="match" :captain-of="captainOf" />

        <section aria-labelledby="maps-title">
          <h2 id="maps-title" class="eyebrow mb-3 text-accent">Maps</h2>
          <UiEmptyState
            v-if="maps.length === 0"
            :title="final ? 'No map details' : 'Not played yet'"
            :description="final ? 'This result was recorded without map details.' : 'Map scores and scoreboards appear once both captains report and the result is confirmed.'"
          />
          <div v-else class="flex flex-col gap-4">
            <article v-for="m in maps" :key="m.id" class="overflow-hidden rounded-lg border border-line bg-surface" :aria-labelledby="`map-${m.number}`">
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

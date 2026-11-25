<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import ScoreChip from '@/components/ui/ScoreChip.vue'
import RosterList from '@/components/team/RosterList.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useTeam } from '@/composables/useTeams'
import { useSeasonSchedule } from '@/composables/useMatches'
import { useTeamModeRecords, useTeamRecord } from '@/composables/useStats'
import { useAuthStore } from '@/stores/auth'
import { site } from '@/config/site'

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { team, loading } = useTeam(id)
const isMine = computed(() => team.value && auth.team?.id === team.value.id)
const { matches } = useSeasonSchedule()
const { record } = useTeamRecord(id)
const { records: modeRecords } = useTeamModeRecords(id)

const teamMatches = computed(() => matches.value.filter((m) => m.home.id === id.value || m.away.id === id.value))
const done = (s: string) => s === 'confirmed' || s === 'forfeit'
const results = computed(() => teamMatches.value.filter((m) => done(m.status)).reverse())
const upcoming = computed(() => teamMatches.value.filter((m) => !done(m.status) && m.status !== 'cancelled').slice(0, 5))
const side = (m: (typeof teamMatches.value)[number]) => (m.home.id === id.value ? 'home' : 'away')
const opp = (m: (typeof teamMatches.value)[number]) => (side(m) === 'home' ? m.away : m.home)
const ours = (m: (typeof teamMatches.value)[number]) => {
  if (m.status === 'forfeit') return m.forfeitTeamId === id.value ? 0 : 3
  return (side(m) === 'home' ? m.homeSeries : m.awaySeries) ?? 0
}
const theirs = (m: (typeof teamMatches.value)[number]) => {
  if (m.status === 'forfeit') return m.forfeitTeamId === id.value ? 3 : 0
  return (side(m) === 'home' ? m.awaySeries : m.homeSeries) ?? 0
}

watch(team, (t) => {
  if (t) document.title = `${t.name} · ${site.shortName}`
})
</script>

<template>
  <div>
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-14 sm:px-6"><UiSkeleton :lines="6" /></div>

    <div v-else-if="!team" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Team not found" description="This team doesn't exist or was removed.">
        <UiButton to="/teams" variant="secondary">All teams</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <section class="border-b border-line" aria-labelledby="team-name">
        <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14">
          <TeamLogo :tag="team.tag" :name="team.name" :logo-url="team.logoUrl" size="xl" decorative />
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-accent">{{ team.seasonName }}<template v-if="team.division"> · {{ team.division }}</template></p>
            <h1 id="team-name" class="mt-1 font-heading text-4xl sm:text-5xl">{{ team.name }}</h1>
            <p class="mt-3 flex flex-wrap gap-2">
              <UiBadge variant="outline">{{ team.tag }}</UiBadge>
              <UiBadge v-if="team.status === 'pending'" variant="accent">Awaiting approval</UiBadge>
              <UiBadge v-if="team.status === 'removed'" variant="loss">Removed</UiBadge>
            </p>
          </div>
          <dl class="flex gap-6">
            <div>
              <dt class="eyebrow text-muted">Record</dt>
              <dd class="tnum font-heading text-3xl">{{ record.wins }}–{{ record.losses }}</dd>
            </div>
            <div>
              <dt class="eyebrow text-muted">Maps</dt>
              <dd class="tnum font-heading text-3xl">{{ record.mapsWon }}–{{ record.mapsLost }}</dd>
            </div>
          </dl>
          <div class="flex flex-wrap gap-2">
            <UiButton v-if="isMine" to="/my-team" variant="secondary">Manage team</UiButton>
            <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
          </div>
        </div>
      </section>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div class="flex flex-col gap-8">
          <section aria-labelledby="roster-title">
            <h2 id="roster-title" class="eyebrow mb-3 text-accent">Roster · {{ team.roster.length }} of {{ team.rules.max_roster }}</h2>
            <RosterList :players="team.roster" :caption="`${team.name} roster`" link-players />
          </section>

          <section v-if="modeRecords.length" aria-labelledby="modes-title">
            <h2 id="modes-title" class="eyebrow mb-3 text-accent">Record by mode</h2>
            <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
              <div v-for="r in modeRecords" :key="r.mode" class="bg-surface p-4">
                <dt class="eyebrow text-muted">{{ r.mode }}</dt>
                <dd class="tnum mt-1 font-heading text-2xl">{{ r.wins }}–{{ r.losses }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div class="flex flex-col gap-6">
          <UiCard eyebrow="Schedule" title="Upcoming">
            <p v-if="!upcoming.length" class="text-sm text-muted">No upcoming matches.</p>
            <ul v-else class="flex flex-col gap-3 text-sm">
              <li v-for="m in upcoming" :key="m.id" class="flex items-center gap-3">
                <TeamLogo :tag="opp(m).tag" :name="opp(m).name" :logo-url="opp(m).logoUrl" size="sm" decorative />
                <span class="min-w-0 flex-1">
                  <RouterLink :to="`/matches/${m.id}`" class="block truncate hover:text-accent">{{ side(m) === 'home' ? 'vs' : '@' }} {{ opp(m).name }}</RouterLink>
                  <span class="text-xs text-muted">Week {{ m.week }} · <LeagueTime :iso="m.scheduledAt" /></span>
                </span>
              </li>
            </ul>
          </UiCard>
          <UiCard eyebrow="Results" title="Past matches">
            <p v-if="!results.length" class="text-sm text-muted">No matches played yet.</p>
            <ul v-else class="flex flex-col gap-3 text-sm">
              <li v-for="m in results" :key="m.id" class="flex items-center gap-3">
                <ScoreChip :score="ours(m)" :opponent="theirs(m)" :result="m.status === 'forfeit' && m.forfeitTeamId === id ? 'FF' : undefined" />
                <RouterLink :to="`/matches/${m.id}`" class="min-w-0 flex-1 truncate hover:text-accent">{{ side(m) === 'home' ? 'vs' : '@' }} {{ opp(m).name }}</RouterLink>
                <span class="text-xs text-muted">Wk {{ m.week }}</span>
              </li>
            </ul>
          </UiCard>
        </div>
      </div>
    </template>
  </div>
</template>

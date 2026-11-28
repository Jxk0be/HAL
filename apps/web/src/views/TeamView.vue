<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import ScoreChip from '@/components/ui/ScoreChip.vue'
import RosterList from '@/components/team/RosterList.vue'
import TeamDiscordAlert from '@/components/team/TeamDiscordAlert.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useTeam } from '@/composables/useTeams'
import { useSeasonSchedule } from '@/composables/useMatches'
import { useStandings, useTeamModeRecords, useTeamRecord } from '@/composables/useStats'
import { useRecruitBoard } from '@/composables/useRecruiting'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiStatTile from '@/components/ui/UiStatTile.vue'
import { useAuthStore } from '@/stores/auth'
import { site } from '@/config/site'

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { team, loading } = useTeam(id)
const isMine = computed(() => team.value && auth.team?.id === team.value.id)
const { matches, loading: matchesLoading } = useSeasonSchedule()
const { record, loading: recordLoading } = useTeamRecord(id)
const { records: modeRecords, loading: modesLoading } = useTeamModeRecords(id)

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

const { rows: standings, loading: standingsLoading } = useStandings(() => team.value?.seasonId, null)
const standing = computed(() => standings.value.find((r) => r.team_id === id.value) ?? null)
const mapDiff = computed(() => {
  const d = record.value.mapsWon - record.value.mapsLost
  return d > 0 ? `+${d}` : String(d)
})
const { posts, loading: postsLoading } = useRecruitBoard()
const ready = useReady(
  () =>
    loading.value ||
    matchesLoading.value ||
    recordLoading.value ||
    modesLoading.value ||
    standingsLoading.value ||
    postsLoading.value,
)
const recruitPost = computed(() => posts.value.find((p) => p.teamId === id.value) ?? null)

type Tab = 'roster' | 'matches' | 'stats' | 'recruiting'
const tab = ref<Tab>('roster')
const tabs = computed(() => [
  { value: 'roster' as const, label: 'Roster' },
  { value: 'matches' as const, label: 'Matches' },
  { value: 'stats' as const, label: 'Stats' },
  { value: 'recruiting' as const, label: 'Recruiting' },
])

watch(team, (t) => {
  if (t) document.title = `${t.name} · ${site.shortName}`
})
</script>

<template>
  <div>
    <div v-if="!ready" role="status" aria-busy="true">
      <span class="sr-only">Loading team…</span>
      <UiPageSkeleton variant="detail" />
    </div>

    <div v-else-if="!team" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Team not found" description="This team doesn't exist or was removed.">
        <UiButton to="/teams" variant="secondary">All teams</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <section class="relative overflow-hidden border-b border-line" aria-labelledby="team-name">
        <div class="team-hero absolute inset-0" aria-hidden="true">
          <img v-if="team.bannerUrl" :src="team.bannerUrl" alt="" class="size-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/20" />
        </div>
        <div class="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-16 pb-8 sm:flex-row sm:items-end sm:px-6 sm:pt-28">
          <span class="self-start rounded-xl ring-4 ring-bg sm:self-end"><TeamLogo :tag="team.tag" :name="team.name" :logo-url="team.logoUrl" size="xl" decorative /></span>
          <div class="min-w-0 flex-1">
            <p class="eyebrow-line text-faint">{{ team.seasonName }}<template v-if="team.division"> · {{ team.division }}</template></p>
            <h1 id="team-name" class="title-xl mt-3 break-words">{{ team.name }}</h1>
            <p class="mt-3 flex flex-wrap gap-2">
              <UiBadge variant="outline">{{ team.tag }}</UiBadge>
              <UiBadge v-if="team.status === 'pending'" variant="accent">Awaiting approval</UiBadge>
              <UiBadge v-if="team.status === 'removed'" variant="loss">Removed</UiBadge>
              <UiBadge v-if="recruitPost" variant="accent">Recruiting</UiBadge>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UiButton v-if="isMine" to="/my-team" variant="secondary">Manage team</UiButton>
            <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
          </div>
        </div>
      </section>

      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <!-- Only the team's own players and admins get this data from the database. -->
        <TeamDiscordAlert v-if="isMine || auth.isAdmin" class="mb-6" :team-id="team.id" :roster="team.roster" />
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <UiStatTile label="Series" :value="`${record.wins}–${record.losses}`" hint="Regular season W–L" />
          <UiStatTile label="Map diff" :value="mapDiff" :hint="`${record.mapsWon}–${record.mapsLost} maps`" accent="neutral" />
          <UiStatTile label="Standing" :value="standing ? `#${standing.rank}` : '–'" accent="neutral" />
          <UiStatTile label="Forfeits" :value="team.forfeitCount" accent="neutral" />
        </div>
        <p v-if="team.description" class="mt-6 max-w-3xl whitespace-pre-line break-words text-muted">{{ team.description }}</p>

        <div class="mt-8">
          <UiTabs v-model="tab" :tabs="tabs" label="Team sections" hash-sync>
            <template #default="{ active }">
              <section v-if="active === 'roster'" aria-label="Roster">
                <p class="eyebrow mb-3 text-faint">{{ team.roster.length }} of {{ team.rules.max_roster }} players</p>
                <RosterList :players="team.roster" :caption="`${team.name} roster`" link-players />
              </section>

              <div v-else-if="active === 'matches'" class="grid gap-6 lg:grid-cols-2">
                <UiCard accent="neutral" eyebrow="Schedule" title="Upcoming">
                  <p v-if="!upcoming.length" class="text-sm text-muted">No upcoming matches.</p>
                  <ul v-else class="flex flex-col gap-3 text-sm">
                    <li v-for="m in upcoming" :key="m.id" class="flex items-center gap-3">
                      <TeamLogo :tag="opp(m).tag" :name="opp(m).name" :logo-url="opp(m).logoUrl" size="sm" decorative />
                      <span class="min-w-0 flex-1">
                        <RouterLink :to="`/matches/${m.id}`" class="block truncate hover:text-accent">{{ side(m) === 'home' ? 'vs' : '@' }} {{ opp(m).name }}</RouterLink>
                        <span class="text-xs text-muted">{{ weekLabel(m.week) }} · <LeagueTime :iso="m.scheduledAt" /></span>
                      </span>
                    </li>
                  </ul>
                </UiCard>
                <UiCard accent="neutral" eyebrow="Results" title="Past matches">
                  <p v-if="!results.length" class="text-sm text-muted">No matches played yet.</p>
                  <ul v-else class="flex flex-col gap-3 text-sm">
                    <li v-for="m in results" :key="m.id" class="flex items-center gap-3">
                      <ScoreChip :score="ours(m)" :opponent="theirs(m)" :result="m.status === 'forfeit' && m.forfeitTeamId === id ? 'FF' : undefined" />
                      <RouterLink :to="`/matches/${m.id}`" class="min-w-0 flex-1 truncate hover:text-accent">{{ side(m) === 'home' ? 'vs' : '@' }} {{ opp(m).name }}</RouterLink>
                      <span class="text-xs text-muted">{{ weekLabel(m.week, true) }}</span>
                    </li>
                  </ul>
                </UiCard>
              </div>

              <section v-else-if="active === 'stats'" aria-label="Stats">
                <UiEmptyState v-if="!modeRecords.length" title="No stats yet" description="Mode records appear once matches are confirmed." />
                <dl v-else class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
                  <div v-for="r in modeRecords" :key="r.mode" class="bg-surface p-4">
                    <dt class="eyebrow text-muted">{{ r.mode }}</dt>
                    <dd class="tnum mt-1 font-heading text-2xl">{{ r.wins }}–{{ r.losses }}</dd>
                  </div>
                </dl>
              </section>

              <section v-else-if="active === 'recruiting'" aria-label="Recruiting">
                <UiEmptyState v-if="!recruitPost" title="Not recruiting" description="This team doesn't have an open recruiting post right now." />
                <UiCard v-else accent="red" striped :title="`Looking for ${recruitPost.lookingFor === 'any' ? 'a player' : `a ${recruitPost.lookingFor}`}`">
                  <p class="text-sm text-muted">
                    Roles: {{ recruitPost.roles.length ? recruitPost.roles.join(', ') : 'Any' }}
                    <template v-if="recruitPost.availability"> · {{ recruitPost.availability }}</template>
                  </p>
                  <p v-if="recruitPost.note" class="mt-3 whitespace-pre-line text-text">{{ recruitPost.note }}</p>
                  <div class="mt-4"><UiButton to="/teams-recruiting">See all recruiting posts</UiButton></div>
                </UiCard>
              </section>
            </template>
          </UiTabs>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.team-hero {
  background-image:
    radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px),
    radial-gradient(circle at 85% 0%, rgb(255 79 92 / 0.16), transparent 60%),
    linear-gradient(135deg, var(--color-surface-3), var(--color-bg));
  background-size:
    14px 14px,
    100% 100%,
    100% 100%;
}
</style>

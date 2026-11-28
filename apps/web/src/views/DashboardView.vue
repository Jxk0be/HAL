<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiStepper from '@/components/ui/UiStepper.vue'
import UiStatTile from '@/components/ui/UiStatTile.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import TeamDiscordAlert from '@/components/team/TeamDiscordAlert.vue'
import { useReady } from '@/composables/useReady'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import MatchStatus from '@/components/match/MatchStatus.vue'
import { useDashboard, nextMatchAction } from '@/composables/useDashboard'
import { useAdminOverview } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import { weekLabel } from '@/lib/preseason'
import { phaseLabel } from '@/lib/seasonPhase'
import { formatLeagueTime } from '@/lib/time'

const d = useDashboard()
const { auth } = d
const toast = useToast()

const staffOnly = computed(() => auth.isStaff && !auth.isPlayer)
const { overview, loading: overviewLoading } = useAdminOverview()
const ready = useReady(() => d.loading.value || (staffOnly.value && overviewLoading.value))

const name = computed(() => auth.profile?.activision_id?.split('#')[0] || auth.displayName)

const action = computed(() => (d.nextMatch.value ? nextMatchAction(d.nextMatch.value, d.isCaptain.value) : null))
const opponent = computed(() => {
  const m = d.nextMatch.value
  if (!m || !auth.team) return null
  return m.home.id === auth.team.id ? m.away : m.home
})

const roster = computed(() => d.team.value?.roster ?? [])
const changesLeft = computed(() => {
  const t = d.team.value
  return t ? `${t.rosterChangesUsed} / ${t.rules.max_roster_changes}` : '–'
})

const kd = computed(() => {
  const s = d.seasonLine.value
  return s?.kd != null ? s.kd.toFixed(2) : '–'
})

async function answer(id: string, accept: boolean) {
  const r = await d.respondInvite(id, accept)
  if (!r.ok) toast.error(r.message)
  else toast.success(accept ? 'Welcome to the team.' : 'Invite declined.')
}

const adminTiles = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    { label: 'Open mismatches', value: o.open_mismatch_matches, to: '/admin/mismatches' },
    { label: 'Open disputes', value: o.open_disputes, to: '/admin/disputes' },
    { label: 'Teams to approve', value: o.pending_teams, to: '/admin/season' },
    { label: 'Roster requests', value: o.pending_roster_requests, to: '/admin/rosters' },
  ]
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Dashboard" :title="`Welcome back, ${name}`">
      <template v-if="ready && d.season.value" #actions>
        <UiBadge variant="outline">{{ d.season.value.name }} · {{ d.phase.value ? phaseLabel(d.phase.value) : '' }}</UiBadge>
      </template>
    </PageHeader>

    <UiLoadGate :ready="ready" class="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3" label="Loading your dashboard…">
      <template #skeleton>
        <div class="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 lg:col-span-2">
          <div class="skeleton h-3 w-40 rounded-sm" />
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div class="flex flex-col items-center gap-2"><div class="skeleton size-20 rounded-xl" /><div class="skeleton h-4 w-24 rounded-sm" /></div>
            <div class="skeleton h-8 w-12" />
            <div class="flex flex-col items-center gap-2"><div class="skeleton size-20 rounded-xl" /><div class="skeleton h-4 w-24 rounded-sm" /></div>
          </div>
          <div class="mx-auto skeleton h-6 w-40" />
          <div class="mx-auto flex gap-2"><div class="skeleton h-11 w-32" /><div class="skeleton h-11 w-32" /></div>
        </div>
        <div class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div class="skeleton h-3 w-16 rounded-sm" />
          <div v-for="n in 3" :key="n" class="skeleton h-4 rounded-sm" :class="n === 3 ? 'w-1/2' : 'w-full'" />
        </div>
        <div class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 lg:col-span-2">
          <div class="skeleton h-3 w-32 rounded-sm" />
          <div class="skeleton h-10 w-full" />
        </div>
        <div class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div class="skeleton h-3 w-24 rounded-sm" />
          <div v-for="n in 3" :key="n" class="skeleton h-4 w-full rounded-sm" />
        </div>
      </template>

      <!-- Staff-only accounts -->
      <template v-if="staffOnly">
        <section class="lg:col-span-3" aria-labelledby="dash-admin">
          <h2 id="dash-admin" class="eyebrow-line mb-3 text-faint">Admin queues</h2>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <UiStatTile
              v-for="t in adminTiles"
              :key="t.label"
              :label="t.label"
              :value="t.value"
              :to="t.to"
              :accent="t.value > 0 ? 'red' : 'neutral'"
            />
          </div>
          <div class="mt-4"><UiButton to="/admin">Open the control center</UiButton></div>
        </section>
      </template>

      <template v-else>
        <!-- Rule 3.13: teammates who aren't in the league Discord (renders nothing when everyone is in) -->
        <TeamDiscordAlert
          v-if="d.team.value"
          class="lg:col-span-3"
          title="Your team"
          :status="d.discordStatus.value"
          :roster="d.team.value.roster"
          :can-manage="d.isCaptain.value"
        />
        <!-- Next match hero -->
        <div class="lg:col-span-2">
          <UiCard v-if="d.nextMatch.value && opponent && auth.team" accent="red" striped as="section" aria-labelledby="dash-next">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 id="dash-next" class="eyebrow-line text-faint">Next match · {{ weekLabel(d.nextMatch.value.week) }}</h2>
              <MatchStatus :match="d.nextMatch.value" />
            </div>
            <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div class="flex min-w-0 flex-col items-center gap-2 text-center">
                <TeamLogo :tag="auth.team.tag" :logo-url="auth.team.logo_url" size="xl" decorative />
                <p class="w-full truncate font-heading text-lg">{{ auth.team.name }}</p>
              </div>
              <p class="font-heading text-3xl text-faint sm:text-4xl" aria-label="versus">VS</p>
              <div class="flex min-w-0 flex-col items-center gap-2 text-center">
                <TeamLogo :tag="opponent.tag" :logo-url="opponent.logoUrl" size="xl" decorative />
                <p class="w-full truncate font-heading text-lg">{{ opponent.name }}</p>
              </div>
            </div>
            <div class="mt-5 flex flex-col items-center gap-1 text-center">
              <p class="text-muted"><LeagueTime :iso="d.nextMatch.value.scheduledAt" /></p>
              <p class="tnum font-heading text-2xl"><UiCountdown :to="d.nextMatch.value.scheduledAt" /></p>
            </div>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <UiButton v-if="action === 'checkin'" :to="`/matches/${d.nextMatch.value.id}`">Check in</UiButton>
              <UiButton v-else-if="action === 'report'" :to="`/report/${d.nextMatch.value.id}`">Report result</UiButton>
              <UiButton v-else-if="action === 'watch'" :to="`/watch?match=${d.nextMatch.value.id}`">Watch live</UiButton>
              <UiButton :variant="action === 'view' ? 'primary' : 'secondary'" :to="`/matches/${d.nextMatch.value.id}`">
                Match page
              </UiButton>
            </div>
          </UiCard>
          <UiCard v-else-if="auth.team" accent="neutral" striped title="No match scheduled">
            <p class="text-muted">Your next match shows up here once the schedule is out.</p>
            <div class="mt-4"><UiButton to="/matches" variant="secondary">See the schedule</UiButton></div>
          </UiCard>
          <UiCard v-else accent="red" striped title="You're a free agent">
            <p class="text-muted">
              {{
                d.faPost.value?.active
                  ? 'Your free agent post is live. Captains can invite you from the board.'
                  : 'Post on the Free Agents board so captains can find you, or browse teams that are recruiting.'
              }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UiButton to="/free-agents">{{ d.faPost.value?.active ? 'View the board' : 'Post as a free agent' }}</UiButton>
              <UiButton to="/teams-recruiting" variant="secondary">Teams recruiting</UiButton>
              <UiButton v-if="auth.canPlay" to="/my-team" variant="ghost">Create a team</UiButton>
            </div>
          </UiCard>
        </div>

        <!-- To-do -->
        <UiCard accent="neutral" as="section" aria-labelledby="dash-todo">
          <h2 id="dash-todo" class="eyebrow-line text-faint">To do <span v-if="d.todoCount.value" class="tnum text-accent">{{ d.todoCount.value }}</span></h2>
          <ul class="mt-4 flex flex-col divide-y divide-line">
            <li v-if="auth.isPlayer && !auth.canPlay" class="py-3">
              <RouterLink to="/profile" class="text-accent hover:underline">
                {{ auth.rankStatus === 'needs_exception' ? 'Rank exception pending admin review' : 'Finish your profile to play' }}
              </RouterLink>
            </li>
            <li v-for="inv in d.invites.value" :key="inv.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
              <span class="min-w-0">Invite from <b class="text-text">{{ inv.team.name }}</b></span>
              <span class="flex gap-2">
                <UiButton size="sm" :loading="d.inviteBusy.value === inv.id" @click="answer(inv.id, true)">Accept</UiButton>
                <UiButton size="sm" variant="ghost" :disabled="d.inviteBusy.value === inv.id" @click="answer(inv.id, false)">Decline</UiButton>
              </span>
            </li>
            <li v-for="r in d.esubRequests.value" :key="r.id" class="py-3">
              <RouterLink to="/profile" class="hover:text-accent">
                Emergency sub for <b>{{ r.team.tag }}</b> ({{ r.match.home }} vs {{ r.match.away }})
              </RouterLink>
            </li>
            <li v-for="r in d.reschedulesForMe.value" :key="r.id" class="py-3">
              <RouterLink :to="`/matches/${r.match.id}`" class="hover:text-accent">
                Reschedule request: {{ r.match.home.tag }} vs {{ r.match.away.tag }} to
                <span class="text-text">{{ formatLeagueTime(r.proposedAt) }}</span>
              </RouterLink>
            </li>
            <li v-for="m in d.toReport.value" :key="m.id" class="py-3">
              <RouterLink :to="`/report/${m.id}`" class="hover:text-accent">Report {{ m.home.tag }} vs {{ m.away.tag }}</RouterLink>
            </li>
            <li v-for="m in d.disputed.value" :key="m.id" class="py-3">
              <RouterLink :to="`/matches/${m.id}`" class="hover:text-accent">Dispute open: {{ m.home.tag }} vs {{ m.away.tag }}</RouterLink>
            </li>
            <li v-if="!d.todoCount.value && (auth.canPlay || !auth.isPlayer)" class="py-3 text-muted">You're all caught up.</li>
          </ul>
        </UiCard>

        <!-- Team snapshot -->
        <UiCard v-if="auth.team" accent="neutral" as="section" aria-labelledby="dash-team" class="lg:col-span-2">
          <div class="flex flex-wrap items-center gap-4">
            <TeamLogo :tag="auth.team.tag" :logo-url="auth.team.logo_url" size="lg" decorative />
            <div class="min-w-0 flex-1">
              <h2 id="dash-team" class="truncate font-heading text-2xl">{{ auth.team.name }}</h2>
              <p class="text-sm text-muted">
                <span class="tnum">{{ d.standing.value ? `${d.standing.value.wins}–${d.standing.value.losses}` : '0–0' }}</span>
                <template v-if="d.standing.value"> · #{{ d.standing.value.rank }} in standings</template>
                <template v-if="d.team.value?.division"> · {{ d.team.value.division }}</template>
              </p>
            </div>
            <UiButton to="/my-team" variant="secondary" size="sm">My team</UiButton>
          </div>
          <ul class="mt-5 grid gap-2 sm:grid-cols-2">
            <li v-for="p in roster" :key="p.userId" class="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
              <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
              <UiBadge :variant="p.role === 'starter' ? 'accent' : 'neutral'">{{ p.isCaptain ? 'Captain' : p.role === 'starter' ? 'Starter' : 'Sub' }}</UiBadge>
            </li>
          </ul>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <UiStatTile label="Roster changes" :value="changesLeft" accent="neutral" />
            <div class="card-accent min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5" style="--card-accent: var(--color-line-strong)">
              <p class="eyebrow text-faint">Roster lock</p>
              <p class="tnum mt-2 font-heading text-2xl">
                <UiCountdown v-if="d.season.value?.roster_lock_at" :to="d.season.value.roster_lock_at" ended-label="Locked" size="md" precision="minutes" />
                <span v-else>Not set</span>
              </p>
            </div>
          </div>
        </UiCard>

        <!-- My season line -->
        <UiCard accent="neutral" as="section" aria-labelledby="dash-stats">
          <h2 id="dash-stats" class="eyebrow-line text-faint">My season</h2>
          <dl class="mt-4 grid grid-cols-3 gap-3 text-center">
            <div><dt class="eyebrow text-faint">K/D</dt><dd class="tnum font-heading text-3xl">{{ kd }}</dd></div>
            <div>
              <dt class="eyebrow text-faint">Avg score</dt>
              <dd class="tnum font-heading text-3xl">{{ d.seasonLine.value?.avg_score != null ? Math.round(d.seasonLine.value.avg_score) : '–' }}</dd>
            </div>
            <div><dt class="eyebrow text-faint">Maps</dt><dd class="tnum font-heading text-3xl">{{ d.seasonLine.value?.maps_played ?? 0 }}</dd></div>
          </dl>
          <div v-if="auth.user" class="mt-4"><UiButton :to="`/players/${auth.user.id}`" variant="ghost" size="sm">Full profile →</UiButton></div>
        </UiCard>
      </template>

      <!-- Season progress -->
      <UiCard v-if="d.season.value" accent="neutral" as="section" aria-labelledby="dash-season" class="lg:col-span-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dash-season" class="eyebrow-line text-faint">Season progress</h2>
          <p v-if="d.milestone.value" class="text-sm text-muted">
            {{ d.milestone.value.label }} in
            <span class="tnum text-text"><UiCountdown :to="d.milestone.value.at.toISOString()" compact /></span>
          </p>
        </div>
        <div class="mt-4"><UiStepper :steps="d.steps.value" :current-key="d.phase.value" label="Season progress" /></div>
      </UiCard>

      <!-- Latest results -->
      <UiCard accent="neutral" as="section" aria-labelledby="dash-results">
        <h2 id="dash-results" class="eyebrow-line text-faint">Latest results</h2>
        <ul v-if="d.divisionResults.value.length" class="mt-3 flex flex-col divide-y divide-line">
          <li v-for="m in d.divisionResults.value" :key="m.id">
            <RouterLink :to="`/matches/${m.id}`" class="tnum flex items-center justify-between gap-2 py-2.5 font-heading hover:text-accent">
              <span :class="m.winnerTeamId === m.home.id ? 'text-text' : 'text-muted'">{{ m.home.tag }}</span>
              <span>{{ m.homeSeries ?? 0 }}–{{ m.awaySeries ?? 0 }}</span>
              <span :class="m.winnerTeamId === m.away.id ? 'text-text' : 'text-muted'">{{ m.away.tag }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="mt-3 text-muted">No results yet.</p>
      </UiCard>
    </UiLoadGate>
  </div>
</template>

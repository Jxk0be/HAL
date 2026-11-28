<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Share2 } from 'lucide-vue-next'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiStepper from '@/components/ui/UiStepper.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import StandingsPanel from '@/components/season/StandingsPanel.vue'
import MatchesPanel from '@/components/season/MatchesPanel.vue'
import BracketPanel from '@/components/season/BracketPanel.vue'
import TeamGrid from '@/components/season/TeamGrid.vue'
import { useSeasonHub } from '@/composables/useSeasonHub'
import { useSeasonSchedule } from '@/composables/useMatches'
import { useTeamList } from '@/composables/useTeams'
import { useRulebook } from '@/composables/useRulebook'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { getSeasonPhase, nextMilestone, phaseLabel, seasonSteps } from '@/lib/seasonPhase'
import { addDays, mondayOf, zonedToUtc } from '@/lib/time'
import { site } from '@/config/site'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const routeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const hub = useSeasonHub(routeId)
const season = hub.season
const seasonId = computed(() => season.value?.id ?? null)

const { matches, loading: matchesLoading } = useSeasonSchedule(seasonId)
const { teams, loading: teamsLoading, error: teamsError } = useTeamList(seasonId)
const { book } = useRulebook()

type Tab = 'overview' | 'standings' | 'matches' | 'bracket' | 'teams' | 'rules'
const tab = ref<Tab>('overview')
const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'standings', label: 'Standings' },
  { value: 'matches', label: 'Matches' },
  { value: 'bracket', label: 'Bracket' },
  { value: 'teams', label: 'Teams' },
  { value: 'rules', label: 'Rules' },
] as const

const hasPreseason = computed(() => matches.value.some((m) => m.stage === 'preseason'))
const steps = computed(() => (season.value ? seasonSteps(season.value, hasPreseason.value) : []))
const phase = computed(() => (season.value ? getSeasonPhase(season.value, new Date(), hasPreseason.value) : null))
const milestone = computed(() => (season.value ? nextMilestone(season.value) : null))
const isComplete = computed(() => season.value?.status === 'complete')

// ---- Context CTA in the sticky bar ------------------------------------------------
const myMatch = computed(() => {
  const id = auth.team?.id
  if (!id) return null
  return (
    matches.value.find(
      (m) => (m.home.id === id || m.away.id === id) && !['confirmed', 'forfeit', 'cancelled'].includes(m.status),
    ) ?? null
  )
})
const cta = computed<{ label: string; to: string } | null>(() => {
  const s = season.value
  if (!s || isComplete.value) return null
  if (s.status === 'signups' && auth.isSignedIn && !auth.team && auth.canPlay) return { label: 'Create a team', to: '/my-team' }
  const m = myMatch.value
  if (m) {
    const start = new Date(m.scheduledAt).getTime()
    const now = Date.now()
    if (now >= start - 15 * 60_000 && now <= start + 30 * 60_000) return { label: 'Check in', to: `/matches/${m.id}` }
    return { label: 'View my match', to: `/matches/${m.id}` }
  }
  return null
})

// ---- Overview facts --------------------------------------------------------------
const nightNames: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
function to12h(t: string) {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} ET`
}
const settings = computed(() => {
  const s = season.value
  if (!s) return []
  return [
    ['Game', site.game],
    ['Format', `${site.teamSize} · ${site.seriesFormat}`],
    ['Roster', `${s.max_starters} starters + ${s.max_subs} subs (max ${s.max_roster})`],
    ['Matches per week', String(s.matches_per_week)],
    ['Match nights', `${s.match_nights.map((n) => nightNames[n] ?? n).join(' & ')} · ${to12h(s.match_time)}`],
    ['Regular season', `${s.regular_weeks} weeks`],
    ['Playoffs', `Top ${s.playoff_teams}`],
    ['Roster changes', `${s.max_roster_changes} per team`],
    ['Prize', s.prize_text ?? 'Free entry'],
  ] as const
})
const dates = computed(() => {
  const s = season.value
  if (!s) return []
  const tz = s.timezone
  const out: { label: string; iso: string }[] = []
  if (s.signups_open_at) out.push({ label: 'Signups open', iso: s.signups_open_at })
  if (s.starts_on) {
    out.push({ label: 'Season starts', iso: zonedToUtc(s.starts_on, s.match_time.slice(0, 5), tz).toISOString() })
    out.push({
      label: 'Playoffs',
      iso: zonedToUtc(addDays(mondayOf(s.starts_on), s.regular_weeks * 7), '00:00', tz).toISOString(),
    })
  }
  if (s.roster_lock_at) out.push({ label: 'Roster lock', iso: s.roster_lock_at })
  return out.sort((a, b) => a.iso.localeCompare(b.iso))
})
const chips = computed(() => {
  const s = season.value
  if (!s) return []
  return [phaseLabel(phase.value ?? ''), site.gameShort, site.teamSize, 'Bo5', `Top-${s.playoff_teams} playoffs`, 'Free entry', ...(s.prize_text ? [s.prize_text] : [])]
})

// ---- Share ------------------------------------------------------------------------
async function share() {
  const url = window.location.origin + (season.value ? `/season/${season.value.id}` : '/season')
  const title = `${season.value?.name ?? 'Season'} · ${site.name}`
  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Link copied.')
  } catch (e) {
    if ((e as DOMException)?.name !== 'AbortError') toast.error('Could not share. Copy the address bar instead.')
  }
}

// ---- Season switcher ---------------------------------------------------------------
const switcher = computed({
  get: () => season.value?.id ?? '',
  set: (id: string) => void router.push({ path: `/season/${id}`, hash: route.hash }),
})
const seasonOptions = computed(() => hub.seasons.value.map((s) => ({ value: s.id, label: s.name })))

// The router sets the title after every navigation (including tab hash changes); name the season.
watch(
  [season, () => route.fullPath],
  ([s]) => {
    if (s) setTimeout(() => (document.title = `${s.name} · ${site.shortName}`))
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <div v-if="hub.loading.value && !season" class="mx-auto max-w-7xl px-4 py-16 sm:px-6"><UiSkeleton :lines="10" /></div>
    <div v-else-if="!season" class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <UiEmptyState
        :title="hub.notFound.value ? 'Season not found' : 'No season yet'"
        description="The season page goes up once the owner publishes a season."
      >
        <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <!-- Sticky "next up" bar -->
      <div
        v-if="!isComplete"
        class="sticky top-topbar z-10 border-b border-line bg-surface/95 backdrop-blur-md print:hidden"
      >
        <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6">
          <p v-if="milestone" class="min-w-0 flex-1 truncate text-xs sm:text-sm">
            <span class="eyebrow mr-2 hidden text-accent sm:inline">Next up</span>
            <span class="text-muted">{{ milestone.label }} in </span>
            <span class="tnum font-heading text-text"><UiCountdown :to="milestone.at.toISOString()" compact /></span>
          </p>
          <p v-else class="min-w-0 flex-1 truncate text-sm text-muted">{{ phaseLabel(phase ?? '') }}</p>
          <p class="tnum hidden shrink-0 text-sm text-muted sm:block">
            <span class="font-heading text-text">{{ hub.approvedTeams.value }} / {{ hub.capacity.value }}</span> teams
          </p>
          <span v-if="cta" class="shrink-0"><UiButton :to="cta.to" size="sm">{{ cta.label }}</UiButton></span>
        </div>
      </div>

      <!-- Hero -->
      <header class="relative overflow-hidden border-b border-line">
        <div class="absolute inset-0 bg-surface texture-stripes" aria-hidden="true">
          <img v-if="season.banner_url" :src="season.banner_url" alt="" class="size-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/30" />
        </div>
        <div class="relative mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-16">
          <nav aria-label="Breadcrumb" class="text-sm text-muted">
            <ol class="flex flex-wrap items-center gap-1.5">
              <li><RouterLink to="/season" class="hover:text-text">Seasons</RouterLink></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" class="text-text">{{ season.name }}</li>
            </ol>
          </nav>
          <div class="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div class="min-w-0">
              <p class="eyebrow-line text-faint">Season</p>
              <h1 class="title-xl mt-3">{{ season.name }}</h1>
            </div>
            <div class="flex flex-wrap items-end gap-2">
              <UiSelect
                v-if="seasonOptions.length > 1"
                v-model="switcher"
                label="Season"
                :options="seasonOptions"
              />
              <UiButton variant="secondary" @click="share"><Share2 class="size-4" aria-hidden="true" />Share</UiButton>
            </div>
          </div>
          <ul class="mt-5 flex flex-wrap gap-2" aria-label="Season facts">
            <li v-for="(c, i) in chips" :key="c">
              <UiBadge :variant="i === 0 ? 'accent' : 'neutral'">{{ c }}</UiBadge>
            </li>
          </ul>
          <div class="mt-8"><UiStepper :steps="steps" :current-key="phase" label="Season progress" /></div>
        </div>
      </header>

      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <UiTabs v-model="tab" label="Season sections" :tabs="tabs" hash-sync>
          <template #default="{ active }">
            <div class="pt-4">
              <!-- Overview -->
              <div v-if="active === 'overview'" class="grid gap-6 lg:grid-cols-[1fr_22rem]">
                <div class="flex flex-col gap-6">
                  <BracketPanel
                    v-if="isComplete"
                    :season-id="season.id"
                    :season-name="season.name"
                    :size="season.playoff_teams"
                  />
                  <UiCard accent="red" title="About the season">
                    <p v-for="p in site.seasonAbout" :key="p" class="mt-2 text-muted first:mt-0">{{ p }}</p>
                  </UiCard>
                  <UiCard v-if="dates.length" accent="neutral" title="Key dates">
                    <ul class="grid gap-3 sm:grid-cols-2">
                      <li v-for="d in dates" :key="d.label" class="rounded-lg bg-surface-2 px-4 py-3">
                        <p class="eyebrow text-faint">{{ d.label }}</p>
                        <p class="mt-1"><LeagueTime :iso="d.iso" /></p>
                      </li>
                    </ul>
                  </UiCard>
                  <UiCard v-if="hub.divisions.value.length" accent="neutral" title="Divisions">
                    <ul class="flex flex-col divide-y divide-line">
                      <li v-for="d in hub.divisions.value" :key="d.id" class="flex items-center justify-between py-2.5">
                        <span class="font-heading text-lg">{{ d.name }}</span>
                        <span class="tnum text-sm text-muted">{{ d.teams }} teams</span>
                      </li>
                    </ul>
                  </UiCard>
                </div>
                <div class="flex flex-col gap-6">
                  <UiCard accent="neutral" title="Season settings">
                    <dl class="flex flex-col divide-y divide-line text-sm">
                      <div v-for="[k, v] in settings" :key="k" class="flex justify-between gap-4 py-2.5">
                        <dt class="text-muted">{{ k }}</dt>
                        <dd class="text-right text-text">{{ v }}</dd>
                      </div>
                    </dl>
                  </UiCard>
                  <UiCard accent="neutral" title="Run by">
                    <p class="text-sm text-muted">Blackhat staff run the league on Discord. Questions, disputes and match-day help all happen there.</p>
                    <div class="mt-4"><UiButton :href="site.discordInviteUrl" block>Join the Discord</UiButton></div>
                  </UiCard>
                </div>
              </div>

              <StandingsPanel
                v-else-if="active === 'standings'"
                :season-id="season.id"
                :season-name="season.name"
                :playoff-teams="season.playoff_teams"
              />
              <MatchesPanel v-else-if="active === 'matches'" :matches="matches" :loading="matchesLoading" />
              <BracketPanel v-else-if="active === 'bracket'" :season-id="season.id" :season-name="season.name" :size="season.playoff_teams" />
              <TeamGrid v-else-if="active === 'teams'" :teams="teams" :loading="teamsLoading" :error="teamsError" :season-id="season.id" />
              <div v-else-if="active === 'rules'">
                <p class="mb-4 text-muted">The full rulebook, with search and linkable rules, is on the <RouterLink to="/rules" class="text-accent hover:underline">Rules page</RouterLink>.</p>
                <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <li v-for="sec in book.sections" :key="sec.number">
                    <RouterLink
                      :to="`/rules#${sec.number}`"
                      class="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-line-strong"
                    >
                      <span class="tnum font-heading text-2xl text-accent">{{ sec.number }}</span>
                      <span class="font-heading text-lg">{{ sec.title }}</span>
                    </RouterLink>
                  </li>
                </ol>
              </div>
            </div>
          </template>
        </UiTabs>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ReportMapCard from '@/components/report/ReportMapCard.vue'
import ReportStatusPanel from '@/components/report/ReportStatusPanel.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useGameData } from '@/composables/useGameData'
import { useReport } from '@/composables/useReport'
import { useToast } from '@/composables/useToast'
import { emptyMap, mapsNeeded, seriesState, validateReport } from '@/lib/reporting'

const route = useRoute()
const toast = useToast()
const matchId = computed(() => (typeof route.params.matchId === 'string' ? route.params.matchId : null))
const prefillId = computed(() => (typeof route.query.prefill === 'string' ? route.query.prefill : null))

const r = useReport(matchId, prefillId)
const { match, myTeamId, roster, maps, sides, status, submittedAt, restoredDraft, previews, loading, submitting, uploading } = r
const game = useGameData()
onMounted(() => void game.load())

// Re-check every 30s so the form opens at the match time without a reload.
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 30_000)
const opensLater = computed(() => Boolean(match.value && new Date(match.value.scheduledAt).getTime() > now.value))
const settled = computed(() => ['confirmed', 'forfeit', 'cancelled'].includes(match.value?.status ?? ''))
const mySide = computed(() => {
  if (!match.value || !myTeamId.value) return null
  return match.value.home.id === myTeamId.value ? 'home' : 'away'
})

// Keep enough map cards for the series; never drop a map the captain already filled in.
watch(
  () => maps.value.map((m) => [m.homeScore, m.awayScore]),
  () => {
    const s = sides.value
    if (!s) return
    const need = mapsNeeded(maps.value)
    while (maps.value.length < need) maps.value.push(emptyMap(s, [], [], maps.value[maps.value.length - 1]))
  },
)

const series = computed(() => seriesState(maps.value))
const showIssues = ref(false)
const issues = computed(() => (sides.value ? validateReport(maps.value, sides.value) : []))
const issuesFor = (i: number) => (showIssues.value ? issues.value.filter((x) => x.map === i).map((x) => x.message) : [])
const seriesIssues = computed(() => (showIssues.value ? issues.value.filter((x) => x.map === -1).map((x) => x.message) : []))
const removable = (i: number) => series.value.finished && i > series.value.decidedAt && i >= 3

function removeMap(i: number) {
  maps.value.splice(i, 1)
}

async function upload(i: number, files: File[]) {
  const res = await r.uploadScreenshots(i, files)
  if (!res.ok) toast.error(res.message)
  else if (res.value) toast.error(`${res.value} screenshot${res.value === 1 ? '' : 's'} didn’t upload. Try again.`)
}

function saveDraft() {
  if (r.saveDraft()) toast.success('Draft saved on this device.')
  else toast.error('Couldn’t save a draft in this browser.')
}

// Autosave a draft after real edits (before the first submit only, so an old draft never hides a
// sent report).
let baseline = ''
watch(loading, (v) => {
  if (!v) baseline = JSON.stringify(maps.value)
})
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  maps,
  () => {
    if (loading.value || submittedAt.value || JSON.stringify(maps.value) === baseline) return
    clearTimeout(timer)
    timer = setTimeout(() => r.saveDraft(), 800)
  },
  { deep: true },
)
onUnmounted(() => {
  clearTimeout(timer)
  clearInterval(clock)
})

async function submit() {
  showIssues.value = true
  if (issues.value.length) {
    toast.error('Fix the highlighted maps before submitting.')
    document.querySelector('[aria-labelledby^="map-"].border-loss\\/50, #series-issues')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  const res = await r.submit()
  if (!res.ok) {
    toast.error(res.message)
    return
  }
  showIssues.value = false
  toast.success(
    res.value === 'confirmed' ? 'Report submitted. Both reports match: the result is confirmed.'
    : res.value === 'disputed' ? 'Report submitted. The reports don’t match, admins have been notified.'
    : 'Report submitted. Waiting for your opponent.',
  )
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function discard() {
  r.discardDraft()
  void r.reload()
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <UiSkeleton v-if="loading" :lines="8" />

    <UiEmptyState v-else-if="!match" title="Match not found" description="This match doesn’t exist or was removed.">
      <UiButton to="/matches" variant="secondary">All matches</UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="!myTeamId"
      title="Only captains can report"
      description="The captain or co-captain of either team submits the report for this match."
    >
      <UiButton :to="`/matches/${match.id}`" variant="secondary">Back to the match</UiButton>
    </UiEmptyState>

    <template v-else>
      <header class="flex flex-col gap-4 border-b border-line pb-6">
        <p class="eyebrow text-gold">Report match · Week {{ match.week }}</p>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span class="flex items-center gap-3">
            <TeamLogo :tag="match.home.tag" :name="match.home.name" :logo-url="match.home.logoUrl" decorative />
            <span class="font-heading text-2xl">{{ match.home.name }}</span>
          </span>
          <span class="tnum font-heading text-3xl text-gold" aria-label="Series score">{{ series.home }} – {{ series.away }}</span>
          <span class="flex items-center gap-3">
            <TeamLogo :tag="match.away.tag" :name="match.away.name" :logo-url="match.away.logoUrl" decorative />
            <span class="font-heading text-2xl">{{ match.away.name }}</span>
          </span>
        </div>
        <p class="text-sm text-muted">
          Scheduled <LeagueTime :iso="match.scheduledAt" />. You’re reporting for
          <strong class="text-text">{{ mySide === 'home' ? match.home.name : match.away.name }}</strong>.
          <RouterLink :to="`/matches/${match.id}`" class="text-gold hover:text-gold-strong">Match page</RouterLink>
        </p>
      </header>

      <UiCard v-if="status" class="mt-6" eyebrow="Report status" title="Where this match stands">
        <ReportStatusPanel :status="status" :home-tag="match.home.tag" :away-tag="match.away.tag" :my-team-side="mySide" />
      </UiCard>

      <UiEmptyState
        v-if="opensLater"
        class="mt-6"
        title="Reporting isn’t open yet"
        description="The report form opens at the scheduled match time."
      />

      <UiEmptyState
        v-else-if="settled"
        class="mt-6"
        title="This match is settled"
        description="Reports can’t be changed once a result is confirmed. If something is wrong, open a dispute."
      >
        <UiButton :to="`/matches/${match.id}`" variant="secondary">View the result</UiButton>
      </UiEmptyState>

      <form v-else class="mt-6 flex flex-col gap-6" novalidate @submit.prevent="submit">
        <div v-if="restoredDraft" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold-dim bg-gold-soft px-4 py-3 text-sm">
          <span>Restored your unsent draft from this device.</span>
          <UiButton size="sm" variant="ghost" @click="discard">Discard draft</UiButton>
        </div>
        <p v-if="submittedAt" class="text-sm text-muted">
          You submitted this report <LeagueTime :iso="submittedAt" />. Submitting again replaces it until the match is confirmed.
        </p>

        <ReportMapCard
          v-for="(m, i) in maps"
          :key="i"
          v-model="maps[i]!"
          :index="i"
          :home-team="match.home"
          :away-team="match.away"
          :modes="game.modes.value"
          :maps="game.maps.value"
          :legal="game.legal.value"
          :roster="roster"
          :previews="previews"
          :uploading="uploading === i"
          :issues="issuesFor(i)"
          :removable="removable(i)"
          @upload="upload(i, $event)"
          @remove="removeMap(i)"
        />

        <ul v-if="seriesIssues.length" id="series-issues" class="flex flex-col gap-1 rounded-md border border-loss/50 bg-loss-soft px-4 py-3 text-sm text-loss">
          <li v-for="msg in seriesIssues" :key="msg">{{ msg }}</li>
        </ul>

        <div class="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
          <span class="text-sm text-muted">
            Series <strong class="tnum text-text">{{ match.home.tag }} {{ series.home }} – {{ series.away }} {{ match.away.tag }}</strong>
          </span>
          <span class="flex gap-2">
            <UiButton variant="secondary" @click="saveDraft">Save draft</UiButton>
            <UiButton type="submit" :loading="submitting">{{ submittedAt ? 'Resubmit report' : 'Submit report' }}</UiButton>
          </span>
        </div>
      </form>
    </template>
  </div>
</template>

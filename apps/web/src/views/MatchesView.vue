<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import MatchCard from '@/components/match/MatchCard.vue'
import { currentWeek, useSeasonSchedule } from '@/composables/useMatches'
import { site } from '@/config/site'

const route = useRoute()
const router = useRouter()
const { season, matches, loading } = useSeasonSchedule()

const week = ref<number | ''>('')
const team = ref<string>(typeof route.query.team === 'string' ? route.query.team : '')
const stage = ref<'regular' | 'playoff' | ''>('')

// Default to the current week once matches load (unless a team filter shows the whole season).
watch(
  matches,
  (m) => {
    if (week.value === '' && m.length && !team.value) week.value = currentWeek(m)
  },
  { immediate: true },
)
watch(team, (t) => {
  void router.replace({ query: t ? { team: t } : {} })
  if (t) week.value = ''
})

const weekOptions = computed(() => {
  const weeks = [...new Set(matches.value.filter((m) => m.stage === 'regular').map((m) => m.week))].sort((a, b) => a - b)
  return [{ value: '' as const, label: 'All weeks' }, ...weeks.map((w) => ({ value: w, label: `Week ${w}` }))]
})
const teamOptions = computed(() => {
  const teams = new Map<string, string>()
  for (const m of matches.value) {
    teams.set(m.home.id, m.home.name)
    teams.set(m.away.id, m.away.name)
  }
  return [{ value: '', label: 'All teams' }, ...[...teams].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))]
})
const stageOptions = [
  { value: '' as const, label: 'All stages' },
  { value: 'regular' as const, label: 'Regular season' },
  { value: 'playoff' as const, label: 'Playoffs' },
]

const filtered = computed(() =>
  matches.value.filter(
    (m) =>
      (week.value === '' || m.week === week.value || (m.stage === 'playoff' && stage.value === 'playoff')) &&
      (!team.value || m.home.id === team.value || m.away.id === team.value) &&
      (!stage.value || m.stage === stage.value),
  ),
)
const live = computed(() => matches.value.filter((m) => m.broadcastLive))
</script>

<template>
  <div>
    <PageHeader
      :eyebrow="season?.name ?? 'Season'"
      title="Matches"
      description="Every match this season. Times are shown in your time zone; hover a time for Eastern."
    />
    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div class="grid gap-3 sm:grid-cols-3">
        <UiSelect v-model="week" label="Week" :options="weekOptions" />
        <UiSelect v-model="team" label="Team" :options="teamOptions" />
        <UiSelect v-model="stage" label="Stage" :options="stageOptions" />
      </div>

      <section v-if="live.length" aria-labelledby="live-title">
        <h2 id="live-title" class="eyebrow mb-3 text-loss">Live now</h2>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="m in live" :key="m.id"><MatchCard :match="m" /></li>
        </ul>
      </section>

      <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="rounded-lg border border-line bg-surface p-4"><UiSkeleton :lines="4" /></div>
      </div>
      <UiEmptyState
        v-else-if="matches.length === 0"
        title="Schedule drops soon"
        description="The schedule is published once team signups close. Join the Discord to hear first."
      >
        <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
      </UiEmptyState>
      <UiEmptyState v-else-if="filtered.length === 0" title="No matches" description="Nothing matches these filters." />
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        <li v-for="m in filtered" :key="m.id"><MatchCard :match="m" /></li>
      </ul>
    </div>
  </div>
</template>

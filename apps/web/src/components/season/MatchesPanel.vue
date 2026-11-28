<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import { useReady } from '@/composables/useReady'
import UiButton from '@/components/ui/UiButton.vue'
import MatchCard from '@/components/match/MatchCard.vue'
import { currentWeek, type MatchCardData } from '@/composables/useMatches'
import { formatLocalDay } from '@/lib/time'
import { site } from '@/config/site'

const props = withDefaults(defineProps<{ matches: MatchCardData[]; loading: boolean; syncQuery?: boolean }>(), {
  syncQuery: false,
})

const route = useRoute()
const router = useRouter()

/** 'all', 'pre' (preseason), 'w<N>' (regular week N) or 'po' (playoffs). */
const week = ref<string>('')
const team = ref<string>(props.syncQuery && typeof route.query.team === 'string' ? route.query.team : '')

// Default to the current week once matches load (unless a team filter shows the whole season).
watch(
  () => props.matches,
  (m) => {
    if (week.value || !m.length) return
    if (team.value) week.value = 'all'
    else if (!m.some((x) => x.stage === 'regular')) week.value = m.some((x) => x.stage === 'playoff') ? 'po' : 'pre'
    else if (m.some((x) => x.stage === 'playoff' && !['confirmed', 'forfeit', 'cancelled'].includes(x.status))) week.value = 'po'
    else week.value = `w${currentWeek(m)}`
  },
  { immediate: true },
)
watch(team, (t) => {
  if (props.syncQuery) void router.replace({ query: t ? { team: t } : {}, hash: route.hash })
  if (t) week.value = 'all'
})

const weekTabs = computed(() => {
  const weeks = [...new Set(props.matches.filter((m) => m.stage === 'regular').map((m) => m.week))].sort((a, b) => a - b)
  return [
    { value: 'all', label: 'All' },
    ...(props.matches.some((m) => m.stage === 'preseason') ? [{ value: 'pre', label: 'Preseason' }] : []),
    ...weeks.map((w) => ({ value: `w${w}`, label: `W${w}` })),
    ...(props.matches.some((m) => m.stage === 'playoff') ? [{ value: 'po', label: 'Playoffs' }] : []),
  ]
})
const teamOptions = computed(() => {
  const teams = new Map<string, string>()
  for (const m of props.matches) {
    teams.set(m.home.id, m.home.name)
    teams.set(m.away.id, m.away.name)
  }
  return [{ value: '', label: 'All teams' }, ...[...teams].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))]
})

function inWeek(m: MatchCardData, w: string) {
  if (!w || w === 'all') return true
  if (w === 'pre') return m.stage === 'preseason'
  if (w === 'po') return m.stage === 'playoff'
  return m.stage === 'regular' && `w${m.week}` === w
}
const filtered = computed(() =>
  props.matches.filter((m) => inWeek(m, week.value) && (!team.value || m.home.id === team.value || m.away.id === team.value)),
)
/** Grouped by match night (the viewer's calendar day). */
const nights = computed(() => {
  const groups = new Map<string, MatchCardData[]>()
  for (const m of filtered.value) {
    const day = formatLocalDay(m.scheduledAt)
    groups.set(day, [...(groups.get(day) ?? []), m])
  }
  return [...groups].map(([day, list]) => ({ day, list }))
})
const live = computed(() => props.matches.filter((m) => m.broadcastLive))
const ready = useReady(() => props.loading)
</script>

<template>
  <UiLoadGate :ready="ready" class="flex flex-col gap-6" label="Loading matches…">
    <template #skeleton>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-2 sm:w-64"><div class="skeleton h-3 w-12 rounded-sm" /><div class="skeleton h-11 w-full" /></div>
        <div class="flex gap-2"><div v-for="n in 6" :key="n" class="skeleton h-9 w-14 rounded-full" /></div>
        <div class="skeleton h-3 w-40 rounded-sm" />
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="n in 6" :key="n" class="skeleton h-32 rounded-xl" />
        </div>
      </div>
    </template>
    <section v-if="live.length" aria-labelledby="live-title">
      <h2 id="live-title" class="eyebrow mb-3 text-accent">Live now</h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="m in live" :key="m.id"><MatchCard :match="m" /></li>
      </ul>
    </section>

    <div class="sm:w-64"><UiSelect v-model="team" label="Team" :options="teamOptions" /></div>

    <UiEmptyState
      v-if="matches.length === 0"
      title="Schedule drops soon"
      description="The schedule is published once team signups close. Join the Discord to hear first."
    >
      <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
    </UiEmptyState>
    <UiTabs v-else v-model="week" :tabs="weekTabs" label="Week" variant="pill">
      <UiEmptyState v-if="filtered.length === 0" title="No matches" description="Nothing matches these filters." />
      <div v-else class="flex flex-col gap-8 pt-2" aria-live="polite">
        <section v-for="n in nights" :key="n.day" :aria-label="n.day">
          <h3 class="eyebrow-line mb-3 text-faint">{{ n.day }}</h3>
          <!-- Phones: compact rows. Larger screens: cards. -->
          <ul class="flex flex-col gap-2 sm:hidden">
            <li v-for="m in n.list" :key="m.id"><MatchCard :match="m" layout="row" /></li>
          </ul>
          <ul class="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="m in n.list" :key="m.id"><MatchCard :match="m" /></li>
          </ul>
        </section>
      </div>
    </UiTabs>
  </UiLoadGate>
</template>

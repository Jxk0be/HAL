<script setup lang="ts">
import { reactive, watch } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'
import type { Database } from '@/types/database'
import type { SeasonPatch, SeasonStatus } from '@/composables/useSeasonAdmin'
import { NIGHTS, toZoned, zonedToUtc, type Night } from '@/lib/time'

type Season = Database['public']['Tables']['seasons']['Row']

const props = defineProps<{ season: Season; readonly: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [patch: SeasonPatch] }>()

const form = reactive({
  name: '',
  status: 'draft' as SeasonStatus,
  signupsOpen: '',
  startsOn: '',
  regularWeeks: '8',
  matchesPerWeek: '2',
  nights: [] as Night[],
  matchTime: '21:00',
  rosterLock: '',
  playoffTeams: '8',
  prize: '',
})

const tz = () => props.season.timezone

watch(
  () => props.season,
  (s) => {
    form.name = s.name
    form.status = s.status
    form.signupsOpen = s.signups_open_at ? toZoned(s.signups_open_at, s.timezone).date : ''
    form.startsOn = s.starts_on ?? ''
    form.regularWeeks = String(s.regular_weeks)
    form.matchesPerWeek = String(s.matches_per_week)
    form.nights = [...s.match_nights] as Night[]
    form.matchTime = s.match_time.slice(0, 5)
    form.rosterLock = s.roster_lock_at ? toZoned(s.roster_lock_at, s.timezone).date : ''
    form.playoffTeams = String(s.playoff_teams)
    form.prize = s.prize_text ?? ''
  },
  { immediate: true },
)

function toggleNight(n: Night, on: boolean) {
  form.nights = on ? [...new Set([...form.nights, n])] : form.nights.filter((x) => x !== n)
}

const statusOptions: { value: SeasonStatus; label: string }[] = [
  { value: 'draft', label: 'Draft (hidden)' },
  { value: 'signups', label: 'Signups open' },
  { value: 'regular', label: 'Regular season' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'complete', label: 'Complete' },
]
const playoffOptions = [4, 8, 16].map((n) => ({ value: String(n), label: `Top ${n}` }))
const nightLabel: Record<Night, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

function submit() {
  emit('save', {
    name: form.name.trim(),
    status: form.status,
    signups_open_at: form.signupsOpen ? zonedToUtc(form.signupsOpen, '00:00', tz()).toISOString() : null,
    starts_on: form.startsOn || null,
    regular_weeks: Number(form.regularWeeks),
    matches_per_week: Number(form.matchesPerWeek),
    match_nights: NIGHTS.filter((n) => form.nights.includes(n)),
    match_time: `${form.matchTime}:00`,
    roster_lock_at: form.rosterLock ? zonedToUtc(form.rosterLock, '23:59', tz()).toISOString() : null,
    playoff_teams: Number(form.playoffTeams),
    prize_text: form.prize.trim() || null,
  })
}
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent="submit">
    <p v-if="readonly" class="rounded-md border border-line-strong bg-surface-2 px-4 py-3 text-sm text-muted">
      Only the owner can change season settings. You can view them here.
    </p>
    <fieldset :disabled="readonly" class="contents">
      <div class="grid gap-5 sm:grid-cols-2">
        <UiInput v-model="form.name" label="Season name" required />
        <UiSelect v-model="form.status" label="Status" :options="statusOptions" hint="Only one season can be in signups, regular season or playoffs." />
        <UiInput v-model="form.signupsOpen" type="date" label="Signups open" hint="Eastern Time." />
        <UiInput v-model="form.startsOn" type="date" label="Regular season starts" hint="Week 1 starts on the Monday of this week." />
        <UiInput v-model="form.regularWeeks" type="number" label="Regular season weeks" />
        <UiInput v-model="form.matchesPerWeek" type="number" label="Matches per week" />
        <UiInput v-model="form.matchTime" type="time" label="Match time (ET)" :hint="`Time zone: ${season.timezone}`" />
        <UiInput v-model="form.rosterLock" type="date" label="Roster lock" hint="Rosters lock at 11:59 PM ET on this date." />
        <UiSelect v-model="form.playoffTeams" label="Playoff teams" :options="playoffOptions" />
        <UiInput v-model="form.prize" label="Prize" placeholder="$400 to the champion" />
      </div>
      <div>
        <p class="eyebrow mb-2 text-muted">Match nights</p>
        <div class="flex flex-wrap gap-4">
          <UiCheckbox
            v-for="n in NIGHTS"
            :key="n"
            :model-value="form.nights.includes(n)"
            :label="nightLabel[n]"
            :disabled="readonly"
            @update:model-value="(v: boolean) => toggleNight(n, v)"
          />
        </div>
      </div>
    </fieldset>
    <div v-if="!readonly">
      <UiButton type="submit" :loading="busy">Save season</UiButton>
    </div>
  </form>
</template>

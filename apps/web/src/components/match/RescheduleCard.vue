<script setup lang="ts">
import { computed, ref } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import LeagueTime from './LeagueTime.vue'
import { rescheduleActions, useMatchReschedules, type RescheduleRequest } from '@/composables/useMatchActions'
import { useToast } from '@/composables/useToast'
import { canReschedule, rescheduleProblem } from '@/lib/reschedule'
import { formatLeagueTime, leagueWeekBounds, localTimeZone, toZoned, zonedToUtc } from '@/lib/time'

/**
 * Reschedule requests on the match page. Captains of either team request a new time (picked in
 * their own time zone, shown in Eastern too); the other captain accepts or declines.
 */
const props = defineProps<{
  match: { id: string; defaultAt: string; scheduledAt: string; status: string; home: { id: string; tag: string }; away: { id: string; tag: string } }
  /** The viewer's team in this match when they captain it, else null. */
  captainOf: string | null
  timezone?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { requests, reload } = useMatchReschedules(() => props.match.id)
const pending = computed(() => requests.value.find((r) => r.status === 'pending') ?? null)
const history = computed(() => requests.value.filter((r) => r.status !== 'pending').slice(0, 5))
const tag = (teamId: string) => (teamId === props.match.home.id ? props.match.home.tag : props.match.away.tag)
const open = computed(() => ['scheduled', 'checkin_open'].includes(props.match.status) && canReschedule(props.match.defaultAt))

// Picker in the viewer's time zone, limited to the league week.
const tz = localTimeZone()
const week = computed(() => leagueWeekBounds(props.match.defaultAt, props.timezone))
const toLocalInput = (d: Date) => {
  const z = toZoned(d.toISOString(), tz)
  return `${z.date}T${z.time}`
}
const min = computed(() => toLocalInput(new Date(Math.max(Date.now() + 5 * 60_000, week.value.start.getTime()))))
const max = computed(() => toLocalInput(new Date(week.value.end.getTime() - 60_000)))
const value = ref('')
const proposed = computed(() => {
  if (!value.value) return null
  const [date, time] = value.value.split('T')
  return date && time ? zonedToUtc(date, time, tz) : null
})
const problem = computed(() => (proposed.value ? rescheduleProblem(proposed.value, props.match, props.timezone) : null))
const busy = ref(false)
const showForm = ref(false)

async function run(p: Promise<{ ok: boolean; message?: string }>, success: string) {
  busy.value = true
  const r = await p
  busy.value = false
  if (!r.ok) {
    toast.error(r.message ?? 'Something went wrong.')
    return false
  }
  toast.success(success)
  await reload()
  emit('changed')
  return true
}

async function submit() {
  if (!proposed.value || problem.value) return
  if (await run(rescheduleActions.request(props.match.id, proposed.value), 'Request sent. The other captain can accept or decline it.')) {
    showForm.value = false
    value.value = ''
  }
}
const respond = (r: RescheduleRequest, accept: boolean) =>
  run(rescheduleActions.respond(r.id, accept), accept ? 'Accepted. The match time is updated.' : 'Declined. The match stays at its time.')
const cancel = (r: RescheduleRequest) => run(rescheduleActions.cancel(r.id), 'Request canceled.')

const STATUS: Record<RescheduleRequest['status'], { label: string; variant: 'win' | 'loss' | 'neutral' | 'accent' }> = {
  pending: { label: 'Pending', variant: 'accent' },
  accepted: { label: 'Accepted', variant: 'win' },
  declined: { label: 'Declined', variant: 'loss' },
  expired: { label: 'Expired', variant: 'neutral' },
  cancelled: { label: 'Canceled', variant: 'neutral' },
}
</script>

<template>
  <UiCard v-if="pending || history.length || (captainOf && open)" eyebrow="Match time" title="Reschedule">
    <div class="flex flex-col gap-4 text-sm">
      <div v-if="pending" class="rounded-md border border-accent-dim bg-accent-soft p-3">
        <p>
          <strong>{{ tag(pending.teamId) }}</strong> asked to move the match to
          <strong><LeagueTime :iso="pending.proposedAt" :timezone="timezone" /></strong>
          <span class="text-muted"> ({{ formatLeagueTime(pending.proposedAt, timezone) }})</span>.
        </p>
        <div v-if="captainOf" class="mt-3 flex flex-wrap gap-2">
          <template v-if="captainOf !== pending.teamId">
            <UiButton size="sm" :loading="busy" @click="respond(pending, true)">Accept</UiButton>
            <UiButton size="sm" variant="secondary" :disabled="busy" @click="respond(pending, false)">Decline</UiButton>
          </template>
          <UiButton v-else size="sm" variant="ghost" :disabled="busy" @click="cancel(pending)">Cancel request</UiButton>
        </div>
        <p class="mt-2 text-xs text-muted">Unanswered requests expire 24 hours before the default time.</p>
      </div>

      <template v-else-if="captainOf && open">
        <UiButton v-if="!showForm" variant="secondary" class="self-start" @click="showForm = true">Request a new time</UiButton>
        <form v-else class="flex flex-col gap-3" @submit.prevent="submit">
          <label class="flex flex-col gap-1.5">
            <span class="font-medium">New time <span class="font-normal text-muted">(your time zone: {{ tz }})</span></span>
            <input
              v-model="value"
              type="datetime-local"
              :min="min"
              :max="max"
              class="h-10 max-w-xs rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              aria-describedby="reschedule-help"
            />
          </label>
          <p id="reschedule-help" class="text-xs text-muted">
            <template v-if="proposed && !problem">That is {{ formatLeagueTime(proposed.toISOString(), timezone) }}. </template>
            Same league week only, by Sunday 11:59 PM ET, agreed at least 24 hours before the default time.
          </p>
          <p v-if="problem" class="text-xs text-loss" role="alert">{{ problem }}</p>
          <div class="flex gap-2">
            <UiButton type="submit" size="sm" :disabled="!proposed || !!problem" :loading="busy">Send request</UiButton>
            <UiButton size="sm" variant="ghost" @click="showForm = false">Cancel</UiButton>
          </div>
        </form>
      </template>

      <p v-if="match.scheduledAt !== match.defaultAt" class="text-xs text-muted">
        Default time was <LeagueTime :iso="match.defaultAt" :timezone="timezone" />.
      </p>

      <ul v-if="history.length" class="flex flex-col gap-1.5 text-xs text-muted">
        <li v-for="r in history" :key="r.id" class="flex flex-wrap items-center gap-2">
          <UiBadge :variant="STATUS[r.status].variant">{{ STATUS[r.status].label }}</UiBadge>
          {{ tag(r.teamId) }} proposed <LeagueTime :iso="r.proposedAt" :timezone="timezone" />
        </li>
      </ul>
    </div>
  </UiCard>
</template>

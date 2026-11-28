<script setup lang="ts">
import { computed, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { MAX_EMERGENCY_SUBS, useMatchEmergencySubs, type EsubCandidate, type EsubState } from '@/composables/useEmergencySubs'
import { useToast } from '@/composables/useToast'

/**
 * Emergency subs on the match page, for the captain / co-captain of a side (rule 4.3):
 * mark who can't play → ask a free agent → they accept (site or Discord DM) → an admin approves.
 * Up to 2 per match, and only while fewer than 4 players are available.
 */
const props = defineProps<{
  match: { id: string; status: string; scheduledAt: string }
  /** The viewer's team in this match when they captain it, else null. */
  captainOf: string | null
}>()

const toast = useToast()
const subs = useMatchEmergencySubs(() => props.match, () => props.captainOf)
const { requests, roster, busy, loaded } = subs
const open = computed(() => Boolean(props.captainOf) && ['scheduled', 'checkin_open', 'live'].includes(props.match.status))

const STATE: Record<EsubState, { label: string; variant: 'neutral' | 'accent' | 'win' | 'loss' }> = {
  waiting: { label: 'Waiting for the player', variant: 'neutral' },
  accepted: { label: 'Accepted, waiting for an admin', variant: 'accent' },
  approved: { label: 'Approved', variant: 'win' },
  declined: { label: 'Player declined', variant: 'loss' },
  denied: { label: 'Admin denied', variant: 'loss' },
}

const outPlayers = computed(() => roster.value.filter((p) => p.out))
const available = computed(() => roster.value.filter((p) => p.eligible && !p.out).length)
const active = computed(() => requests.value.filter((r) => ['waiting', 'accepted', 'approved'].includes(r.state)).length)
const anyApproved = computed(() => requests.value.some((r) => r.state === 'approved'))

// Request form
const modal = ref(false)
const markOut = ref<string[]>([])
const reason = ref('')
const query = ref('')
const results = ref<EsubCandidate[]>([])
const picked = ref<EsubCandidate | null>(null)
const note = ref('')
const markable = computed(() => roster.value.filter((p) => p.eligible && !p.out))
const availableAfter = computed(() => available.value - markOut.value.length)
const canSend = computed(() => Boolean(picked.value) && availableAfter.value < 4 && active.value < MAX_EMERGENCY_SUBS)
watchDebounced(query, async (q) => (results.value = await subs.search(q)), { debounce: 250 })

async function openModal() {
  markOut.value = []
  reason.value = ''
  query.value = ''
  picked.value = null
  note.value = ''
  results.value = await subs.search('')
  modal.value = true
}

async function send() {
  if (!picked.value) return toast.error('Pick a free agent first.')
  if (availableAfter.value >= 4) return toast.error('You still have 4 players available. Tick who can’t play.')
  const r = await subs.request(picked.value.id, { outIds: markOut.value, reason: reason.value, note: note.value })
  if (!r.ok) return toast.error(r.message)
  toast.success(`Request sent. ${picked.value.activisionId ?? 'The player'} gets a Discord DM and can answer there or on the site.`)
  modal.value = false
}

async function cancel(id: string) {
  const r = await subs.cancel(id)
  if (r.ok) toast.success('Request withdrawn.')
  else toast.error(r.message)
}

async function backIn(userId: string, name: string) {
  const r = await subs.clearOut(userId)
  if (r.ok) toast.success(`${name} is back in for this match.`)
  else toast.error(r.message)
}
</script>

<template>
  <UiCard v-if="loaded && open" eyebrow="Short a player?" title="Emergency sub">
    <p class="text-sm text-muted">
      If fewer than 4 of your players can play, tick who's out and ask a free agent for this match only. They have to accept, then an
      admin approves. Up to {{ MAX_EMERGENCY_SUBS }} per match; they stay free agents and don't use a roster change (rule 4.3).
    </p>
    <p class="mt-3 text-sm">
      <span class="tnum font-semibold" :class="available < 4 ? 'text-loss' : 'text-win'">{{ available }}</span> of 4 players available.
    </p>

    <div v-if="outPlayers.length" class="mt-3">
      <p class="eyebrow text-muted">Out for this match</p>
      <ul class="mt-1 flex flex-col divide-y divide-line rounded-md border border-line">
        <li v-for="p in outPlayers" :key="p.userId" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span class="min-w-32 flex-1"><span class="font-medium">{{ p.name }}</span><span v-if="p.reason" class="text-muted"> · {{ p.reason }}</span></span>
          <UiButton v-if="!anyApproved" size="sm" variant="ghost" :disabled="busy" @click="backIn(p.userId, p.name)">
            Back in<span class="sr-only">: {{ p.name }}</span>
          </UiButton>
        </li>
      </ul>
      <p v-if="anyApproved" class="mt-1 text-xs text-muted">A sub is approved, so players marked out can't be checked in for this match.</p>
    </div>

    <ul v-if="requests.length" class="mt-4 flex flex-col divide-y divide-line rounded-md border border-line">
      <li v-for="r in requests" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
        <span class="min-w-32 flex-1 font-medium">{{ r.player }}</span>
        <UiBadge :variant="STATE[r.state].variant">{{ STATE[r.state].label }}</UiBadge>
        <UiButton v-if="r.state === 'waiting' || r.state === 'accepted'" size="sm" variant="ghost" :disabled="busy" @click="cancel(r.id)">
          Withdraw<span class="sr-only"> request for {{ r.player }}</span>
        </UiButton>
      </li>
    </ul>
    <UiButton v-if="active < MAX_EMERGENCY_SUBS" class="mt-4" size="sm" variant="secondary" @click="openModal">Request emergency sub</UiButton>
    <p v-else class="mt-4 text-xs text-muted">You have {{ MAX_EMERGENCY_SUBS }} emergency sub requests. Withdraw one to ask someone else.</p>

    <UiModal v-model="modal" title="Request an emergency sub" size="sm">
      <form class="flex flex-col gap-5" @submit.prevent="send">
        <fieldset v-if="markable.length" class="flex flex-col gap-1.5">
          <legend class="mb-1 text-sm font-medium">Who can't play?</legend>
          <label v-for="p in markable" :key="p.userId" class="flex items-center gap-2 text-sm">
            <input v-model="markOut" type="checkbox" :value="p.userId" class="size-4 accent-[var(--color-accent)]" />
            {{ p.name }}
          </label>
          <UiInput v-if="markOut.length" v-model="reason" label="Why (shown to admins)" placeholder="e.g. Sick, working late" />
          <p class="text-xs" :class="availableAfter < 4 ? 'text-muted' : 'text-loss'">
            {{ Math.max(availableAfter, 0) }} of 4 available after this.
            <template v-if="availableAfter >= 4">Tick who can't play: you need fewer than 4 available to request a sub.</template>
            <template v-else>Players you tick can't be checked in for this match once a sub is approved.</template>
          </p>
        </fieldset>

        <div class="flex flex-col gap-2">
          <UiInput v-model="query" label="Find a free agent" placeholder="Activision ID" autocomplete="off" />
          <fieldset class="flex flex-col gap-1">
            <legend class="sr-only">Free agents</legend>
            <p v-if="!results.length" class="text-sm text-muted">No free agents found.</p>
            <label
              v-for="c in results"
              :key="c.id"
              class="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
              :class="picked?.id === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'"
            >
              <input v-model="picked" type="radio" name="esub-player" :value="c" class="accent-[var(--color-accent)]" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ c.activisionId ?? 'Free agent' }}</span>
              <span class="text-xs text-muted">{{ [c.role, c.platform].filter(Boolean).join(' · ') }}</span>
            </label>
          </fieldset>
        </div>

        <UiInput v-model="note" label="Note for the player (optional)" placeholder="e.g. Need one tonight, HP/SnD" />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="modal = false">Cancel</UiButton>
          <UiButton type="submit" :loading="busy" :disabled="!canSend">Send request</UiButton>
        </div>
      </form>
    </UiModal>
  </UiCard>
</template>

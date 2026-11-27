<script setup lang="ts">
import { computed, reactive } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useTeamPreseason, type PreseasonPairing } from '@/composables/usePreseason'
import { useToast } from '@/composables/useToast'
import { preseasonTimeProblem, PRESEASON_GAP_HOURS } from '@/lib/preseason'
import { formatLeagueTime, localTimeZone, toZoned, zonedToUtc } from '@/lib/time'

/**
 * Preseason on My team (captains and co-captains only): answer the invite, then agree on a time for
 * each preseason match. The other team's captain accepts; accepting creates the match.
 */
const props = defineProps<{ teamId: string; seasonId: string }>()

const toast = useToast()
const ps = useTeamPreseason(() => props.teamId, () => props.seasonId)
const { season, invited, interested, pairings, otherMatches, loading, busy } = ps

const visible = computed(() => !loading.value && (invited.value || pairings.value.length > 0))
const closed = computed(() => Boolean(season.value?.generatedAt))
const seasonStartsAt = computed(() =>
  season.value?.startsOn ? zonedToUtc(season.value.startsOn, '00:00', season.value.timezone) : null,
)

const tz = localTimeZone()
const toLocalInput = (d: Date) => {
  const z = toZoned(d.toISOString(), tz)
  return `${z.date}T${z.time}`
}
const minInput = computed(() => toLocalInput(new Date(Date.now() + 60 * 60_000)))
const maxInput = computed(() => (seasonStartsAt.value ? toLocalInput(new Date(seasonStartsAt.value.getTime() - 60_000)) : undefined))

// One picker per pairing.
const inputs = reactive<Record<string, string>>({})
const open = reactive<Record<string, boolean>>({})
function proposedFor(id: string): Date | null {
  const v = inputs[id]
  if (!v) return null
  const [date, time] = v.split('T')
  return date && time ? zonedToUtc(date, time, tz) : null
}
function problemFor(p: PreseasonPairing): string | null {
  const at = proposedFor(p.id)
  if (!at) return null
  return preseasonTimeProblem(at, {
    seasonStartsAt: seasonStartsAt.value,
    otherMatches: otherMatches.value.filter((m) => m.id !== p.match?.id),
  })
}

const opponent = (p: PreseasonPairing) => (p.home.id === props.teamId ? p.away : p.home)
const canPropose = (p: PreseasonPairing) => p.status !== 'cancelled' && !p.pending && (!p.match || p.match.status === 'scheduled')

async function done(r: { ok: true } | { ok: false; message: string }, success: string) {
  if (!r.ok) {
    toast.error(r.message)
    return false
  }
  toast.success(success)
  return true
}

const answer = async (yes: boolean) =>
  done(await ps.setInterest(yes), yes ? "You're in. We'll pair teams once sign-up closes." : 'Got it: your team is sitting this one out.')

async function propose(p: PreseasonPairing) {
  const at = proposedFor(p.id)
  if (!at || problemFor(p)) return
  if (await done(await ps.propose(p.id, at), `Proposed. ${opponent(p).name}'s captain can accept it here or in Discord.`)) {
    inputs[p.id] = ''
    open[p.id] = false
  }
}
const respond = async (proposalId: string, accept: boolean) =>
  done(await ps.respond(proposalId, accept), accept ? 'Accepted. The match is on the schedule.' : 'Declined.')
const cancel = async (proposalId: string) => done(await ps.cancelProposal(proposalId), 'Proposal withdrawn.')
</script>

<template>
  <UiCard v-if="visible" eyebrow="Optional" title="Preseason matches">
    <div class="flex flex-col gap-5 text-sm">
      <!-- 1. The invite -->
      <template v-if="!closed">
        <p class="text-muted">
          Before the regular season we're running optional preseason matches that league casters can stream: 1 or 2 matches
          depending on how many teams sign up. You agree on the time with each opponent. They're played and reported like
          league matches, but don't count toward standings or stats.
        </p>
        <p v-if="interested === true" class="rounded-md border border-win/40 bg-win-soft px-3 py-2">
          <strong>You're in.</strong> We'll pair the teams once sign-up closes.
        </p>
        <p v-else-if="interested === false" class="rounded-md border border-line px-3 py-2 text-muted">Your team is sitting this one out.</p>
        <div class="flex flex-wrap gap-2">
          <UiButton size="sm" :variant="interested === true ? 'secondary' : 'primary'" :loading="busy" :disabled="interested === true" @click="answer(true)">
            We're in
          </UiButton>
          <UiButton size="sm" variant="ghost" :disabled="busy || interested === false" @click="answer(false)">No thanks</UiButton>
        </div>
      </template>

      <p v-else-if="!pairings.length" class="text-muted">The preseason pairings are made and your team isn't playing in this one.</p>

      <!-- 2. The pairings -->
      <template v-if="pairings.length">
        <p class="text-muted">
          Agree on a time with each opponent (each pair has a shared PRESEASON channel in Discord), then propose it here or with
          <code>/preseason</code>. The other captain accepts. Each match needs {{ PRESEASON_GAP_HOURS }} hours to itself so it can be cast.
        </p>
        <ul class="flex flex-col gap-4">
          <li v-for="p in pairings" :key="p.id" class="rounded-md border border-line p-3">
            <div class="flex flex-wrap items-center gap-3">
              <TeamLogo :tag="opponent(p).tag" :name="opponent(p).name" :logo-url="opponent(p).logoUrl" size="sm" decorative />
              <RouterLink :to="`/teams/${opponent(p).id}`" class="min-w-0 flex-1 truncate font-medium hover:text-accent">
                vs {{ opponent(p).name }}
              </RouterLink>
              <UiBadge v-if="p.status === 'cancelled'" variant="loss">Canceled</UiBadge>
              <UiBadge v-else-if="p.match" variant="win">Scheduled</UiBadge>
              <UiBadge v-else variant="accent">No time yet</UiBadge>
            </div>

            <p v-if="p.match && p.status !== 'cancelled'" class="mt-2">
              <RouterLink :to="`/matches/${p.match.id}`" class="hover:text-accent"><LeagueTime :iso="p.match.scheduledAt" /></RouterLink>
              <span class="text-muted"> ({{ formatLeagueTime(p.match.scheduledAt) }})</span>
            </p>

            <div v-if="p.pending" class="mt-3 rounded-md border border-accent-dim bg-accent-soft p-3">
              <p>
                <strong>{{ p.pending.teamId === teamId ? 'You' : opponent(p).name }}</strong>
                proposed
                <strong><LeagueTime :iso="p.pending.proposedAt" /></strong>
                <span class="text-muted"> ({{ formatLeagueTime(p.pending.proposedAt) }})</span>.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <template v-if="p.pending.teamId !== teamId">
                  <UiButton size="sm" :loading="busy" @click="respond(p.pending.id, true)">Accept</UiButton>
                  <UiButton size="sm" variant="secondary" :disabled="busy" @click="respond(p.pending.id, false)">Decline</UiButton>
                </template>
                <template v-else>
                  <span class="self-center text-xs text-muted">Waiting for their captain.</span>
                  <UiButton size="sm" variant="ghost" :disabled="busy" @click="cancel(p.pending.id)">Withdraw</UiButton>
                </template>
              </div>
            </div>

            <template v-else-if="canPropose(p)">
              <UiButton v-if="!open[p.id]" size="sm" variant="secondary" class="mt-3" @click="open[p.id] = true">
                {{ p.match ? 'Propose a new time' : 'Propose a time' }}<span class="sr-only"> vs {{ opponent(p).name }}</span>
              </UiButton>
              <form v-else class="mt-3 flex flex-col gap-2" @submit.prevent="propose(p)">
                <label class="flex flex-col gap-1.5">
                  <span class="font-medium">Time <span class="font-normal text-muted">(your time zone: {{ tz }})</span></span>
                  <input
                    v-model="inputs[p.id]"
                    type="datetime-local"
                    :min="minInput"
                    :max="maxInput"
                    class="h-10 max-w-xs rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                    :aria-describedby="`ps-help-${p.id}`"
                  />
                </label>
                <p :id="`ps-help-${p.id}`" class="text-xs text-muted">
                  <template v-if="proposedFor(p.id) && !problemFor(p)">That is {{ formatLeagueTime(proposedFor(p.id)!.toISOString()) }}. </template>
                  At least 1 hour from now and before the regular season starts.
                </p>
                <p v-if="problemFor(p)" class="text-xs text-loss" role="alert">{{ problemFor(p) }}</p>
                <div class="flex gap-2">
                  <UiButton type="submit" size="sm" :disabled="!proposedFor(p.id) || !!problemFor(p)" :loading="busy">Send</UiButton>
                  <UiButton size="sm" variant="ghost" @click="open[p.id] = false">Cancel</UiButton>
                </div>
              </form>
            </template>
          </li>
        </ul>
      </template>
    </div>
  </UiCard>
</template>

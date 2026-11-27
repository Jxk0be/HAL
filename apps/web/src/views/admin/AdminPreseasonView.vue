<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { usePreseasonAdmin, type PreseasonPairing } from '@/composables/usePreseason'
import { useToast } from '@/composables/useToast'
import { preseasonMatchCount, PRESEASON_GAP_HOURS } from '@/lib/preseason'

/**
 * Admin → Preseason. 1: send invites (every approved team's channel, plus teams approved later).
 * 2: make the pairings from the teams that said yes (a random circle: 2 matches each). 3: teams
 * agree on times themselves; scheduled matches show up on the Casting desk.
 */
const toast = useToast()
const ps = usePreseasonAdmin()
const { season, teams, pairings, loading, busy, error } = ps

const yes = computed(() => teams.value.filter((t) => t.interested === true))
const no = computed(() => teams.value.filter((t) => t.interested === false))
const waiting = computed(() => teams.value.filter((t) => t.invited && t.interested === null))
const notInvited = computed(() => teams.value.filter((t) => !t.invited))
const live = computed(() => pairings.value.filter((p) => p.status !== 'cancelled'))
const scheduled = computed(() => live.value.filter((p) => p.match))
const canSend = computed(() => season.value?.status === 'signups' && !season.value.generatedAt)

async function done(r: { ok: true } | { ok: false; message: string }, success: string) {
  if (!r.ok) toast.error(r.message)
  else toast.success(success)
  return r.ok
}

const sendInvites = async () =>
  done(await ps.sendInvites(), 'Invites sent. Each team channel gets a post within 5 minutes, pinging the roster.')

const confirmOpen = ref(false)
async function generate() {
  const replace = live.value.length > 0
  if (await done(await ps.generate(replace), 'Pairings made. The bot opens a shared channel for each pair within 5 minutes.')) {
    confirmOpen.value = false
  }
}

const cancelTarget = ref<PreseasonPairing | null>(null)
async function cancelPairing() {
  const p = cancelTarget.value
  if (!p) return
  if (await done(await ps.cancelPairing(p.id), `${p.home.tag} vs ${p.away.tag} canceled. Both teams are told in Discord.`)) cancelTarget.value = null
}

const ANSWER = {
  yes: { label: 'In', variant: 'win' as const },
  no: { label: 'Out', variant: 'loss' as const },
  waiting: { label: 'No answer', variant: 'accent' as const },
  none: { label: 'Not invited', variant: 'neutral' as const },
}
const answerOf = (t: (typeof teams.value)[number]) => (!t.invited ? ANSWER.none : t.interested === true ? ANSWER.yes : t.interested === false ? ANSWER.no : ANSWER.waiting)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Preseason"
      description="Optional preseason matches for casting: invite teams, pair the ones that say yes, and let them pick their times."
    />
    <div class="@container flex flex-col gap-6 px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="8" />
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <UiEmptyState v-else-if="!season" title="No active season" description="Create a season and open signups first (Season & schedule)." />

      <template v-else>
        <!-- Step 1 -->
        <UiCard eyebrow="Step 1" title="Invite teams">
          <div class="flex flex-col gap-4 text-sm">
            <p class="text-muted">
              Posts an invite in every approved team's channel, pinging the roster, with <strong>We're in</strong> /
              <strong>No thanks</strong> buttons for the captain and co-captain. They can also answer on My team. Teams approved later
              get the invite automatically until the pairings are made.
            </p>
            <p v-if="season.invitesAt" class="text-xs text-muted">Invites went out <LeagueTime :iso="season.invitesAt" />.</p>
            <div class="flex flex-wrap items-center gap-3">
              <UiButton :disabled="!canSend || (!!season.invitesAt && !notInvited.length)" :loading="busy" @click="sendInvites">
                {{ season.invitesAt ? `Invite ${notInvited.length} more` : 'Send preseason invites' }}
              </UiButton>
              <span v-if="season.status !== 'signups'" class="text-xs text-muted">Invites go out while signups are open.</span>
            </div>

            <div v-if="teams.length" class="grid gap-x-6 gap-y-1 @2xl:grid-cols-2">
              <p class="eyebrow col-span-full mt-2 text-muted">
                {{ yes.length }} in · {{ no.length }} out · {{ waiting.length }} waiting<template v-if="notInvited.length"> · {{ notInvited.length }} not invited</template>
              </p>
              <div v-for="t in teams" :key="t.team.id" class="flex items-center gap-3 border-b border-line py-2">
                <TeamLogo :tag="t.team.tag" :name="t.team.name" :logo-url="t.team.logoUrl" size="sm" decorative />
                <RouterLink :to="`/teams/${t.team.id}`" class="min-w-0 flex-1 truncate hover:text-accent">{{ t.team.name }}</RouterLink>
                <UiBadge :variant="answerOf(t).variant">{{ answerOf(t).label }}</UiBadge>
              </div>
            </div>
            <p v-else class="text-muted">No approved teams yet.</p>
          </div>
        </UiCard>

        <!-- Step 2 -->
        <UiCard eyebrow="Step 2" title="Make the pairings">
          <div class="flex flex-col gap-4 text-sm">
            <p class="text-muted">
              Puts the teams that said yes in a random circle, so each plays 2 matches (1 if only 2 teams said yes), with no times yet.
              The bot opens a shared <strong>PRESEASON</strong> channel for each pair (both teams, admins and casters) and tells each
              team in its own channel. Answers close once the pairings are made.
            </p>
            <p v-if="yes.length >= 2" class="text-xs text-muted">
              {{ yes.length }} teams → {{ preseasonMatchCount(yes.length) }} {{ preseasonMatchCount(yes.length) === 1 ? 'match' : 'matches' }}.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <UiButton :disabled="!season.invitesAt || yes.length < 2" :loading="busy" @click="live.length ? (confirmOpen = true) : generate()">
                {{ live.length ? 'Redo the pairings' : 'Make the pairings' }}
              </UiButton>
              <span v-if="!season.invitesAt" class="text-xs text-muted">Send the invites first.</span>
              <span v-else-if="yes.length < 2" class="text-xs text-muted">At least 2 teams need to say yes.</span>
            </div>
          </div>
        </UiCard>

        <!-- Step 3 -->
        <UiCard eyebrow="Step 3" title="Matches">
          <template #actions>
            <UiButton v-if="scheduled.length" to="/admin/casting" size="sm" variant="secondary">Casting desk</UiButton>
          </template>
          <div class="flex flex-col gap-4 text-sm">
            <p class="text-muted">
              Captains propose a time (site or <code>/preseason</code>) and the other captain accepts. A time within
              {{ PRESEASON_GAP_HOURS }} hours of another match is refused, so every match can be cast. Scheduled matches get
              reminders, check-in and full reporting, and show on the Casting desk. They never count toward standings or stats.
            </p>
            <p v-if="!pairings.length" class="text-muted">No pairings yet.</p>
            <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line">
              <li v-for="p in pairings" :key="p.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" :class="p.status === 'cancelled' ? 'opacity-60' : ''">
                <span class="min-w-48 flex-1">
                  <span class="font-heading text-lg">{{ p.home.tag }} vs {{ p.away.tag }}</span>
                  <span class="block text-xs text-muted">
                    {{ p.home.name }} vs {{ p.away.name }}<template v-if="!p.hasChannel && p.status !== 'cancelled'"> · Discord channel coming</template>
                  </span>
                </span>
                <UiBadge v-if="p.status === 'cancelled'" variant="loss">Canceled</UiBadge>
                <RouterLink v-else-if="p.match" :to="`/matches/${p.match.id}`" class="hover:text-accent">
                  <LeagueTime :iso="p.match.scheduledAt" />
                </RouterLink>
                <UiBadge v-else-if="p.pending" variant="accent">Time proposed</UiBadge>
                <UiBadge v-else variant="neutral">No time yet</UiBadge>
                <UiButton
                  v-if="p.status !== 'cancelled' && (!p.match || ['scheduled', 'checkin_open'].includes(p.match.status))"
                  size="sm"
                  variant="ghost"
                  @click="cancelTarget = p"
                >
                  Cancel<span class="sr-only"> {{ p.home.tag }} vs {{ p.away.tag }}</span>
                </UiButton>
              </li>
            </ul>
          </div>
        </UiCard>
      </template>
    </div>

    <UiModal v-model="confirmOpen" title="Redo the pairings?" size="sm">
      <p class="text-sm text-muted">
        This deletes the current pairings and their Discord channels and makes new ones from the teams that said yes. It only works
        while no preseason match has a time yet.
      </p>
      <template #footer>
        <UiButton variant="ghost" @click="confirmOpen = false">Keep them</UiButton>
        <UiButton variant="danger" :loading="busy" @click="generate">Redo pairings</UiButton>
      </template>
    </UiModal>

    <UiModal :model-value="!!cancelTarget" :title="cancelTarget ? `Cancel ${cancelTarget.home.tag} vs ${cancelTarget.away.tag}?` : 'Cancel'" size="sm" @update:model-value="(v: boolean) => !v && (cancelTarget = null)">
      <p class="text-sm text-muted">The match is canceled (if it had a time) and both teams are told in Discord. The shared channel stays for the record.</p>
      <template #footer>
        <UiButton variant="ghost" @click="cancelTarget = null">Keep it</UiButton>
        <UiButton variant="danger" :loading="busy" @click="cancelPairing">Cancel match</UiButton>
      </template>
    </UiModal>
  </div>
</template>

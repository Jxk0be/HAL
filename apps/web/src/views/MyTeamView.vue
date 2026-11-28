<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import RosterList from '@/components/team/RosterList.vue'
import ManagePlayerModal from '@/components/team/ManagePlayerModal.vue'
import InvitePanel from '@/components/team/InvitePanel.vue'
import TeamRequestsPanel from '@/components/team/TeamRequestsPanel.vue'
import TeamIdentityForm from '@/components/team/TeamIdentityForm.vue'
import TeamBannerField from '@/components/team/TeamBannerField.vue'
import PreseasonCard from '@/components/team/PreseasonCard.vue'
import RecruitPostCard from '@/components/team/RecruitPostCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useTeam } from '@/composables/useTeams'
import { useTeamActions } from '@/composables/useTeamActions'
import { useToast } from '@/composables/useToast'
import { rosterCounts, type RosterPlayer, type TeamIdentity } from '@/lib/teams'
import { site } from '@/config/site'

const auth = useAuthStore()
const toast = useToast()
const actions = useTeamActions()

async function uploadBanner(file: File) {
  if (!team.value) return
  const r = await actions.uploadBanner(team.value.id, file)
  if (!r.ok) return toast.error(r.message ?? 'Could not upload the banner.')
  toast.success('Banner updated.')
  await reload()
}
async function removeBanner() {
  if (!team.value) return
  const r = await actions.updateTeam(team.value.id, { banner_url: null })
  if (!r.ok) return toast.error(r.message ?? 'Could not remove the banner.')
  toast.success('Banner removed.')
  await reload()
}
const { season, loading: seasonLoading } = useActiveSeason()
const { team, loading: teamLoading, reload } = useTeam(() => auth.team?.id)

const uid = computed(() => auth.user?.id)
const isCaptain = computed(() => team.value?.captainId === uid.value)
const canManage = computed(() => isCaptain.value || team.value?.coCaptainId === uid.value)

const counts = computed(() => rosterCounts(team.value?.roster ?? []))
const rules = computed(() => team.value?.rules)
const openSpots = computed(() => Math.max(0, (rules.value?.max_roster ?? 7) - counts.value.total))
const locked = computed(() => {
  const at = rules.value?.roster_lock_at
  return Boolean(at && new Date(at).getTime() <= Date.now())
})
const changesCount = computed(() => rules.value?.status === 'regular' || rules.value?.status === 'playoffs')

// Create team
const createError = ref<string | null>(null)
async function create(v: TeamIdentity) {
  if (!season.value) return
  createError.value = null
  const result = await actions.createTeam({ seasonId: season.value.id, name: v.name, tag: v.tag, description: v.description })
  if (!result.ok) {
    createError.value = result.message
    return
  }
  if (v.logo) {
    const up = await actions.uploadLogo(result.id, v.logo)
    if (!up.ok) toast.error(up.message)
  }
  toast.success(`${v.name} is registered. An admin will approve it soon.`)
  await reload()
}

// Edit identity
const settingsError = ref<string | null>(null)
async function saveIdentity(v: TeamIdentity) {
  const t = team.value
  if (!t) return
  settingsError.value = null
  if (v.name !== t.name || v.tag !== t.tag || v.description !== t.description) {
    const r = await actions.updateTeam(t.id, { name: v.name, tag: v.tag, description: v.description })
    if (!r.ok) {
      settingsError.value = r.message
      return
    }
  }
  if (v.logo) {
    const up = await actions.uploadLogo(t.id, v.logo)
    if (!up.ok) {
      settingsError.value = up.message
      return
    }
  }
  toast.success('Team updated.')
  await Promise.all([reload(), auth.refresh()])
}

// Manage player
const managing = ref<RosterPlayer | null>(null)
const manageOpen = ref(false)
function manage(p: RosterPlayer) {
  managing.value = p
  manageOpen.value = true
}
async function afterChange() {
  await Promise.all([reload(), auth.refresh()])
}

// Leave
const leaveOpen = ref(false)
async function leave() {
  const t = team.value
  if (!t) return
  const r = await actions.leaveTeam(t.id)
  leaveOpen.value = false
  if (!r.ok) return toast.error(r.message)
  toast.show(`You left ${t.name}. You're back on the free agent list.`)
}

// Disband (captain only)
const disbandOpen = ref(false)
async function disband() {
  const t = team.value
  if (!t) return
  const r = await actions.disbandTeam(t.id)
  disbandOpen.value = false
  if (!r.ok) return toast.error(r.message)
  toast.show(`${t.name} is disbanded. Everyone on it, you included, is back on the free agent list.`)
}

const lockDate = computed(() =>
  rules.value?.roster_lock_at
    ? new Date(rules.value.roster_lock_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null,
)
</script>

<template>
  <div>
    <PageHeader
      :eyebrow="team ? team.seasonName : 'Captain'"
      :title="team ? team.name : 'My Team'"
      :description="team ? undefined : 'Create a team for this season, or wait for a captain to invite you.'"
    >
      <template v-if="team" #actions>
        <UiButton :to="`/teams/${team.id}`" variant="secondary" size="sm">Public page</UiButton>
        <UiButton :href="site.discordInviteUrl" variant="secondary" size="sm">Team Discord</UiButton>
      </template>
    </PageHeader>

    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <UiSkeleton v-if="seasonLoading || (auth.team && teamLoading)" :lines="8" />

      <!-- No team yet -->
      <template v-else-if="!team">
        <UiEmptyState
          v-if="!auth.isPlayer"
          title="Staff-only account"
          description="You run the league but don't play, so you can't create or join a team. The owner can change this under Admin → Roles."
        >
          <UiButton to="/admin" variant="secondary">Admin</UiButton>
        </UiEmptyState>
        <UiEmptyState
          v-else-if="!season"
          title="Team registration isn't open yet"
          description="Signups open before Season 1. Join the Discord to hear first."
        >
          <UiButton :href="site.discordInviteUrl">Join the Discord</UiButton>
        </UiEmptyState>
        <UiEmptyState
          v-else-if="season.status !== 'signups'"
          title="Team registration is closed"
          description="New teams can only register during signups. You can still join a team if a captain invites you."
        >
          <UiButton to="/profile" variant="secondary">See my invites</UiButton>
        </UiEmptyState>
        <div v-else class="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <UiCard eyebrow="Signups open" title="Create a team">
            <p class="mb-6 text-sm text-muted">
              You'll be the captain and first starter. Invite up to 3 more starters and 3 subs from
              the free agent list. An admin approves new teams before the season.
            </p>
            <TeamIdentityForm submit-label="Create team" :busy="actions.busy.value" :server-error="createError" @submit="create" />
          </UiCard>
          <UiCard eyebrow="Or" title="Join a team">
            <p class="text-sm text-muted">
              You're on the free agent list, so captains can find you and send an invite. Invites
              show up on your profile.
            </p>
            <UiButton to="/profile" variant="secondary" size="sm" class="mt-4">My invites</UiButton>
          </UiCard>
        </div>
      </template>

      <!-- Manage team -->
      <div v-else class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-4">
          <TeamLogo :tag="team.tag" :name="team.name" :logo-url="team.logoUrl" size="lg" decorative />
          <div class="flex flex-wrap items-center gap-2">
            <UiBadge variant="outline">{{ team.tag }}</UiBadge>
            <UiBadge v-if="team.status === 'pending'" variant="accent">Awaiting approval</UiBadge>
            <UiBadge v-else-if="team.status === 'approved'" variant="win">Approved</UiBadge>
            <UiBadge v-else variant="loss">Removed</UiBadge>
            <UiBadge v-if="team.division">{{ team.division }}</UiBadge>
          </div>
        </div>
        <p
          v-if="team.status === 'removed' && team.reviewNote"
          role="status"
          class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm"
        >
          <strong class="text-loss">Note from league staff:</strong> {{ team.reviewNote }}
        </p>

        <dl class="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4" style="gap: 1px">
          <div class="bg-surface p-4">
            <dt class="eyebrow text-muted">Roster</dt>
            <dd class="tnum mt-1 font-heading text-2xl">{{ counts.total }} <span class="text-base text-muted">of {{ rules?.max_roster }}</span></dd>
          </div>
          <div class="bg-surface p-4">
            <dt class="eyebrow text-muted">Starters · Subs</dt>
            <dd class="tnum mt-1 font-heading text-2xl">
              {{ counts.starters }}/{{ rules?.max_starters }} <span class="text-muted">·</span> {{ counts.subs }}/{{ rules?.max_subs }}
            </dd>
          </div>
          <div class="bg-surface p-4">
            <dt class="eyebrow text-muted">Roster changes used</dt>
            <dd class="tnum mt-1 font-heading text-2xl">{{ team.rosterChangesUsed }} <span class="text-base text-muted">of {{ rules?.max_roster_changes }}</span></dd>
          </div>
          <div class="bg-surface p-4">
            <dt class="eyebrow text-muted">Roster lock</dt>
            <dd class="mt-1 font-heading text-2xl">
              <span v-if="locked" class="text-loss">Locked</span>
              <span v-else-if="lockDate">{{ lockDate }}</span>
              <span v-else class="text-muted">Not set</span>
            </dd>
          </div>
        </dl>
        <p class="-mt-3 text-xs text-muted">
          <template v-if="changesCount">Every add or drop now uses one of your season's roster changes.</template>
          <template v-else>Adds and drops are free until the regular season starts.</template>
          Players must be on the roster 24 hours before a match to play in it.
        </p>

        <div class="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <UiCard eyebrow="Roster" title="Players" :padded="true">
            <RosterList :players="team.roster" :caption="`${team.name} roster`" link-players>
              <template v-if="canManage" #actions="{ player }">
                <UiButton
                  v-if="!player.isCaptain || isCaptain"
                  size="sm"
                  variant="ghost"
                  @click="manage(player)"
                >
                  Manage<span class="sr-only"> {{ player.name }}</span>
                </UiButton>
              </template>
            </RosterList>
            <div v-if="!isCaptain" class="mt-5 border-t border-line pt-4">
              <UiButton variant="danger" size="sm" @click="leaveOpen = true">Leave team</UiButton>
            </div>
            <div v-else class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p class="text-xs text-muted">To leave, make another player captain first, or disband the team.</p>
              <UiButton variant="danger" size="sm" @click="disbandOpen = true">Disband team</UiButton>
            </div>
          </UiCard>

          <div class="flex flex-col gap-6">
            <PreseasonCard v-if="canManage && team.status === 'approved'" :team-id="team.id" :season-id="team.seasonId" />
            <UiCard v-if="canManage" eyebrow="Matches" title="Requests">
              <TeamRequestsPanel :team-id="team.id" />
            </UiCard>
            <RecruitPostCard v-if="canManage" :team-id="team.id" :locked="locked" />
            <UiCard v-if="canManage" eyebrow="Recruit" title="Invite players">
              <InvitePanel :team-id="team.id" :open-spots="openSpots" :locked="locked" />
            </UiCard>
            <UiCard v-if="canManage" eyebrow="Settings" title="Team identity">
              <TeamIdentityForm
                :initial="{ name: team.name, tag: team.tag, logoUrl: team.logoUrl, description: team.description }"
                submit-label="Save changes"
                :busy="actions.busy.value"
                :server-error="settingsError"
                @submit="saveIdentity"
              />
            </UiCard>
            <UiCard v-if="canManage" eyebrow="Settings" title="Team banner">
              <TeamBannerField
                :banner-url="team.bannerUrl"
                :busy="actions.busy.value"
                @upload="uploadBanner"
                @remove="removeBanner"
              />
            </UiCard>
          </div>
        </div>

        <ManagePlayerModal
          v-model="manageOpen"
          :team-id="team.id"
          :player="managing"
          :viewer-is-captain="isCaptain"
          :starters-full="counts.starters >= (rules?.max_starters ?? 4)"
          :subs-full="counts.subs >= (rules?.max_subs ?? 3)"
          :removal-counts="changesCount"
          @changed="afterChange"
        />

        <UiModal v-model="leaveOpen" :title="`Leave ${team.name}?`" size="sm">
          <p class="text-sm text-muted">
            You'll go back on the free agent list.
            <template v-if="changesCount"> This uses one of the team's season roster changes.</template>
            You can't join another team in this division for 7 days.
          </p>
          <template #footer>
            <UiButton variant="ghost" @click="leaveOpen = false">Stay</UiButton>
            <UiButton variant="danger" :loading="actions.busy.value" @click="leave">Leave team</UiButton>
          </template>
        </UiModal>

        <UiModal v-model="disbandOpen" :title="`Disband ${team.name}?`" size="sm">
          <div class="flex flex-col gap-3 text-sm text-muted">
            <p>
              Everyone on the roster, you included, leaves the team and goes back on the free agent list. The team's Discord role and
              channel are deleted.
            </p>
            <p>
              If the team has already been scheduled for matches, it stays on record as removed and an admin sorts out those matches.
              This can't be undone, and it's shown on the public audit log.
            </p>
          </div>
          <template #footer>
            <UiButton variant="ghost" @click="disbandOpen = false">Keep team</UiButton>
            <UiButton variant="danger" :loading="actions.busy.value" @click="disband">Disband team</UiButton>
          </template>
        </UiModal>
      </div>
    </div>
  </div>
</template>

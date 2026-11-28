<script setup lang="ts">
import { computed, reactive } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import RecruitingTabs from '@/components/players/RecruitingTabs.vue'
import { removeRecruitPost, useMyRecruitInterest, useRecruitBoard, type RecruitCard } from '@/composables/useRecruiting'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { LOOKING_FOR_LABEL, spotsSummary } from '@/lib/recruiting'

const auth = useAuthStore()
const toast = useToast()
const { posts, loading, error, reload } = useRecruitBoard()
const mine = useMyRecruitInterest(() => auth.user?.id)
// Wait for your own interest list too, so cards don't flip from "Interested" to "Interest sent".
const ready = useReady(() => loading.value || mine.loading.value)

// Players who could join a team can say they're interested.
const canJoin = computed(() => auth.isSignedIn && auth.canPlay && !auth.team && !auth.isBanned)
const myTeamId = computed(() => auth.team?.id ?? null)
const isCaptain = computed(() => Boolean(auth.team && (auth.team.isCaptain || auth.team.isCoCaptain)))

const expanded = reactive(new Set<string>())
const toggleNote = (id: string) => (expanded.has(id) ? expanded.delete(id) : expanded.add(id))
const isLongNote = (note: string) => note.length > 180 || note.split('\n').length > 4
const updated = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

async function interested(p: RecruitCard) {
  const r = await mine.interested(p.postId)
  if (!r.ok) return toast.error(r.message)
  toast.success(`${p.teamName}'s captains will get a ping in their team channel. Invites show up on your profile.`)
}

async function takeDown(p: RecruitCard) {
  const r = await removeRecruitPost(p.postId)
  if (!r.ok) return toast.error(r.message)
  toast.show(`${p.teamName}'s post was taken down.`)
  await reload()
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Recruiting"
      title="Teams recruiting"
      description="Teams looking for a starter or a sub. Say you're interested and the captains get a ping."
    >
      <template v-if="isCaptain" #actions>
        <UiButton to="/my-team" variant="secondary">Post for my team</UiButton>
      </template>
    </PageHeader>

    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <RecruitingTabs />

      <p v-if="!auth.isSignedIn" class="text-sm text-muted">
        <RouterLink to="/login" class="text-accent hover:text-accent-strong">Log in with Discord</RouterLink>
        to tell a team you're interested.
      </p>
      <p v-else-if="!auth.isOnboarded" class="rounded-md border border-accent-dim/40 bg-accent-soft px-4 py-3 text-sm">
        <RouterLink to="/onboarding" class="text-accent hover:text-accent-strong">Finish your profile</RouterLink>
        to tell a team you're interested.
      </p>

      <div v-if="!ready" role="status" aria-busy="true">
        <span class="sr-only">Loading recruiting posts…</span>
        <UiPageSkeleton variant="cards" :count="3" />
      </div>
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <UiEmptyState
        v-else-if="posts.length === 0"
        title="No teams are recruiting right now"
        description="Captains post from My team. Meanwhile, put yourself on the free agent board."
      >
        <UiButton to="/free-agents" variant="secondary">Free agents</UiButton>
      </UiEmptyState>
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="p in posts" :key="p.postId" class="flex flex-col rounded-lg border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <TeamLogo :tag="p.teamTag" :name="p.teamName" :logo-url="p.logoUrl" size="md" decorative />
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/teams/${p.teamId}`" class="block truncate font-medium hover:text-accent">{{ p.teamName }}</RouterLink>
              <p class="mt-0.5 text-xs text-muted">
                [{{ p.teamTag }}]<template v-if="p.pending"> · Awaiting approval</template>
              </p>
            </div>
            <UiBadge variant="accent">{{ LOOKING_FOR_LABEL[p.lookingFor] }}</UiBadge>
          </div>
          <dl class="mt-4 flex flex-col gap-2 text-sm">
            <div class="flex gap-6">
              <div>
                <dt class="eyebrow text-muted">{{ p.roles.length > 1 ? 'Roles' : 'Role' }}</dt>
                <dd class="mt-0.5">{{ p.roles.length ? p.roles.join(', ') : 'Any' }}</dd>
              </div>
              <div>
                <dt class="eyebrow text-muted">Open</dt>
                <dd class="mt-0.5">{{ spotsSummary(p.spots) }}</dd>
              </div>
            </div>
            <div v-if="p.availability">
              <dt class="eyebrow text-muted">When they play</dt>
              <dd class="mt-0.5">{{ p.availability }}</dd>
            </div>
            <div v-if="p.note">
              <dt class="sr-only">About the spot</dt>
              <dd :id="`rc-note-${p.postId}`" class="whitespace-pre-line text-muted" :class="expanded.has(p.postId) ? '' : 'line-clamp-4'">{{ p.note }}</dd>
              <button
                v-if="isLongNote(p.note)"
                type="button"
                class="mt-1 text-sm text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
                :aria-expanded="expanded.has(p.postId)"
                :aria-controls="`rc-note-${p.postId}`"
                @click="toggleNote(p.postId)"
              >
                {{ expanded.has(p.postId) ? 'Show less' : 'Show more' }}<span class="sr-only"> of {{ p.teamName }}'s post</span>
              </button>
            </div>
          </dl>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <span class="text-xs text-muted">Updated {{ updated(p.updatedAt) }}</span>
            <div class="flex gap-2">
              <UiButton v-if="auth.isAdmin" size="sm" variant="ghost" @click="takeDown(p)">
                Take down<span class="sr-only"> {{ p.teamName }}'s post</span>
              </UiButton>
              <UiBadge v-if="myTeamId === p.teamId" variant="outline">Your team</UiBadge>
              <template v-else-if="canJoin">
                <UiBadge v-if="mine.postIds.value.has(p.postId)" variant="accent">Interest sent</UiBadge>
                <UiButton v-else size="sm" :loading="mine.busy.value === p.postId" @click="interested(p)">
                  I'm interested<span class="sr-only"> in {{ p.teamName }}</span>
                </UiButton>
              </template>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

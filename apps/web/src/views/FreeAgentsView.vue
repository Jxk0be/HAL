<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import FreeAgentPostForm from '@/components/players/FreeAgentPostForm.vue'
import RecruitingTabs from '@/components/players/RecruitingTabs.vue'
import { useFreeAgentBoard, type FreeAgentCard } from '@/composables/useDirectory'
import { useFreeAgentModeration, useMyFreeAgentPost, useOpenSpots, type PostInput } from '@/composables/useFreeAgentPost'
import { useTeamInvites } from '@/composables/useInvites'
import { useTeamActions } from '@/composables/useTeamActions'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { PLATFORM_OPTIONS } from '@/lib/validation/profile'
import { FREE_AGENT_ROLES } from '@/lib/players'
import { RANK_STATUS_TEXT } from '@/lib/validation/profile'

const auth = useAuthStore()
const toast = useToast()
const board = useFreeAgentBoard()
const { search, platform, role, page, pages, rows, total, loading, error } = board
const { season } = useActiveSeason()
const rankNote = computed(() => (auth.rankStatus in RANK_STATUS_TEXT ? RANK_STATUS_TEXT[auth.rankStatus as keyof typeof RANK_STATUS_TEXT] : null))

// Long notes are clamped to 4 lines on the card; "Show more" opens one card's note in full.
const expanded = reactive(new Set<string>())
const toggleNote = (id: string) => (expanded.has(id) ? expanded.delete(id) : expanded.add(id))
/** Roughly more than 4 lines on a card: long text, or several line breaks. */
const isLongNote = (note: string) => note.length > 180 || note.split('\n').length > 4

// Your post
const myPost = useMyFreeAgentPost()
const postOpen = ref(false)
const postError = ref<string | null>(null)
const canPost = computed(() => auth.isSignedIn && auth.canPlay && !auth.team && !auth.isBanned)
async function savePost(v: PostInput) {
  postError.value = null
  const r = await myPost.save(v, season.value?.id ?? null)
  if (!r.ok) {
    postError.value = r.message
    return
  }
  postOpen.value = false
  toast.success('Your free agent post is live.')
  await board.reload()
}
async function takeDown() {
  const r = await myPost.takeDown()
  if (!r.ok) return toast.error(r.message)
  toast.show('Your post was taken down. You are still listed as a free agent.')
  await board.reload()
}

// Captains invite
const teamId = () => (auth.team && (auth.team.isCaptain || auth.team.isCoCaptain) ? auth.team.id : null)
const isCaptain = computed(() => teamId() !== null)
const spots = useOpenSpots(teamId)
const sent = useTeamInvites(teamId)
const invited = computed(() => new Set(sent.invites.value.map((i) => i.player.id)))
const actions = useTeamActions()
async function invite(p: FreeAgentCard) {
  const r = await actions.invite(auth.team!.id, p.id)
  if (!r.ok) return toast.error(r.message)
  toast.success(`Invite sent to ${p.name}.`)
  await sent.reload()
}

// Staff moderation
const mod = useFreeAgentModeration()
async function hide(p: FreeAgentCard) {
  if (!p.postId) return
  const r = await mod.hide(p.postId)
  if (!r.ok) return toast.error(r.message)
  toast.show(`${p.name}'s post was taken down.`)
  await board.reload()
}

const platformOptions = PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'pc' ? 'PC' : o.label }))
const roleOptions = FREE_AGENT_ROLES.map((r) => ({ value: r, label: r }))
const posted = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Recruiting"
      title="Free Agents"
      description="Players looking for a team. Captains can invite them while they have an open spot."
    >
      <template v-if="canPost" #actions>
        <UiButton @click="postOpen = true">{{ myPost.post.value ? 'Edit my post' : 'Post as free agent' }}</UiButton>
      </template>
    </PageHeader>

    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <RecruitingTabs />

      <!-- Your post -->
      <UiCard v-if="canPost && myPost.post.value" eyebrow="Your post" title="You're on the board">
        <p class="text-sm text-muted">
          <template v-if="myPost.post.value.preferred_role">{{ myPost.post.value.preferred_role }} · </template>
          {{ myPost.post.value.availability ?? 'No availability set' }}
        </p>
        <template #actions>
          <div class="flex gap-2">
            <UiButton size="sm" variant="secondary" @click="postOpen = true">Edit</UiButton>
            <UiButton size="sm" variant="ghost" :loading="myPost.saving.value" @click="takeDown">Take down</UiButton>
          </div>
        </template>
      </UiCard>
      <p v-else-if="auth.isSignedIn && !auth.isOnboarded" class="rounded-md border border-accent-dim/40 bg-accent-soft px-4 py-3 text-sm">
        <RouterLink to="/onboarding" class="text-accent hover:text-accent-strong">Finish your profile</RouterLink>
        to appear on the free agent board.
      </p>
      <p v-else-if="auth.isSignedIn && auth.isPlayer && !auth.canPlay && rankNote" class="rounded-md border border-accent-dim/40 bg-accent-soft px-4 py-3 text-sm">
        {{ rankNote }}
      </p>
      <p v-else-if="!auth.isSignedIn" class="text-sm text-muted">
        <RouterLink to="/login" class="text-accent hover:text-accent-strong">Log in with Discord</RouterLink>
        to see Discord names, post as a free agent or invite players.
      </p>

      <!-- Filters -->
      <div class="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]" role="search">
        <UiInput v-model="search" label="Search" :placeholder="auth.isSignedIn ? 'Discord name or Activision ID' : 'Activision ID'" hide-label>
          <template #prefix>
            <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.5" />
              <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </template>
        </UiInput>
        <UiSelect v-model="platform" label="Platform" hide-label :options="[{ value: '', label: 'All platforms' }, ...platformOptions]" />
        <UiSelect v-model="role" label="Role" hide-label :options="[{ value: '', label: 'All roles' }, ...roleOptions]" />
      </div>

      <!-- Board -->
      <div v-if="loading && rows.length === 0" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="rounded-lg border border-line bg-surface p-5"><UiSkeleton :lines="4" /></div>
      </div>
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <UiEmptyState
        v-else-if="rows.length === 0"
        :title="search || platform || role ? 'No free agents match' : 'No free agents yet'"
        :description="search || platform || role ? 'Try a different search or clear the filters.' : 'Players appear here once they log in and finish their profile.'"
      />
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" :aria-busy="loading">
        <li v-for="p in rows" :key="p.id" class="flex flex-col rounded-lg border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <UiAvatar :src="p.avatarUrl" :name="p.name" size="md" decorative />
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/players/${p.id}`" class="block truncate font-medium hover:text-accent">{{ p.name }}</RouterLink>
              <p class="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <PlatformBadge :platform="p.platform" />
                <span v-if="p.discordUsername" class="truncate">{{ p.activisionId }}</span>
              </p>
            </div>
            <UiBadge v-if="p.role" variant="accent">{{ p.role }}</UiBadge>
          </div>
          <dl v-if="p.availability || p.note" class="mt-4 flex flex-col gap-2 text-sm">
            <div v-if="p.availability">
              <dt class="eyebrow text-muted">Availability</dt>
              <dd class="mt-0.5">{{ p.availability }}</dd>
            </div>
            <div v-if="p.note">
              <dt class="sr-only">About</dt>
              <dd :id="`fa-note-${p.id}`" class="whitespace-pre-line text-muted" :class="expanded.has(p.id) ? '' : 'line-clamp-4'">{{ p.note }}</dd>
              <button
                v-if="isLongNote(p.note)"
                type="button"
                class="mt-1 text-sm text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
                :aria-expanded="expanded.has(p.id)"
                :aria-controls="`fa-note-${p.id}`"
                @click="toggleNote(p.id)"
              >
                {{ expanded.has(p.id) ? 'Show less' : 'Show more' }}<span class="sr-only"> of {{ p.name }}'s post</span>
              </button>
            </div>
          </dl>
          <p v-else class="mt-4 text-sm text-faint">No post yet.</p>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <span class="text-xs text-muted">{{ p.postedAt ? `Posted ${posted(p.postedAt)}` : '' }}</span>
            <div class="flex gap-2">
              <UiButton
                v-if="auth.isAdmin && p.postId"
                size="sm"
                variant="ghost"
                :disabled="mod.busy.value"
                @click="hide(p)"
              >
                Take down<span class="sr-only"> {{ p.name }}'s post</span>
              </UiButton>
              <template v-if="isCaptain && p.id !== auth.user?.id">
                <UiBadge v-if="invited.has(p.id)" variant="accent">Invited</UiBadge>
                <UiButton v-else-if="spots.open.value > 0" size="sm" :disabled="actions.busy.value" @click="invite(p)">
                  Invite to team<span class="sr-only"> {{ p.name }}</span>
                </UiButton>
              </template>
            </div>
          </div>
        </li>
      </ul>

      <UiPagination v-model="page" :pages="pages" :total="total" label="Free agent pages" />
    </div>

    <UiModal
      v-model="postOpen"
      :title="myPost.post.value ? 'Edit your free agent post' : 'Post as a free agent'"
      description="Your Activision ID and platform come from your profile."
    >
      <FreeAgentPostForm
        :initial="myPost.post.value"
        :busy="myPost.saving.value"
        :error="postError"
        @submit="savePost"
        @cancel="postOpen = false"
      />
    </UiModal>
  </div>
</template>

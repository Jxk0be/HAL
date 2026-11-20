<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import ProfileForm from '@/components/profile/ProfileForm.vue'
import InvitesCard from '@/components/profile/InvitesCard.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { PLATFORM_OPTIONS } from '@/lib/validation/profile'

const auth = useAuthStore()
const toast = useToast()

const platformLabel = computed(
  () => PLATFORM_OPTIONS.find((o) => o.value === auth.profile?.platform)?.label ?? 'No platform yet',
)
const roleLabel = computed(() => {
  const t = auth.team
  if (!t) return ''
  if (t.isCaptain) return 'Captain'
  if (t.isCoCaptain) return 'Co-captain'
  return t.role === 'starter' ? 'Starter' : 'Sub'
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Account" title="My Profile" />

    <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[20rem_1fr]">
      <!-- Identity -->
      <aside class="flex flex-col gap-6">
        <UiCard>
          <div class="flex items-center gap-4">
            <UiAvatar :src="auth.avatarUrl" :name="auth.displayName" size="lg" decorative />
            <div class="min-w-0">
              <p class="truncate font-heading text-2xl">{{ auth.displayName }}</p>
              <p class="truncate text-sm text-muted">
                {{ auth.profile?.activision_id ?? 'No Activision ID yet' }}
              </p>
            </div>
          </div>
          <dl class="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt class="eyebrow text-muted">Platform</dt>
              <dd class="mt-1">{{ platformLabel }}</dd>
            </div>
            <div>
              <dt class="eyebrow text-muted">Status</dt>
              <dd class="mt-1 flex flex-wrap gap-1">
                <UiBadge v-if="auth.isBanned" variant="loss">Banned</UiBadge>
                <UiBadge v-else-if="!auth.isOnboarded" variant="outline">Setup needed</UiBadge>
                <UiBadge v-else-if="auth.team" variant="gold">{{ roleLabel }}</UiBadge>
                <UiBadge v-else-if="auth.profile?.is_free_agent" variant="win">Free agent</UiBadge>
                <UiBadge v-else>Not listed</UiBadge>
              </dd>
            </div>
          </dl>
          <p class="mt-4 text-xs text-muted">
            Your Discord name and avatar update automatically each time you log in.
          </p>
        </UiCard>

        <UiCard eyebrow="This season" title="Team">
          <div v-if="auth.team" class="flex items-center gap-3">
            <TeamLogo :tag="auth.team.tag" :name="auth.team.name" :logo-url="auth.team.logo_url" decorative />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ auth.team.name }}</p>
              <p class="text-xs text-muted">{{ roleLabel }} · {{ auth.team.seasonName }}</p>
            </div>
            <UiButton to="/my-team" size="sm" variant="secondary">Open</UiButton>
          </div>
          <div v-else class="text-sm text-muted">
            <p>You're not on a team yet.</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UiButton to="/my-team" size="sm">Create a team</UiButton>
              <UiButton to="/free-agents" size="sm" variant="secondary">Free agents</UiButton>
            </div>
          </div>
        </UiCard>
      </aside>

      <!-- Edit -->
      <div class="flex flex-col gap-6">
        <InvitesCard />
        <UiCard eyebrow="Player details" title="Edit profile">
          <ProfileForm
            v-if="auth.profile"
            :profile="auth.profile"
            :on-team="Boolean(auth.team)"
            @saved="toast.success('Profile saved.')"
          />
          <UiSkeleton v-else :lines="6" />
        </UiCard>

        <UiCard eyebrow="Stats" title="Match history">
          <UiEmptyState
            title="No matches yet"
            description="Your confirmed matches and stats will show here once the season starts."
          />
        </UiCard>
      </div>
    </div>
  </div>
</template>

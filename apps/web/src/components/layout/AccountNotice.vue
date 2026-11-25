<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { RANK_STATUS_TEXT } from '@/lib/validation/profile'

/** Site-wide notice for signed-in players: banned, profile setup still needed, or a rank that can't play yet. */
const auth = useAuthStore()
const route = useRoute()

const bannedText = computed(() => {
  const until = auth.bannedUntil
  if (!until) return ''
  const permanent = until.getFullYear() >= 2100
  return permanent
    ? 'Your account is permanently banned from Blackhat. You can still browse the site.'
    : `Your account is banned from league play until ${until.toLocaleDateString(undefined, { dateStyle: 'long' })}. You can still browse the site.`
})
const rankText = computed(() => {
  if (!auth.isSignedIn || !auth.isPlayer || !auth.isOnboarded || auth.canPlay) return null
  const s = auth.rankStatus
  return s in RANK_STATUS_TEXT ? RANK_STATUS_TEXT[s as keyof typeof RANK_STATUS_TEXT] : null
})
const showSetup = computed(
  () => auth.isSignedIn && auth.profile && !auth.isOnboarded && !auth.isBanned && route.name !== 'onboarding',
)
</script>

<template>
  <div v-if="auth.isBanned" role="status" class="border-b border-loss/30 bg-loss-soft print:hidden">
    <p class="mx-auto max-w-7xl px-4 py-2.5 text-sm text-loss sm:px-6">{{ bannedText }}</p>
  </div>
  <div v-else-if="showSetup" class="border-b border-accent-dim/40 bg-accent-soft print:hidden">
    <p class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
      <span>Finish your player profile to join or create a team.</span>
      <RouterLink to="/onboarding" class="font-heading tracking-wider text-accent hover:text-accent-strong">
        Set it up →
      </RouterLink>
    </p>
  </div>
  <div v-else-if="rankText" role="status" class="border-b border-accent-dim/40 bg-accent-soft print:hidden">
    <p class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
      <span>{{ rankText }}</span>
      <RouterLink to="/profile" class="font-heading tracking-wider text-accent hover:text-accent-strong">My profile →</RouterLink>
    </p>
  </div>
</template>

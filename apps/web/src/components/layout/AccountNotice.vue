<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** Site-wide notice for signed-in players: banned, or profile setup still needed. */
const auth = useAuthStore()
const route = useRoute()

const bannedText = computed(() => {
  const until = auth.bannedUntil
  if (!until) return ''
  const permanent = until.getFullYear() >= 2100
  return permanent
    ? 'Your account is permanently banned from HAL. You can still browse the site.'
    : `Your account is banned from league play until ${until.toLocaleDateString(undefined, { dateStyle: 'long' })}. You can still browse the site.`
})
const showSetup = computed(
  () => auth.isSignedIn && auth.profile && !auth.isOnboarded && !auth.isBanned && route.name !== 'onboarding',
)
</script>

<template>
  <div v-if="auth.isBanned" role="status" class="border-b border-loss/30 bg-loss-soft">
    <p class="mx-auto max-w-7xl px-4 py-2.5 text-sm text-loss sm:px-6">{{ bannedText }}</p>
  </div>
  <div v-else-if="showSetup" class="border-b border-gold-dim/40 bg-gold-soft">
    <p class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
      <span>Finish your player profile to join or create a team.</span>
      <RouterLink to="/onboarding" class="font-heading tracking-wider text-gold hover:text-gold-strong">
        Set it up →
      </RouterLink>
    </p>
  </div>
</template>

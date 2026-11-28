<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { RANK_STATUS_TEXT } from '@/lib/validation/profile'
import { site } from '@/config/site'

/**
 * Site-wide notice for signed-in players: banned, profile setup still needed, a rank that can't
 * play yet, or not in the league Discord server.
 */
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
// Only once the bot has actually checked (null = unknown, so say nothing).
const showDiscord = computed(() => auth.isSignedIn && auth.inDiscord === false)
const toast = useToast()
const checking = ref(false)
async function recheck() {
  checking.value = true
  const inServer = await auth.recheckDiscord()
  checking.value = false
  if (inServer) toast.success("Found you in the Discord. You're all set.")
  else toast.error("We still can't find you in the server. Join with the same Discord account you log in with, then try again in a minute.")
}
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
  <div v-else-if="showDiscord" role="status" class="border-b border-discord/40 bg-discord/10 print:hidden">
    <p class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm sm:px-6">
      <span>You're not in the Blackhat Discord yet. Match reminders, check-in and your team channel all happen there.</span>
      <a
        :href="site.discordInviteUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-heading tracking-wider text-text underline decoration-discord decoration-2 underline-offset-4 hover:text-white"
      >
        Join the Discord<span class="sr-only"> (opens in a new tab)</span>
      </a>
      <button
        type="button"
        class="font-heading tracking-wider text-muted hover:text-text disabled:opacity-60"
        :disabled="checking"
        @click="recheck"
      >
        {{ checking ? 'Checking…' : "I've joined" }}
      </button>
    </p>
  </div>
</template>

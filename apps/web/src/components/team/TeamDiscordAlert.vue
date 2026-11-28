<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import DiscordGlyph from '@/components/brand/DiscordGlyph.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import type { RosterPlayer } from '@/lib/teams'
import { site } from '@/config/site'

/**
 * Rule 3.13: every rostered player must be in the league Discord. Shown publicly on the team page
 * and on My Team, one line per player who isn't in the server. Players the bot hasn't checked yet
 * aren't listed; nothing shows when everyone is in.
 */
// The page loads `status` (useTeamDiscordPresence) so it can wait for it before rendering.
const props = defineProps<{ status: Map<string, boolean | null>; roster: RosterPlayer[]; canManage?: boolean }>()

const auth = useAuthStore()
const toast = useToast()

const missing = computed(() => props.roster.filter((p) => props.status.get(p.userId) === false))
const meMissing = computed(() => missing.value.some((p) => p.userId === auth.user?.id))

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(site.discordInviteUrl)
    toast.success('Invite link copied. Send it to your teammates.')
  } catch {
    toast.error(`Couldn't copy. The link is ${site.discordInviteUrl}`)
  }
}
</script>

<template>
  <section
    v-if="missing.length"
    role="status"
    aria-labelledby="discord-alert-title"
    class="overflow-hidden rounded-xl border border-accent-dim/60 bg-accent-soft"
  >
    <div class="flex items-center gap-2.5 border-b border-accent-dim/40 px-4 py-2.5 sm:px-5">
      <TriangleAlert class="size-4 shrink-0 text-accent" aria-hidden="true" />
      <h2 id="discord-alert-title" class="eyebrow text-accent">
        {{ missing.length === 1 ? 'Roster warning' : `Roster warning · ${missing.length} players` }}
      </h2>
    </div>

    <div class="px-4 py-4 sm:px-5">
      <ul class="flex flex-col gap-2">
        <li v-for="p in missing" :key="p.userId" class="flex items-center gap-3">
          <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
          <p class="min-w-0 text-sm sm:text-base">
            <RouterLink :to="`/players/${p.userId}`" class="font-semibold text-text hover:text-accent">{{ p.name }}</RouterLink>
            <span v-if="p.userId === auth.user?.id" class="text-muted"> (you)</span>
            <span class="text-muted"> isn't in the {{ site.name }} Discord yet.</span>
          </p>
        </li>
      </ul>

      <p class="mt-4 max-w-3xl text-sm text-muted">
        Every player on a roster, starters and subs alike, must be in the league Discord to compete. Match reminders,
        check-in and team channels all run there.
        <RouterLink to="/rules#3.13" class="whitespace-nowrap text-accent hover:text-accent-strong">Rule 3.13 →</RouterLink>
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <a
          :href="site.discordInviteUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-discord px-3.5 font-heading text-sm tracking-wide text-white uppercase hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <DiscordGlyph class="size-4" />{{ meMissing ? 'Join the Discord now' : 'Join the Discord' }}<span class="sr-only"> (opens in a new tab)</span>
        </a>
        <UiButton v-if="canManage" size="sm" variant="secondary" @click="copyInvite">Copy invite link</UiButton>
      </div>
    </div>
  </section>
</template>

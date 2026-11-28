<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import DiscordGlyph from '@/components/brand/DiscordGlyph.vue'
import { useTeamDiscordPresence } from '@/composables/useDiscordPresence'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import type { RosterPlayer } from '@/lib/teams'
import { site } from '@/config/site'

/**
 * Warns a team (and admins) about rostered players who aren't in the league Discord server, where
 * reminders, check-in and the team channel live. Hidden when everyone is in, or for anyone the
 * database doesn't give the data to. Players nobody has checked yet aren't listed.
 */
const props = defineProps<{ teamId: string; roster: RosterPlayer[]; canManage?: boolean }>()

const auth = useAuthStore()
const toast = useToast()
const { status } = useTeamDiscordPresence(() => props.teamId)

const missing = computed(() => props.roster.filter((p) => status.value.get(p.userId) === false))
const meMissing = computed(() => missing.value.some((p) => p.userId === auth.user?.id))

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(site.discordInviteUrl)
    toast.success('Invite link copied. Send it to them.')
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
    class="rounded-xl border border-discord/40 bg-discord/10 p-4 sm:p-5"
  >
    <div class="flex flex-wrap items-start gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-discord text-white" aria-hidden="true">
        <DiscordGlyph class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 id="discord-alert-title" class="font-heading text-lg">
          {{ missing.length === 1 ? '1 player isn’t' : `${missing.length} players aren’t` }} in the Discord
        </h2>
        <p class="mt-1 text-sm text-muted">
          Match reminders, check-in and your team channel happen in the {{ site.name }} server. Players who aren't
          in it don't get the team role and miss those posts.
        </p>
        <ul class="mt-3 flex flex-wrap gap-2" aria-label="Players not in the Discord">
          <li v-for="p in missing" :key="p.userId" class="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm">
            <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
            <span class="max-w-40 truncate">{{ p.name }}</span>
            <span v-if="p.userId === auth.user?.id" class="text-xs text-muted">(you)</span>
          </li>
        </ul>
        <div class="mt-4 flex flex-wrap gap-2">
          <UiButton v-if="meMissing" :href="site.discordInviteUrl" size="sm">Join the Discord</UiButton>
          <UiButton v-if="canManage" size="sm" :variant="meMissing ? 'secondary' : 'primary'" @click="copyInvite">Copy invite link</UiButton>
        </div>
      </div>
    </div>
  </section>
</template>

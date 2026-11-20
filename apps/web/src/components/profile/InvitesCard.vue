<script setup lang="ts">
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { useMyInvites } from '@/composables/useInvites'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const toast = useToast()
const { invites, loading, busyId, respond } = useMyInvites()

async function answer(id: string, teamName: string, accept: boolean) {
  const result = await respond(id, accept)
  if (!result.ok) return toast.error(result.message)
  toast.success(accept ? `Welcome to ${teamName}!` : `Invite from ${teamName} declined.`)
}

const expires = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <UiCard v-if="!loading && invites.length > 0" eyebrow="Recruiting" title="Team invites">
    <p v-if="!auth.isOnboarded" class="mb-4 text-sm text-gold">Finish your profile below before accepting an invite.</p>
    <ul class="flex flex-col gap-3">
      <li v-for="i in invites" :key="i.id" class="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2/50 p-3">
        <TeamLogo :tag="i.team.tag" :name="i.team.name" :logo-url="i.team.logoUrl" size="md" decorative />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            <RouterLink :to="`/teams/${i.team.id}`" class="hover:text-gold">{{ i.team.name }}</RouterLink>
          </p>
          <p class="text-xs text-muted">
            From {{ i.captainName ?? 'the captain' }} · expires {{ expires(i.expiresAt) }}
          </p>
        </div>
        <UiBadge v-if="i.role" variant="outline">As {{ i.role }}</UiBadge>
        <div class="flex gap-2">
          <UiButton size="sm" variant="ghost" :disabled="busyId !== null" @click="answer(i.id, i.team.name, false)">
            Decline<span class="sr-only"> invite from {{ i.team.name }}</span>
          </UiButton>
          <UiButton size="sm" :loading="busyId === i.id" :disabled="busyId !== null || auth.isBanned" @click="answer(i.id, i.team.name, true)">
            Accept<span class="sr-only"> invite from {{ i.team.name }}</span>
          </UiButton>
        </div>
      </li>
    </ul>
    <p class="mt-4 text-xs text-muted">Accepting one invite cancels the others. You can only be on one team per season.</p>
  </UiCard>
</template>

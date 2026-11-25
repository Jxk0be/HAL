<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useMyEmergencySubRequests } from '@/composables/useEmergencySubs'
import { useToast } from '@/composables/useToast'

/** A free agent's open emergency sub requests (they can also answer from the Discord DM). */
const toast = useToast()
const { requests, busyId, respond } = useMyEmergencySubRequests()

async function answer(id: string, tag: string, accept: boolean) {
  const r = await respond(id, accept)
  if (!r.ok) return toast.error(r.message)
  toast.success(accept ? `Accepted. An admin still has to approve you for ${tag}.` : `Declined. ${tag}'s captain has been told.`)
}
</script>

<template>
  <UiCard v-if="requests.length" eyebrow="One match only" title="Emergency sub requests">
    <ul class="flex flex-col gap-3">
      <li v-for="r in requests" :key="r.id" class="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2/50 p-3">
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            <RouterLink :to="`/teams/${r.team.id}`" class="hover:text-accent">{{ r.team.name }} [{{ r.team.tag }}]</RouterLink>
          </p>
          <p class="text-xs text-muted">
            <RouterLink :to="`/matches/${r.match.id}`" class="hover:text-accent">{{ r.match.home }} vs {{ r.match.away }}</RouterLink>,
            {{ weekLabel(r.match.week).toLowerCase() }}, <LeagueTime :iso="r.match.scheduledAt" />
          </p>
          <p v-if="r.note" class="mt-1 text-sm">"{{ r.note }}"</p>
        </div>
        <UiBadge v-if="r.accepted" variant="accent">Accepted, waiting for an admin</UiBadge>
        <div class="flex gap-2">
          <UiButton size="sm" variant="ghost" :disabled="busyId !== null" @click="answer(r.id, r.team.tag, false)">
            Decline<span class="sr-only"> request from {{ r.team.name }}</span>
          </UiButton>
          <UiButton v-if="!r.accepted" size="sm" :loading="busyId === r.id" :disabled="busyId !== null" @click="answer(r.id, r.team.tag, true)">
            Accept<span class="sr-only"> request from {{ r.team.name }}</span>
          </UiButton>
        </div>
      </li>
    </ul>
    <p class="mt-4 text-xs text-muted">You'd play that one match only and stay a free agent. Nothing happens unless you accept.</p>
  </UiCard>
</template>

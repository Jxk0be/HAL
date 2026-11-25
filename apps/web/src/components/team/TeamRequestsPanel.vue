<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { rescheduleActions, useTeamRequests, type TeamRequest } from '@/composables/useMatchActions'
import { useToast } from '@/composables/useToast'

/** Pending reschedule requests on this team's matches: answer the ones sent to you, cancel your own. */
const props = defineProps<{ teamId: string }>()
const toast = useToast()
const { requests, loading, reload } = useTeamRequests(() => props.teamId)
const busy = ref<string | null>(null)

const opponent = (r: TeamRequest) => (r.match.home.id === props.teamId ? r.match.away : r.match.home)

async function run(r: TeamRequest, p: Promise<{ ok: boolean; message?: string }>, success: string) {
  busy.value = r.id
  const res = await p
  busy.value = null
  if (res.ok) {
    toast.success(success)
    await reload()
  } else toast.error(res.message ?? 'Something went wrong.')
}
</script>

<template>
  <div class="text-sm">
    <p v-if="loading" class="text-muted">Loading…</p>
    <p v-else-if="!requests.length" class="text-muted">No pending reschedule requests. Request one from a match page.</p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="r in requests" :key="r.id" class="rounded-md border border-line bg-surface-2 p-3">
        <p>
          <RouterLink :to="`/matches/${r.match.id}`" class="font-medium hover:text-accent">{{ weekLabel(r.match.week) }} vs {{ opponent(r).tag }}</RouterLink>
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ r.teamId === teamId ? 'You asked' : `${opponent(r).tag} asked` }} to move it from
          <LeagueTime :iso="r.match.scheduledAt" /> to <strong class="text-text"><LeagueTime :iso="r.proposedAt" /></strong>.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <template v-if="r.teamId !== teamId">
            <UiButton size="sm" :loading="busy === r.id" @click="run(r, rescheduleActions.respond(r.id, true), 'Accepted. The match time is updated.')">Accept</UiButton>
            <UiButton size="sm" variant="secondary" :disabled="busy === r.id" @click="run(r, rescheduleActions.respond(r.id, false), 'Declined.')">Decline</UiButton>
          </template>
          <UiButton v-else size="sm" variant="ghost" :disabled="busy === r.id" @click="run(r, rescheduleActions.cancel(r.id), 'Request cancelled.')">Cancel request</UiButton>
        </div>
      </li>
    </ul>
  </div>
</template>

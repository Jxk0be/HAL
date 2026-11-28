<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import TeamCard from '@/components/team/TeamCard.vue'
import { useTeamHub } from '@/composables/useTeamHub'
import type { TeamSummary } from '@/composables/useTeams'
import { site } from '@/config/site'

const props = defineProps<{ teams: TeamSummary[]; loading: boolean; error?: string | null; seasonId?: string | null }>()
const hub = useTeamHub(() => props.seasonId)
// Cards need their records and recruiting posts too, so wait for all of it.
const ready = useReady(() => props.loading || hub.loading.value)
</script>

<template>
  <div v-if="!ready" role="status" aria-busy="true">
    <span class="sr-only">Loading teams…</span>
    <UiPageSkeleton variant="cards" />
  </div>
  <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
  <UiEmptyState v-else-if="teams.length === 0" title="No teams yet" description="Teams appear here as captains register them during signups.">
    <UiButton to="/my-team">Create a team</UiButton>
    <UiButton :href="site.discordInviteUrl" variant="secondary">Join the Discord</UiButton>
  </UiEmptyState>
  <ul v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <li v-for="t in teams" :key="t.id">
      <TeamCard
        :team="t"
        :record="hub.records.value.get(t.id) ?? null"
        :recruit-post-id="hub.postByTeam.value.get(t.id) ?? null"
        :can-interest="hub.canInterest.value"
        :interested="hub.interestedIds.value.has(hub.postByTeam.value.get(t.id) ?? '')"
        :busy="hub.busyPost.value === hub.postByTeam.value.get(t.id)"
        @interest="hub.interest"
      />
    </li>
  </ul>
</template>

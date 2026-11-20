<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import RosterList from '@/components/team/RosterList.vue'
import { useTeam } from '@/composables/useTeams'
import { useAuthStore } from '@/stores/auth'
import { site } from '@/config/site'

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { team, loading } = useTeam(id)
const isMine = computed(() => team.value && auth.team?.id === team.value.id)

watch(team, (t) => {
  if (t) document.title = `${t.name} · ${site.shortName}`
})
</script>

<template>
  <div>
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-14 sm:px-6"><UiSkeleton :lines="6" /></div>

    <div v-else-if="!team" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Team not found" description="This team doesn't exist or was removed.">
        <UiButton to="/teams" variant="secondary">All teams</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <section class="border-b border-line" aria-labelledby="team-name">
        <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14">
          <TeamLogo :tag="team.tag" :name="team.name" :logo-url="team.logoUrl" size="xl" decorative />
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-gold">{{ team.seasonName }}<template v-if="team.division"> · {{ team.division }}</template></p>
            <h1 id="team-name" class="mt-1 font-heading text-4xl sm:text-5xl">{{ team.name }}</h1>
            <p class="mt-3 flex flex-wrap gap-2">
              <UiBadge variant="outline">{{ team.tag }}</UiBadge>
              <UiBadge v-if="team.status === 'pending'" variant="gold">Awaiting approval</UiBadge>
              <UiBadge v-if="team.status === 'removed'" variant="loss">Removed</UiBadge>
              <UiBadge><span class="tnum">0–0</span>&nbsp;record</UiBadge>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UiButton v-if="isMine" to="/my-team" variant="secondary">Manage team</UiButton>
            <UiButton :href="site.discordInviteUrl">Join HAL Discord</UiButton>
          </div>
        </div>
      </section>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="roster-title">
          <h2 id="roster-title" class="eyebrow mb-3 text-gold">Roster · {{ team.roster.length }} of {{ team.rules.max_roster }}</h2>
          <RosterList :players="team.roster" :caption="`${team.name} roster`" link-players />
        </section>
        <div class="flex flex-col gap-6">
          <UiCard eyebrow="Schedule" title="Upcoming matches">
            <p class="text-sm text-muted">The schedule is published once the season starts.</p>
          </UiCard>
          <UiCard eyebrow="Results" title="Past matches">
            <p class="text-sm text-muted">No matches played yet.</p>
          </UiCard>
        </div>
      </div>
    </template>
  </div>
</template>

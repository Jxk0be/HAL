<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { useTeamList } from '@/composables/useTeams'
import { site } from '@/config/site'

const { teams, loading, error } = useTeamList()
</script>

<template>
  <div>
    <PageHeader eyebrow="League" title="Teams" description="Every team registered this season." />
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="rounded-lg border border-line bg-surface p-5"><UiSkeleton :lines="3" /></div>
      </div>
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <UiEmptyState
        v-else-if="teams.length === 0"
        title="No teams yet"
        description="Teams appear here as captains register them during signups."
      >
        <UiButton to="/my-team">Create a team</UiButton>
        <UiButton :href="site.discordInviteUrl" variant="secondary">Join the Discord</UiButton>
      </UiEmptyState>
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="t in teams" :key="t.id">
          <RouterLink
            :to="`/teams/${t.id}`"
            class="group flex h-full items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent-dim"
          >
            <TeamLogo :tag="t.tag" :name="t.name" :logo-url="t.logoUrl" size="lg" decorative />
            <div class="min-w-0 flex-1">
              <p class="truncate font-heading text-xl group-hover:text-accent">{{ t.name }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <UiBadge variant="outline">{{ t.tag }}</UiBadge>
                <UiBadge v-if="t.division">{{ t.division }}</UiBadge>
                <UiBadge v-if="t.status === 'pending'" variant="accent">Pending</UiBadge>
              </p>
              <p class="mt-2 text-xs text-muted">
                <span class="tnum">{{ t.rosterSize }}</span> players · Record <span class="tnum">0–0</span>
              </p>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import TeamGrid from '@/components/season/TeamGrid.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import { useTeamList } from '@/composables/useTeams'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useRecruitBoard } from '@/composables/useRecruiting'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { season, loading: seasonLoading } = useActiveSeason()
const { teams, loading, error } = useTeamList()
const { posts, loading: postsLoading } = useRecruitBoard()
// Filter counts and the description need the season, teams and posts.
const ready = useReady(() => seasonLoading.value || loading.value || postsLoading.value)

const search = ref('')
const filter = ref<string>('all')
const recruiting = computed(() => new Set(posts.value.map((p) => p.teamId)))

const divisions = computed(() => {
  const seen = new Map<string, string>()
  for (const t of teams.value) if (t.divisionId && t.division) seen.set(t.divisionId, t.division)
  return [...seen].map(([value, label]) => ({ value, label }))
})
const tabs = computed(() => [
  { value: 'all', label: 'All', count: teams.value.length },
  { value: 'recruiting', label: 'Recruiting', count: recruiting.value.size },
  ...divisions.value,
])

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return teams.value.filter(
    (t) =>
      (filter.value === 'all' ||
        (filter.value === 'recruiting' ? recruiting.value.has(t.id) : t.divisionId === filter.value)) &&
      (!q || t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)),
  )
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Teams" title="Find your squad" :description="`Every team registered for ${season?.name ?? 'this season'}.`" :pending="!ready">
      <template #actions>
        <div class="w-full sm:w-72">
          <UiInput v-model="search" label="Search teams" type="search" placeholder="Name or tag" autocomplete="off" />
        </div>
      </template>
    </PageHeader>
    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div
        v-if="auth.team"
        class="card-accent texture-stripes flex items-center gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5"
      >
        <TeamLogo :tag="auth.team.tag" :logo-url="auth.team.logo_url" size="lg" decorative />
        <div class="min-w-0 flex-1">
          <p class="eyebrow text-faint">My team</p>
          <RouterLink :to="`/teams/${auth.team.id}`" class="block truncate font-heading text-2xl hover:text-accent">{{ auth.team.name }}</RouterLink>
        </div>
        <UiButton to="/my-team" variant="secondary" size="sm">Manage</UiButton>
      </div>

      <UiLoadGate :ready="ready" variant="cards" label="Loading teams…">
        <template #skeleton>
          <div class="mb-6 flex gap-2"><div v-for="n in 3" :key="n" class="skeleton h-9 w-24 rounded-full" /></div>
          <UiPageSkeleton variant="cards" />
        </template>
        <UiTabs v-model="filter" :tabs="tabs" label="Filter teams" variant="pill">
          <TeamGrid :teams="shown" :loading="loading" :error="error" :season-id="season?.id" />
        </UiTabs>
      </UiLoadGate>
    </div>
  </div>
</template>

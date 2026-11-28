<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import ContentMatches from '@/components/admin/content/ContentMatches.vue'
import ContentPlayers from '@/components/admin/content/ContentPlayers.vue'
import ContentPosts from '@/components/admin/content/ContentPosts.vue'
import ContentTeams from '@/components/admin/content/ContentTeams.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useSeasonTeamNames } from '@/composables/useAdmin'

type Tab = 'matches' | 'teams' | 'posts' | 'players'
const route = useRoute()
const router = useRouter()
const tab = ref<Tab>((['matches', 'teams', 'posts', 'players'] as const).find((t) => t === route.query.tab) ?? 'matches')
watch(tab, (t) => void router.replace({ query: { ...route.query, tab: t } }))
const tabs = [
  { value: 'matches' as const, label: 'Matches & results' },
  { value: 'teams' as const, label: 'Teams' },
  { value: 'posts' as const, label: 'Free agent posts' },
  { value: 'players' as const, label: 'Players & bans' },
]

const { season, loading } = useActiveSeason()
const seasonId = computed(() => season.value?.id ?? null)
const { teams } = useSeasonTeamNames(seasonId)
</script>

<template>
  <div>
    <PageHeader compact eyebrow="Admin" title="Content" description="Edit any match, result, team, free agent post or player. Every change is publicly logged." />
    <div class="px-4 py-8 sm:px-6">
      <UiTabs v-model="tab" label="Content sections" :tabs="tabs">
        <template v-if="tab === 'matches' || tab === 'teams'">
          <UiSkeleton v-if="loading" :lines="6" />
          <UiEmptyState v-else-if="!seasonId" title="No active season" />
          <ContentMatches v-else-if="tab === 'matches'" :season-id="seasonId" :timezone="season?.timezone ?? 'America/New_York'" :teams="teams" />
          <ContentTeams v-else :season-id="seasonId" />
        </template>
        <ContentPosts v-else-if="tab === 'posts'" />
        <ContentPlayers v-else />
      </UiTabs>
    </div>
  </div>
</template>

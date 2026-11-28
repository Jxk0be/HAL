<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import MatchesPanel from '@/components/season/MatchesPanel.vue'
import { useSeasonSchedule } from '@/composables/useMatches'

const { season, matches, loading } = useSeasonSchedule()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Schedule"
      title="Every match, every week"
      :description="`${season?.name ?? 'This season'}. Times are shown in your time zone; hover a time for Eastern.`"
    />
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <MatchesPanel :matches="matches" :loading="loading" sync-query />
    </div>
  </div>
</template>

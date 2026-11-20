<script setup lang="ts">
import { useRoute } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'

const route = useRoute()
</script>

<template>
  <div>
    <PageHeader
      :title="route.meta.title ?? 'Coming soon'"
      :eyebrow="route.meta.eyebrow"
      :description="route.meta.description"
    />
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <UiEmptyState
        title="Coming soon"
        :description="
          route.meta.buildStep
            ? `This page is part of build step ${route.meta.buildStep}. Season 1 starts in early January.`
            : 'This page is on the way.'
        "
      >
        <UiButton to="/" variant="secondary">Back to home</UiButton>
      </UiEmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import GameDataPanel from '@/components/admin/GameDataPanel.vue'
</script>

<template>
  <div>
    <PageHeader
      compact
      eyebrow="Admin"
      title="Modes & maps"
      description="The map pool for league matches and 8s. Each mode has its own maps. Changes show on the public Maps page straight away."
    >
      <template #actions>
        <RouterLink to="/maps" class="text-sm text-accent hover:text-accent-strong">View the public page</RouterLink>
      </template>
    </PageHeader>
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <GameDataPanel />
    </div>
  </div>
</template>

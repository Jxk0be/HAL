<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useGameData } from '@/composables/useGameData'

/** The public map pool: every active mode with the maps played in it (Admin → Modes & maps). */
const g = useGameData()
void g.load()

const pool = computed(() =>
  g.modes.value
    .filter((m) => m.active)
    .map((m) => ({ ...m, maps: g.mapsInMode(m.id).filter((map) => map.active) }))
    .filter((m) => m.maps.length > 0),
)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="League"
      title="Map pool"
      description="The modes we play and the maps in each one. League matches use this pool, and so do 8s: the lobby votes on the mode, then the bot picks a random map from it."
    />
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <UiSkeleton v-if="g.loading.value" :lines="6" />
      <UiEmptyState v-else-if="pool.length === 0" title="No maps yet" description="The map pool hasn't been set up yet. Check back soon." />
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
        <li v-for="m in pool" :key="m.id" class="rounded-lg border border-line bg-surface p-5">
          <h2 class="flex items-baseline justify-between gap-3 font-heading text-2xl">
            {{ m.name }}
            <span class="tnum text-sm text-muted">{{ m.maps.length }} {{ m.maps.length === 1 ? 'map' : 'maps' }}</span>
          </h2>
          <ul class="mt-4 flex flex-col divide-y divide-line" role="list">
            <li v-for="map in m.maps" :key="map.id" class="py-2 text-sm">{{ map.name }}</li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>

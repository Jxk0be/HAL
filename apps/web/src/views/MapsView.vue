<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import MapCallingCard from '@/components/maps/MapCallingCard.vue'
import { useReady } from '@/composables/useReady'
import { useGameData } from '@/composables/useGameData'

/**
 * The public map pool, map first: every active map as a calling card with the modes it's played
 * in, filterable by mode (Admin → Modes & maps edits the pool and the artwork).
 */
const g = useGameData()
void g.load()
const ready = useReady(() => g.loading.value)

const activeModes = computed(() => g.modes.value.filter((m) => m.active && g.mapsInMode(m.id).some((x) => x.active)))
const pool = computed(() =>
  g.maps.value
    .filter((map) => map.active)
    .map((map) => ({
      ...map,
      modes: activeModes.value.filter((m) => g.legal.value.has(`${map.id}:${m.id}`)),
    }))
    .filter((map) => map.modes.length > 0),
)

const filter = ref('all')
const tabs = computed(() => [
  { value: 'all', label: 'All maps', count: pool.value.length },
  ...activeModes.value.map((m) => ({ value: m.id, label: m.name, count: pool.value.filter((x) => x.modes.some((y) => y.id === m.id)).length })),
])
const activeMode = computed(() => activeModes.value.find((m) => m.id === filter.value) ?? null)
const shown = computed(() => (activeMode.value ? pool.value.filter((x) => x.modes.some((m) => m.id === activeMode.value!.id)) : pool.value))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="League"
      title="Map pool"
      description="The maps we play and the modes on each. League matches use this pool, and so do 8s: the lobby votes on the mode, then the bot picks a random map from it."
    />
    <UiLoadGate :ready="ready" class="mx-auto max-w-7xl px-4 py-8 sm:px-6" label="Loading the map pool…">
      <template #skeleton>
        <div class="mb-6 flex gap-2"><div v-for="n in 4" :key="n" class="skeleton h-9 w-28 rounded-full" /></div>
        <div class="grid gap-4 md:grid-cols-2">
          <div v-for="n in 6" :key="n" class="skeleton aspect-[16/7] min-h-36 rounded-xl" />
        </div>
      </template>

      <UiEmptyState v-if="pool.length === 0" title="No maps yet" description="The map pool hasn't been set up yet. Check back soon." />
      <UiTabs v-else v-model="filter" :tabs="tabs" label="Filter by mode" variant="pill">
        <Transition name="reveal" mode="out-in">
          <ul :key="filter" class="grid gap-4 pt-2 md:grid-cols-2" role="list" :aria-label="activeMode ? `${activeMode.name} maps` : 'All maps'">
            <li v-for="(map, i) in shown" :key="map.id">
              <MapCallingCard
                :name="map.name"
                :image-url="map.imageUrl"
                :modes="map.modes.map((m) => m.name)"
                :active-mode="activeMode?.name"
                :index="i"
              />
            </li>
          </ul>
        </Transition>
      </UiTabs>
    </UiLoadGate>
  </div>
</template>

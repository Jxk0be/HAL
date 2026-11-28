<script setup lang="ts">
import { computed, ref } from 'vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import PlayoffBracket from '@/components/stats/PlayoffBracket.vue'
import UiLoadGate from '@/components/ui/UiLoadGate.vue'
import { useReady } from '@/composables/useReady'
import { usePlayoffMatches } from '@/composables/usePlayoffs'
import { useDivisions } from '@/composables/useStats'

const props = defineProps<{ seasonId: string; seasonName: string; size: number }>()

const seasonId = computed(() => props.seasonId)
const { divisions, loading: divisionsLoading } = useDivisions(seasonId)
const picked = ref<string | null>(null)
const divisionId = computed(() => picked.value ?? divisions.value[0]?.id ?? null)
const tabs = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })))
const tabModel = computed({ get: () => divisionId.value ?? '', set: (v: string) => (picked.value = v) })

const { matches, seeds, loading } = usePlayoffMatches(seasonId, divisionId)
// Wait for the divisions too, so the division tabs and the right bracket appear together.
const ready = useReady(() => divisionsLoading.value || loading.value)
</script>

<template>
  <UiLoadGate :ready="ready" variant="cards" :count="4" label="Loading the bracket…">
  <UiTabs v-if="tabs.length > 1" v-model="tabModel" :tabs="tabs" label="Division" variant="pill">
    <PlayoffBracket :matches="matches" :seeds="seeds" :size="size" :season-name="seasonName" :loading="loading" />
  </UiTabs>
  <PlayoffBracket v-else :matches="matches" :seeds="seeds" :size="size" :season-name="seasonName" :loading="loading" />
  </UiLoadGate>
</template>

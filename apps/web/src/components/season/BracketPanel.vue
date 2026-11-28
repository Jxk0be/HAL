<script setup lang="ts">
import { computed, ref } from 'vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import PlayoffBracket from '@/components/stats/PlayoffBracket.vue'
import { usePlayoffMatches } from '@/composables/usePlayoffs'
import { useDivisions } from '@/composables/useStats'

const props = defineProps<{ seasonId: string; seasonName: string; size: number }>()

const seasonId = computed(() => props.seasonId)
const { divisions } = useDivisions(seasonId)
const picked = ref<string | null>(null)
const divisionId = computed(() => picked.value ?? divisions.value[0]?.id ?? null)
const tabs = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })))
const tabModel = computed({ get: () => divisionId.value ?? '', set: (v: string) => (picked.value = v) })

const { matches, seeds, loading } = usePlayoffMatches(seasonId, divisionId)
</script>

<template>
  <UiTabs v-if="tabs.length > 1" v-model="tabModel" :tabs="tabs" label="Division" variant="pill">
    <PlayoffBracket :matches="matches" :seeds="seeds" :size="size" :season-name="seasonName" :loading="loading" />
  </UiTabs>
  <PlayoffBracket v-else :matches="matches" :seeds="seeds" :size="size" :season-name="seasonName" :loading="loading" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { rankLabel, type CodRank } from '@/lib/validation/profile'

/** A player's ranked-play rank (rules 2.8–2.9). Iridescent shows whether its exception is approved. */
const props = defineProps<{ rank: CodRank | null | undefined; exceptionAt?: string | null }>()
const label = computed(() => {
  if (!props.rank) return null
  if (props.rank === 'iridescent') return props.exceptionAt ? 'Iridescent · exception' : 'Iridescent · pending'
  return rankLabel(props.rank)
})
</script>

<template>
  <UiBadge v-if="label" variant="outline"><span class="sr-only">Rank: </span>{{ label }}</UiBadge>
</template>

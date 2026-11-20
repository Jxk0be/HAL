<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Our score / their score, from the point of view of the team being shown. */
  score: number
  opponent: number
  /** Override the result (e.g. forfeits). Defaults to comparing the scores. */
  result?: 'W' | 'L' | 'FF'
}>()

const outcome = computed(() => props.result ?? (props.score > props.opponent ? 'W' : 'L'))
const isWin = computed(() => outcome.value === 'W')
const label = computed(() =>
  outcome.value === 'FF'
    ? `Forfeit, ${props.score} to ${props.opponent}`
    : `${isWin.value ? 'Win' : 'Loss'}, ${props.score} to ${props.opponent}`,
)
</script>

<template>
  <span
    class="tnum inline-flex items-center overflow-hidden rounded-sm border font-heading text-sm"
    :class="isWin ? 'border-win/40' : 'border-loss/40'"
    :aria-label="label"
    role="img"
  >
    <span
      class="px-1.5 py-0.5 text-xs tracking-wider"
      :class="isWin ? 'bg-win-soft text-win' : 'bg-loss-soft text-loss'"
      aria-hidden="true"
      >{{ outcome }}</span
    >
    <span class="px-2 py-0.5 text-text" aria-hidden="true">{{ score }}–{{ opponent }}</span>
  </span>
</template>

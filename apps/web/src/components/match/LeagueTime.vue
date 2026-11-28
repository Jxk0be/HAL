<script setup lang="ts">
import { computed } from 'vue'
import { formatLeagueTime, formatLocalClock, formatLocalTime } from '@/lib/time'

/** A match time in the viewer's own time zone, with the Eastern (league) time on hover. */
const props = defineProps<{ iso: string; timezone?: string; /** Clock time only. */ short?: boolean }>()
const local = computed(() => (props.short ? formatLocalClock(props.iso) : formatLocalTime(props.iso)))
const league = computed(() => formatLeagueTime(props.iso, props.timezone))
</script>

<template>
  <time :datetime="iso" :title="league" class="cursor-help decoration-dotted underline-offset-4 hover:underline">
    {{ local }}<span class="sr-only"> (league time {{ league }})</span>
  </time>
</template>

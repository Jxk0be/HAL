<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** ISO timestamp to count down to. */
    to: string
    /** Shown once the time has passed. */
    endedLabel?: string
  }>(),
  { endedLabel: 'Starting now' },
)

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)))
onBeforeUnmount(() => clearInterval(timer))

const remaining = computed(() => Math.max(0, new Date(props.to).getTime() - now.value))
const parts = computed(() => {
  const s = Math.floor(remaining.value / 1000)
  return [
    { label: 'd', long: 'days', value: Math.floor(s / 86400) },
    { label: 'h', long: 'hours', value: Math.floor((s % 86400) / 3600) },
    { label: 'm', long: 'minutes', value: Math.floor((s % 3600) / 60) },
    { label: 's', long: 'seconds', value: s % 60 },
  ]
})
/** Coarse text for screen readers (not re-announced every second). */
const spoken = computed(() => {
  const [d, h, m] = parts.value
  return `${d?.value} days, ${h?.value} hours, ${m?.value} minutes`
})
</script>

<template>
  <time :datetime="to" class="tnum inline-flex items-baseline gap-2 font-heading">
    <template v-if="remaining > 0">
      <span class="sr-only">Starts in {{ spoken }}</span>
      <span v-for="p in parts" :key="p.label" class="inline-flex items-baseline" aria-hidden="true">
        <span class="text-2xl text-text">{{ String(p.value).padStart(2, '0') }}</span>
        <span class="ml-0.5 text-xs text-muted">{{ p.label }}</span>
      </span>
    </template>
    <span v-else class="text-accent">{{ endedLabel }}</span>
  </time>
</template>

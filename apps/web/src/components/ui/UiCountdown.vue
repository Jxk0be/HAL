<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** ISO timestamp to count down to. */
    to: string
    /** Shown once the time has passed. */
    endedLabel?: string
    /** Inline size (body text) instead of the large display digits. */
    compact?: boolean
    /** Display digit size when not compact: lg (default) or md for narrow cards. */
    size?: 'lg' | 'md'
    /** Smallest unit shown. 'minutes' drops the ticking seconds (good for countdowns weeks out). */
    precision?: 'seconds' | 'minutes'
  }>(),
  { endedLabel: 'Starting now', size: 'lg', precision: 'seconds' },
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
  ].filter((p) => props.precision === 'seconds' || p.label !== 's')
})
/** Coarse text for screen readers (not re-announced every second). */
const spoken = computed(() => {
  const [d, h, m] = parts.value
  return `${d?.value} days, ${h?.value} hours, ${m?.value} minutes`
})
</script>

<template>
  <!-- flex-wrap: in a narrow card the units wrap onto a second line instead of overflowing. -->
  <time :datetime="to" class="tnum inline-flex max-w-full flex-wrap items-baseline font-heading" :class="compact ? 'gap-x-1' : 'gap-x-2 gap-y-0.5'">
    <template v-if="remaining > 0">
      <span class="sr-only">Starts in {{ spoken }}</span>
      <span v-for="p in parts" :key="p.label" class="inline-flex items-baseline" aria-hidden="true">
        <span class="text-text" :class="compact ? '' : size === 'md' ? 'text-xl' : 'text-2xl'">{{ String(p.value).padStart(2, '0') }}</span>
        <span class="ml-0.5 text-xs text-muted">{{ p.label }}</span>
      </span>
    </template>
    <span v-else class="text-accent">{{ endedLabel }}</span>
  </time>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useLiveBroadcasts } from '@/composables/useBroadcasts'

/**
 * Slim live banner at the very top of the shell. Shows every match being streamed; with several,
 * rotates every 6 seconds (paused while hovered or focused, or with the pause button).
 */
const { live } = useLiveBroadcasts()
const index = ref(0)
const paused = ref(false)
const hovering = ref(false)
const current = computed(() => live.value[index.value % Math.max(1, live.value.length)] ?? null)

watch(() => live.value.length, (n) => {
  if (index.value >= n) index.value = 0
})

const timer = setInterval(() => {
  if (live.value.length > 1 && !paused.value && !hovering.value) index.value = (index.value + 1) % live.value.length
}, 6000)
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div
    v-if="current"
    class="border-y border-gold-dim bg-surface print:hidden"
    role="region"
    aria-label="Live broadcasts"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @focusin="hovering = true"
    @focusout="hovering = false"
  >
    <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 text-sm sm:px-6">
      <span class="flex shrink-0 items-center gap-1.5 font-heading text-xs tracking-[0.18em] text-loss">
        <span class="size-2 animate-pulse rounded-full bg-live motion-reduce:animate-none" aria-hidden="true" />
        LIVE
      </span>
      <p class="min-w-0 flex-1 truncate">
        <RouterLink :to="`/matches/${current.matchId}`" class="font-heading tracking-wide hover:text-gold">
          {{ current.homeTag }} <span class="text-faint">vs</span> {{ current.awayTag }}
        </RouterLink>
        <span class="hidden text-muted sm:inline"> · cast by {{ current.caster }}</span>
      </p>
      <span v-if="live.length > 1" class="tnum shrink-0 text-xs text-muted">{{ (index % live.length) + 1 }}/{{ live.length }}</span>
      <button
        v-if="live.length > 1"
        type="button"
        class="shrink-0 rounded-sm px-1.5 text-xs text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-gold"
        :aria-label="paused ? 'Resume rotating live matches' : 'Pause rotating live matches'"
        @click="paused = !paused"
      >
        <span aria-hidden="true">{{ paused ? '▶' : '❚❚' }}</span>
      </button>
      <a
        :href="current.url"
        target="_blank"
        rel="noopener noreferrer"
        class="shrink-0 rounded-sm bg-gold px-2.5 py-0.5 font-heading text-xs tracking-wider text-on-gold hover:bg-gold-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        Watch<span class="sr-only"> {{ current.homeName }} vs {{ current.awayName }} (opens in a new tab)</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRecentResults } from '@/composables/useRecentResults'
import { weekLabel } from '@/lib/preseason'
import type { MatchCardData } from '@/composables/useMatches'

const { results } = useRecentResults()

/** About 4 seconds per item, so the speed stays the same however many results there are. */
const duration = computed(() => `${Math.max(results.value.length, 4) * 4}s`)

function label(m: MatchCardData): string {
  if (m.stage === 'playoff') return 'PO'
  return weekLabel(m.week, true).replace('Wk ', 'W')
}
function homeWon(m: MatchCardData) {
  return m.winnerTeamId === m.home.id
}
function awayWon(m: MatchCardData) {
  return m.winnerTeamId === m.away.id
}
function srText(m: MatchCardData) {
  return `${weekLabel(m.week)}: ${m.home.name} ${m.homeSeries ?? 0}, ${m.away.name} ${m.awaySeries ?? 0}`
}
</script>

<template>
  <div
    v-if="results.length"
    class="ticker-mask group relative flex h-full min-w-0 flex-1 items-center overflow-hidden"
    role="region"
    aria-label="Recent results"
  >
    <div class="ticker-track flex w-max items-center" :style="{ '--ticker-duration': duration }">
      <ul v-for="copy in 2" :key="copy" class="flex shrink-0 items-center" :aria-hidden="copy === 2 ? 'true' : undefined">
        <li v-for="m in results" :key="m.id">
          <RouterLink
            :to="`/matches/${m.id}`"
            class="tnum flex items-center gap-2 rounded-md px-3 py-1.5 font-heading text-sm tracking-wide whitespace-nowrap text-faint hover:bg-surface-2 hover:text-text"
            :tabindex="copy === 2 ? -1 : undefined"
          >
            <span class="contents" aria-hidden="true">
            <span class="text-xs">{{ label(m) }}</span>
            <span :class="homeWon(m) ? 'text-text' : 'text-muted'">{{ m.home.tag }}</span>
            <span>
              <span :class="homeWon(m) ? 'text-accent' : ''">{{ m.homeSeries ?? 0 }}</span>–<span
                :class="awayWon(m) ? 'text-accent' : ''"
                >{{ m.awaySeries ?? 0 }}</span
              >
            </span>
            <span :class="awayWon(m) ? 'text-text' : 'text-muted'">{{ m.away.tag }}</span>
            </span>
            <span class="sr-only">{{ srText(m) }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
  <div v-else class="flex-1" />
</template>

<style scoped>
.ticker-track {
  animation: ticker var(--ticker-duration) linear infinite;
}
.group:hover .ticker-track,
.group:focus-within .ticker-track {
  animation-play-state: paused;
}
.ticker-mask {
  mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
}
@keyframes ticker {
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track {
    animation: none;
  }
  .ticker-mask {
    overflow-x: auto;
  }
}
</style>

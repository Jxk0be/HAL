<script setup lang="ts">
import { computed } from 'vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from './LeagueTime.vue'
import MatchStatus from './MatchStatus.vue'
import type { MatchCardData } from '@/composables/useMatches'

const props = defineProps<{ match: MatchCardData; compact?: boolean }>()

const final = computed(() => props.match.status === 'confirmed' || props.match.status === 'forfeit')
const score = (side: 'home' | 'away') => {
  const m = props.match
  if (m.status === 'forfeit') return m.forfeitTeamId === m[side].id ? 0 : 3
  return side === 'home' ? m.homeSeries : m.awaySeries
}
const won = (side: 'home' | 'away') => final.value && props.match.winnerTeamId === props.match[side].id
const label = computed(() => {
  const m = props.match
  const s = final.value ? `, final ${score('home')} to ${score('away')}` : ''
  return `${m.home.name} versus ${m.away.name}${s}`
})
</script>

<template>
  <article class="relative flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-gold-dim" :aria-label="label">
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span>
        <template v-if="match.stage === 'playoff'">Playoffs · </template>
        Week {{ match.week }} · <LeagueTime :iso="match.scheduledAt" />
      </span>
      <MatchStatus :match="match" />
    </div>

    <div class="flex flex-col gap-2">
      <div v-for="side in ['home', 'away'] as const" :key="side" class="flex items-center gap-3">
        <TeamLogo :tag="match[side].tag" :name="match[side].name" :logo-url="match[side].logoUrl" size="sm" decorative />
        <span class="min-w-0 flex-1 truncate" :class="final && !won(side) ? 'text-muted' : 'font-medium'">{{ match[side].name }}</span>
        <span
          v-if="final"
          class="tnum w-6 text-right font-heading text-xl"
          :class="won(side) ? 'text-gold' : 'text-muted'"
          aria-hidden="true"
        >{{ score(side) }}</span>
      </div>
    </div>

    <div v-if="!compact || match.broadcastLive" class="flex items-center justify-between gap-2">
      <RouterLink :to="`/matches/${match.id}`" class="text-sm text-gold after:absolute after:inset-0 hover:text-gold-strong">
        {{ final ? 'Match details' : 'Preview' }}<span class="sr-only">: {{ match.home.name }} vs {{ match.away.name }}</span>
      </RouterLink>
      <a
        v-if="match.broadcastLive && match.broadcastUrl"
        :href="match.broadcastUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="relative z-10 rounded-md bg-gold px-3 py-1 font-heading text-xs tracking-wider text-on-gold hover:bg-gold-strong"
      >
        Watch<span class="sr-only"> live (opens in a new tab)</span>
      </a>
    </div>
  </article>
</template>

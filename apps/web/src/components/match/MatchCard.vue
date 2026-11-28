<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { computed } from 'vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from './LeagueTime.vue'
import MatchStatus from './MatchStatus.vue'
import type { MatchCardData } from '@/composables/useMatches'

const props = withDefaults(
  defineProps<{
    match: MatchCardData
    compact?: boolean
    /** 'card' (default) or a one-line 'row', like a ticker item. */
    layout?: 'card' | 'row'
  }>(),
  { layout: 'card' },
)

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
  <!-- Row: week · home · score/time · away · status -->
  <article
    v-if="layout === 'row'"
    class="relative flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong"
    :class="match.broadcastLive ? 'texture-stripes border-accent-dim' : ''"
    :aria-label="label"
  >
    <span class="w-9 shrink-0 font-heading text-xs text-faint">{{ match.stage === 'playoff' ? 'PO' : weekLabel(match.week, true) }}</span>
    <span class="flex min-w-0 flex-1 items-center justify-end gap-2">
      <span class="truncate font-heading" :class="final && !won('home') ? 'text-muted' : ''">{{ match.home.tag }}</span>
      <TeamLogo :tag="match.home.tag" :logo-url="match.home.logoUrl" size="sm" decorative />
    </span>
    <span class="tnum w-20 shrink-0 text-center font-heading" aria-hidden="true">
      <template v-if="final">
        <span :class="won('home') ? 'text-accent' : 'text-muted'">{{ score('home') }}</span>
        <span class="text-faint">–</span>
        <span :class="won('away') ? 'text-accent' : 'text-muted'">{{ score('away') }}</span>
      </template>
      <span v-else class="text-xs text-muted"><LeagueTime :iso="match.scheduledAt" short /></span>
    </span>
    <span class="flex min-w-0 flex-1 items-center gap-2">
      <TeamLogo :tag="match.away.tag" :logo-url="match.away.logoUrl" size="sm" decorative />
      <span class="truncate font-heading" :class="final && !won('away') ? 'text-muted' : ''">{{ match.away.tag }}</span>
    </span>
    <span v-if="match.broadcastLive" class="shrink-0 rounded-full bg-brand px-2 py-0.5 font-heading text-[10px] tracking-wider text-on-brand">LIVE</span>
    <RouterLink :to="`/matches/${match.id}`" class="absolute inset-0 rounded-lg">
      <span class="sr-only">{{ label }}</span>
    </RouterLink>
  </article>

  <article
    v-else
    class="relative flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-panel transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong motion-reduce:hover:translate-y-0"
    :class="match.broadcastLive ? 'texture-stripes card-accent border-accent-dim' : 'border-line'"
    :aria-label="label"
  >
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span>
        <template v-if="match.stage === 'playoff'">Playoffs · </template>
        {{ weekLabel(match.week) }} · <LeagueTime :iso="match.scheduledAt" />
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
          :class="won(side) ? 'text-accent' : 'text-muted'"
          aria-hidden="true"
        >{{ score(side) }}</span>
      </div>
    </div>

    <div v-if="!compact || match.broadcastLive" class="flex items-center justify-between gap-2">
      <RouterLink :to="`/matches/${match.id}`" class="text-sm text-accent after:absolute after:inset-0 hover:text-accent-strong">
        {{ final ? 'Match details' : 'Preview' }}<span class="sr-only">: {{ match.home.name }} vs {{ match.away.name }}</span>
      </RouterLink>
      <RouterLink
        v-if="match.broadcastLive && match.broadcastUrl"
        :to="{ path: '/watch', query: { match: match.id } }"
        class="relative z-10 rounded-md bg-brand px-3 py-1 font-heading text-xs tracking-wider text-on-brand hover:bg-brand-strong"
      >
        <span class="text-loss" aria-hidden="true">●</span> LIVE · Watch<span class="sr-only"> {{ match.home.name }} vs {{ match.away.name }} live</span>
      </RouterLink>
      <RouterLink
        v-else-if="match.vodUrl && !compact"
        :to="{ path: `/matches/${match.id}`, hash: '#replay' }"
        class="relative z-10 text-xs text-muted hover:text-accent"
      >
        Watch replay<span class="sr-only"> of {{ match.home.name }} vs {{ match.away.name }}</span>
      </RouterLink>
      <a
        v-else-if="match.broadcastUrl && !compact"
        :href="match.broadcastUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="relative z-10 text-xs text-muted hover:text-accent"
      >
        Watch broadcast<span class="sr-only"> of {{ match.home.name }} vs {{ match.away.name }} (opens in a new tab)</span>
      </a>
    </div>
  </article>
</template>

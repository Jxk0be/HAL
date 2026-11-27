<script setup lang="ts">
import { computed } from 'vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { buildBracket, champion, type BracketMatchIn } from '@/lib/bracket'

/** One division's playoff bracket: champion banner, then the rounds side by side. */
const props = defineProps<{
  matches: BracketMatchIn[]
  seeds: Record<string, number>
  size: number
  seasonName: string
  loading: boolean
}>()

const rounds = computed(() => buildBracket(props.matches, props.size))
const winner = computed(() => champion(rounds.value))

type Side = 'home' | 'away'
const score = (m: BracketMatchIn, side: Side) => (side === 'home' ? m.homeSeries : m.awaySeries)
const won = (m: BracketMatchIn, side: Side) => m.winnerTeamId !== null && m.winnerTeamId === m[side].id
const lost = (m: BracketMatchIn, side: Side) => m.winnerTeamId !== null && m.winnerTeamId !== m[side].id
</script>

<template>
  <div class="flex flex-col gap-6">
        <div
          v-if="winner"
          class="flex items-center gap-4 rounded-lg border border-accent-dim bg-accent-soft px-5 py-4"
          role="status"
        >
          <TeamLogo :tag="winner.tag" :name="winner.name" :logo-url="winner.logoUrl" size="lg" decorative />
          <div>
            <p class="eyebrow text-accent">{{ seasonName }} champions</p>
            <RouterLink :to="`/teams/${winner.id}`" class="font-heading text-3xl hover:text-accent">{{ winner.name }}</RouterLink>
          </div>
        </div>

        <UiSkeleton v-if="loading" :lines="6" />
        <UiEmptyState
          v-else-if="!matches.length"
          title="The bracket isn't set yet"
          :description="`The top ${size} teams make it once the regular season ends. Check the standings to see who's in.`"
        >
          <UiButton to="/standings" variant="secondary">Standings</UiButton>
        </UiEmptyState>

        <!-- Bracket: rounds side by side, scrolls sideways on small screens -->
        <div v-else class="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" tabindex="0" aria-label="Playoff bracket">
          <ol class="grid min-w-max auto-cols-[16rem] grid-flow-col gap-6">
            <li v-for="r in rounds" :key="r.round" class="flex flex-col">
              <h2 class="eyebrow mb-3 text-accent">{{ r.name }}</h2>
              <ol class="flex flex-1 flex-col justify-around gap-4">
                <li v-for="(slot, i) in r.slots" :key="i">
                  <component
                    :is="slot.match ? 'RouterLink' : 'div'"
                    :to="slot.match ? `/matches/${slot.match.id}` : undefined"
                    class="block overflow-hidden rounded-lg border border-line bg-surface"
                    :class="slot.match ? 'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent' : 'border-dashed'"
                  >
                    <template v-if="slot.match">
                      <div
                        v-for="side in ['home', 'away'] as const"
                        :key="side"
                        class="flex items-center gap-2 px-3 py-2"
                        :class="[side === 'away' ? 'border-t border-line' : '', lost(slot.match, side) ? 'text-faint' : '']"
                      >
                        <span v-if="seeds[slot.match[side].id] && r.round === 1" class="tnum w-4 text-xs text-muted">{{ seeds[slot.match[side].id] }}</span>
                        <TeamLogo :tag="slot.match[side].tag" :name="slot.match[side].name" :logo-url="slot.match[side].logoUrl" size="sm" decorative />
                        <span class="min-w-0 flex-1 truncate text-sm" :class="won(slot.match, side) ? 'font-medium text-text' : ''">{{ slot.match[side].name }}</span>
                        <span class="tnum font-heading text-lg" :class="won(slot.match, side) ? 'text-accent' : 'text-muted'">{{ score(slot.match, side) ?? '' }}</span>
                      </div>
                      <p v-if="!slot.match.winnerTeamId" class="border-t border-line px-3 py-1.5 text-xs text-muted">
                        <LeagueTime :iso="slot.match.scheduledAt" />
                      </p>
                    </template>
                    <template v-else>
                      <p class="px-3 py-2 text-sm text-faint">{{ slot.homeLabel }}</p>
                      <p class="border-t border-dashed border-line px-3 py-2 text-sm text-faint">{{ slot.awayLabel }}</p>
                    </template>
                  </component>
                </li>
              </ol>
            </li>
          </ol>
        </div>
  </div>
</template>

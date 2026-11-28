<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import DiscordGlyph from '@/components/brand/DiscordGlyph.vue'
import { useEights } from '@/composables/useEights'
import { formatLocalTime } from '@/lib/time'
import { site } from '@/config/site'

const { state, loading, error } = useEights()
// Latched: later reloads (after an action, realtime) keep the content instead of re-showing the skeleton.
const ready = useReady(() => loading.value)
const queued = computed(() => Math.min(state.value?.queue_count ?? 0, 8))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="8s"
      title="Pick-up 4v4s"
      description="Casual 4v4s between league nights. Join the queue in Discord: at 8 players the bot splits two teams, the lobby votes on a mode, and you play. Anyone with a linked account and an Activision ID can play."
    >
      <template #actions>
        <a
          :href="site.discordEightsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-11 items-center gap-2 rounded-md bg-discord px-4 font-heading tracking-wide text-white uppercase hover:brightness-110"
        >
          <DiscordGlyph class="size-4" />Join in Discord<span class="sr-only"> (opens in a new tab)</span>
        </a>
      </template>
    </PageHeader>

    <div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div v-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="panel" /></div>
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <template v-else-if="state">
        <!-- Queue meter -->
        <UiCard accent="red" striped as="section" aria-labelledby="queue-title">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <h2 id="queue-title" class="eyebrow-line text-faint">Queue</h2>
            <p class="tnum font-heading text-4xl">{{ queued }}<span class="text-faint"> / 8</span></p>
          </div>
          <div class="mt-4 grid grid-cols-8 gap-1.5" role="meter" :aria-valuenow="queued" aria-valuemin="0" aria-valuemax="8" aria-label="Players in the queue">
            <span v-for="i in 8" :key="i" class="h-3 rounded-full" :class="i <= queued ? 'bg-accent' : 'bg-track'" />
          </div>
          <p v-if="state.queue.length" class="mt-4 text-sm text-muted">In the queue: <span class="text-text">{{ state.queue.join(', ') }}</span></p>
          <p class="mt-2 text-xs text-muted">Spots expire after 2 hours. This page refreshes every 15 seconds.</p>
        </UiCard>

        <!-- Live -->
        <section v-if="state.live.length" aria-labelledby="live8-title">
          <h2 id="live8-title" class="eyebrow-line mb-3 text-faint">Live now</h2>
          <ul class="grid gap-4 md:grid-cols-2">
            <li v-for="m in state.live" :key="m.id">
              <UiCard striped :accent="m.status === 'voting' ? 'red' : 'neutral'">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-heading text-xl">8s #{{ m.number }}</p>
                  <UiBadge :variant="m.status === 'voting' ? 'accent' : 'live'">{{ m.status === 'voting' ? 'Mode vote' : 'Live' }}</UiBadge>
                </div>
                <p v-if="m.status === 'voting' && m.vote_ends_at" class="mt-2 text-sm text-muted">
                  Vote closes in <UiCountdown :to="m.vote_ends_at" compact ended-label="now" />
                </p>
                <p v-else class="mt-2 text-sm text-muted">{{ m.mode }} · {{ m.map }}</p>
                <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div v-for="side in (['a', 'b'] as const)" :key="side" class="rounded-lg bg-surface-2 p-3">
                    <p class="eyebrow mb-2 text-faint">Team {{ side.toUpperCase() }}</p>
                    <ul class="flex flex-col gap-1">
                      <li v-for="p in side === 'a' ? m.team_a : m.team_b" :key="p" class="truncate">{{ p }}</li>
                    </ul>
                  </div>
                </div>
              </UiCard>
            </li>
          </ul>
        </section>

        <div class="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <!-- Recent -->
          <section aria-labelledby="recent8-title">
            <h2 id="recent8-title" class="eyebrow-line mb-3 text-faint">Recent results</h2>
            <UiEmptyState v-if="!state.recent.length" title="No 8s played yet" description="Results show up here as matches are reported." />
            <ul v-else class="flex flex-col gap-2">
              <li v-for="m in state.recent" :key="m.id" class="rounded-xl border border-line bg-surface p-4">
                <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span class="font-heading">8s #{{ m.number }} · {{ m.mode }} · {{ m.map }}</span>
                  <span v-if="m.resolved_at" class="text-xs text-muted">{{ formatLocalTime(m.resolved_at) }}</span>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <p v-for="side in (['a', 'b'] as const)" :key="side" :class="m.winner === side ? 'text-text' : 'text-muted'">
                    <span class="eyebrow mr-1" :class="m.winner === side ? 'text-accent' : 'text-faint'">{{ m.winner === side ? 'Won' : 'Lost' }}</span>
                    {{ (side === 'a' ? m.team_a : m.team_b).join(', ') }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <!-- Leaderboard -->
          <UiCard accent="neutral" as="section" aria-labelledby="lb8-title">
            <h2 id="lb8-title" class="eyebrow-line text-faint">Leaderboard</h2>
            <p v-if="!state.leaderboard.length" class="mt-3 text-sm text-muted">No wins yet.</p>
            <table v-else class="mt-3 w-full text-sm">
              <caption class="sr-only">8s leaderboard: most wins, then win percentage</caption>
              <thead>
                <tr class="border-b border-line text-left">
                  <th scope="col" class="eyebrow py-2 text-faint">#</th>
                  <th scope="col" class="eyebrow py-2 text-faint">Player</th>
                  <th scope="col" class="eyebrow py-2 text-right text-faint">W–L</th>
                  <th scope="col" class="eyebrow py-2 text-right text-faint">Win %</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in state.leaderboard" :key="l.user_id" class="border-b border-line last:border-b-0">
                  <td class="tnum py-2 font-heading" :class="i === 0 ? 'text-accent' : 'text-muted'">{{ i + 1 }}</td>
                  <td class="max-w-0 truncate py-2"><RouterLink :to="`/players/${l.user_id}`" class="hover:text-accent">{{ l.name }}</RouterLink></td>
                  <td class="tnum py-2 text-right">{{ l.wins }}–{{ l.losses }}</td>
                  <td class="tnum py-2 text-right">{{ l.win_pct }}%</td>
                </tr>
              </tbody>
            </table>
          </UiCard>
        </div>
      </template>
    </div>
  </div>
</template>

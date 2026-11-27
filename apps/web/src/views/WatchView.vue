<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import StreamPlayer from '@/components/broadcast/StreamPlayer.vue'
import { useLiveBroadcasts, useWatchSchedule } from '@/composables/useBroadcasts'
import { streamPlatform } from '@/lib/broadcast'

const route = useRoute()
const router = useRouter()
const { live, loaded } = useLiveBroadcasts()
const schedule = useWatchSchedule()

// ?match=<id> picks a stream (links from the live banner and match cards); else the first live one.
const current = computed(() => {
  const wanted = typeof route.query.match === 'string' ? route.query.match : null
  return live.value.find((b) => b.matchId === wanted) ?? live.value[0] ?? null
})
function pick(matchId: string) {
  void router.replace({ query: { match: matchId } })
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Broadcasts" title="Watch" description="League matches, live from our casters. Replays stay here after the match." />

    <div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
      <UiSkeleton v-if="!loaded" :lines="8" />

      <!-- Live -->
      <section v-else-if="current" aria-labelledby="live-title" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="flex items-center gap-2 eyebrow text-live">
              <span class="size-2 animate-pulse rounded-full bg-live" aria-hidden="true" />Live now
            </p>
            <h2 id="live-title" class="mt-1 truncate font-heading text-2xl sm:text-3xl">
              {{ current.homeName }} <span class="text-muted">vs</span> {{ current.awayName }}
            </h2>
            <p class="mt-1 text-sm text-muted">Cast by {{ current.caster }} on {{ streamPlatform(current.url) }}</p>
          </div>
          <UiButton :to="`/matches/${current.matchId}`" variant="secondary" size="sm">Match page</UiButton>
        </div>
        <StreamPlayer :key="current.matchId" :url="current.url" :title="`${current.homeTag} vs ${current.awayTag} live`" chat />

        <nav v-if="live.length > 1" aria-label="Other live matches" class="flex flex-wrap gap-2">
          <button
            v-for="b in live"
            :key="b.matchId"
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent"
            :class="b.matchId === current.matchId ? 'border-accent bg-accent-soft text-text' : 'border-line text-muted hover:text-text'"
            :aria-pressed="b.matchId === current.matchId"
            @click="pick(b.matchId)"
          >
            {{ b.homeTag }} vs {{ b.awayTag }}
          </button>
        </nav>
      </section>

      <UiEmptyState v-else title="Nobody is live right now" description="Casted matches show up here as soon as the caster goes live." />

      <!-- Coming up -->
      <section v-if="schedule.upcoming.value.length" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" class="eyebrow mb-3 text-accent">Coming up on stream</h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="m in schedule.upcoming.value" :key="m.id" class="rounded-lg border border-line bg-surface p-4">
            <RouterLink :to="`/matches/${m.id}`" class="block truncate font-heading text-lg hover:text-accent">
              {{ m.home.tag }} vs {{ m.away.tag }}
            </RouterLink>
            <p class="mt-1 text-sm text-muted"><LeagueTime :iso="m.scheduledAt" /></p>
            <p v-if="m.caster" class="mt-1 text-xs text-muted">Cast by {{ m.caster }}</p>
          </li>
        </ul>
      </section>

      <!-- Replays -->
      <section aria-labelledby="replays-title">
        <h2 id="replays-title" class="eyebrow mb-3 text-accent">Replays</h2>
        <UiSkeleton v-if="schedule.loading.value" :lines="3" />
        <p v-else-if="!schedule.replays.value.length" class="text-sm text-muted">No replays yet. Casters add them after the match.</p>
        <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="m in schedule.replays.value" :key="m.id" class="flex flex-col gap-2">
            <StreamPlayer :url="m.vodUrl!" :title="`${m.home.tag} vs ${m.away.tag} replay`" click-to-load />
            <div class="flex items-center justify-between gap-2">
              <RouterLink :to="`/matches/${m.id}`" class="truncate font-medium hover:text-accent">{{ m.home.name }} vs {{ m.away.name }}</RouterLink>
              <UiBadge v-if="m.homeSeries != null && m.awaySeries != null" variant="outline">{{ m.homeSeries }}–{{ m.awaySeries }}</UiBadge>
            </div>
            <p class="text-xs text-muted"><LeagueTime :iso="m.scheduledAt" /><template v-if="m.caster"> · {{ m.caster }}</template></p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

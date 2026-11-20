<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { usePlayer } from '@/composables/useDirectory'
import { site } from '@/config/site'

const route = useRoute()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const { player, loading } = usePlayer(id)

const roleLabel = computed(() => {
  const p = player.value
  if (!p?.team) return ''
  if (p.isCaptain) return 'Captain'
  if (p.isCoCaptain) return 'Co-captain'
  return p.teamRole === 'sub' ? 'Sub' : 'Starter'
})

watch(player, (p) => {
  if (p) document.title = `${p.name} · ${site.shortName}`
})

const statSlots = ['K/D', '+/-', 'Avg score', 'Maps played']
</script>

<template>
  <div>
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-14 sm:px-6"><UiSkeleton :lines="6" /></div>
    <div v-else-if="!player" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <UiEmptyState title="Player not found" description="This player doesn't exist or hasn't set up their profile.">
        <UiButton to="/players" variant="secondary">All players</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <section class="border-b border-line" aria-labelledby="player-name">
        <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-14">
          <UiAvatar :src="player.avatarUrl" :name="player.name" size="lg" decorative />
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-gold">Player</p>
            <h1 id="player-name" class="mt-1 truncate font-heading text-4xl sm:text-5xl">{{ player.name }}</h1>
            <p class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <PlatformBadge :platform="player.platform" />
              <span v-if="player.discordUsername">{{ player.activisionId }}</span>
              <UiBadge v-if="player.banned" variant="loss">Banned</UiBadge>
              <UiBadge v-else-if="player.isFreeAgent" variant="win">Free agent</UiBadge>
            </p>
          </div>
        </div>
      </section>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[20rem_1fr]">
        <UiCard eyebrow="This season" title="Team">
          <RouterLink v-if="player.team" :to="`/teams/${player.team.id}`" class="flex items-center gap-3 hover:text-gold">
            <TeamLogo :tag="player.team.tag" :name="player.team.name" :logo-url="player.team.logoUrl" decorative />
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ player.team.name }}</span>
              <span class="text-xs text-muted">{{ roleLabel }}</span>
            </span>
          </RouterLink>
          <p v-else class="text-sm text-muted">
            {{ player.isFreeAgent ? 'Free agent, looking for a team.' : 'Not on a team.' }}
            <RouterLink v-if="player.isFreeAgent" to="/free-agents" class="text-gold hover:text-gold-strong">See free agents</RouterLink>
          </p>
        </UiCard>

        <div class="flex flex-col gap-6">
          <section aria-labelledby="stats-title">
            <h2 id="stats-title" class="eyebrow mb-3 text-gold">Season stats</h2>
            <dl class="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4" style="gap: 1px">
              <div v-for="s in statSlots" :key="s" class="bg-surface p-4">
                <dt class="eyebrow text-muted">{{ s }}</dt>
                <dd class="tnum mt-1 font-heading text-2xl text-faint">—</dd>
              </div>
            </dl>
            <p class="mt-2 text-xs text-muted">Stats fill in once matches are confirmed.</p>
          </section>
          <UiCard eyebrow="Matches" title="Match history">
            <p class="text-sm text-muted">No matches played yet.</p>
          </UiCard>
        </div>
      </div>
    </template>
  </div>
</template>

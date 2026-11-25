<script setup lang="ts">
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import type { RosterPlayer } from '@/lib/teams'

/** Roster: a table from 640px up, stacked cards below. The `actions` slot adds a per-player control. */
defineProps<{
  players: RosterPlayer[]
  caption: string
  /** Link player names to their public profile. */
  linkPlayers?: boolean
}>()
</script>

<template>
  <div>
    <!-- Cards (mobile) -->
    <ul class="flex flex-col gap-2 sm:hidden" :aria-label="caption">
      <li
        v-for="p in players"
        :key="p.memberId"
        class="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3"
      >
        <UiAvatar :src="p.avatarUrl" :name="p.name" size="md" decorative />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 truncate font-medium">
            <RouterLink v-if="linkPlayers" :to="`/players/${p.userId}`" class="truncate hover:text-accent">{{ p.name }}</RouterLink>
            <span v-else class="truncate">{{ p.name }}</span>
          </p>
          <p class="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <PlatformBadge :platform="p.platform" />
            <span class="truncate">{{ p.activisionId ?? 'No Activision ID' }}</span>
          </p>
          <p class="mt-2 flex flex-wrap gap-1">
            <UiBadge v-if="p.isCaptain" variant="accent">Captain</UiBadge>
            <UiBadge v-else-if="p.isCoCaptain" variant="accent">Co-captain</UiBadge>
            <UiBadge :variant="p.role === 'starter' ? 'outline' : 'neutral'">{{ p.role === 'starter' ? 'Starter' : 'Sub' }}</UiBadge>
          </p>
        </div>
        <slot name="actions" :player="p" />
      </li>
    </ul>

    <!-- Table (sm and up) -->
    <div class="hidden overflow-x-auto rounded-lg border border-line bg-surface sm:block">
      <table class="w-full text-sm">
        <caption class="sr-only">{{ caption }}</caption>
        <thead>
          <tr class="border-b border-line">
            <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Player</th>
            <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Activision ID</th>
            <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Platform</th>
            <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Role</th>
            <th v-if="$slots.actions" scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in players" :key="p.memberId" class="border-b border-line last:border-b-0 hover:bg-surface-2">
            <td class="px-4 py-3">
              <span class="flex items-center gap-3">
                <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
                <RouterLink v-if="linkPlayers" :to="`/players/${p.userId}`" class="font-medium hover:text-accent">{{ p.name }}</RouterLink>
                <span v-else class="font-medium">{{ p.name }}</span>
                <UiBadge v-if="p.isCaptain" variant="accent">Captain</UiBadge>
                <UiBadge v-else-if="p.isCoCaptain" variant="accent">Co-captain</UiBadge>
              </span>
            </td>
            <td class="px-4 py-3 text-muted">{{ p.activisionId ?? '—' }}</td>
            <td class="px-4 py-3"><PlatformBadge :platform="p.platform" /></td>
            <td class="px-4 py-3">
              <UiBadge :variant="p.role === 'starter' ? 'outline' : 'neutral'">{{ p.role === 'starter' ? 'Starter' : 'Sub' }}</UiBadge>
            </td>
            <td v-if="$slots.actions" class="px-4 py-3 text-right">
              <slot name="actions" :player="p" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

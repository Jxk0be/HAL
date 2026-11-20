<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiPagination from '@/components/ui/UiPagination.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { usePlayerDirectory } from '@/composables/useDirectory'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { search, page, pages, players, total, loading, error } = usePlayerDirectory()
</script>

<template>
  <div>
    <PageHeader eyebrow="League" title="Players" description="Everyone registered for HAL this season." />
    <div class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div class="max-w-md" role="search">
        <UiInput
          v-model="search"
          label="Search players"
          :placeholder="auth.isSignedIn ? 'Discord name, Activision ID or team' : 'Activision ID or team'"
          hide-label
        >
          <template #prefix>
            <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.5" />
              <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </template>
        </UiInput>
      </div>

      <UiSkeleton v-if="loading && players.length === 0" :lines="8" />
      <p v-else-if="error" role="alert" class="text-loss">{{ error }}</p>
      <UiEmptyState
        v-else-if="players.length === 0"
        :title="search ? 'No players match' : 'No players yet'"
        :description="search ? 'Try another name.' : 'Players appear once they log in and set up their profile.'"
      />
      <template v-else>
        <!-- Cards (mobile) -->
        <ul class="flex flex-col gap-2 sm:hidden" aria-label="Players">
          <li v-for="p in players" :key="p.id">
            <RouterLink :to="`/players/${p.id}`" class="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 hover:border-gold-dim">
              <UiAvatar :src="p.avatarUrl" :name="p.name" size="md" decorative />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ p.name }}</p>
                <p class="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <PlatformBadge :platform="p.platform" />
                  <span class="truncate">{{ p.team ? p.team.name : p.isFreeAgent ? 'Free agent' : 'No team' }}</span>
                </p>
              </div>
            </RouterLink>
          </li>
        </ul>
        <!-- Table (sm and up) -->
        <div class="hidden overflow-x-auto rounded-lg border border-line bg-surface sm:block" :aria-busy="loading">
          <table class="w-full text-sm">
            <caption class="sr-only">Players</caption>
            <thead>
              <tr class="border-b border-line">
                <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Player</th>
                <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Activision ID</th>
                <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Platform</th>
                <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Team</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in players" :key="p.id" class="border-b border-line last:border-b-0 hover:bg-surface-2">
                <td class="px-4 py-3">
                  <RouterLink :to="`/players/${p.id}`" class="flex items-center gap-3 font-medium hover:text-gold">
                    <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
                    {{ p.name }}
                  </RouterLink>
                </td>
                <td class="px-4 py-3 text-muted">{{ p.activisionId }}</td>
                <td class="px-4 py-3"><PlatformBadge :platform="p.platform" /></td>
                <td class="px-4 py-3">
                  <RouterLink v-if="p.team" :to="`/teams/${p.team.id}`" class="flex items-center gap-2 hover:text-gold">
                    <TeamLogo :tag="p.team.tag" :name="p.team.name" :logo-url="p.team.logoUrl" size="sm" decorative />
                    {{ p.team.name }}
                  </RouterLink>
                  <UiBadge v-else-if="p.isFreeAgent" variant="win">Free agent</UiBadge>
                  <span v-else class="text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <UiPagination v-model="page" :pages="pages" :total="total" label="Player pages" />
    </div>
  </div>
</template>

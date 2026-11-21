<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

/** Admin shell: a sidebar (a scrolling tab row on phones) next to the current admin page. */
const auth = useAuthStore()

const links = computed(() =>
  [
    { to: '/admin', label: 'Overview', show: auth.isStaff, exact: true },
    { to: '/admin/mismatches', label: 'Mismatch queue', show: auth.isAdmin },
    { to: '/admin/disputes', label: 'Disputes', show: auth.isAdmin },
    { to: '/admin/rosters', label: 'Roster approvals', show: auth.isAdmin },
    { to: '/admin/content', label: 'Content', show: auth.isAdmin },
    { to: '/admin/season', label: 'Season & schedule', show: auth.isAdmin },
    { to: '/admin/discord', label: 'Discord sync', show: auth.isOwner },
    { to: '/admin/roles', label: 'User roles', show: auth.isOwner },
  ].filter((l) => l.show),
)
</script>

<template>
  <div class="mx-auto flex max-w-[90rem] flex-col lg:flex-row">
    <nav aria-label="Admin" class="border-b border-line lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0">
      <p class="eyebrow hidden px-5 pt-8 pb-3 text-gold lg:block">Admin</p>
      <ul class="flex gap-1 overflow-x-auto px-4 py-2 lg:flex-col lg:overflow-visible lg:px-3 lg:py-0">
        <li v-for="l in links" :key="l.to" class="shrink-0">
          <RouterLink
            :to="l.to"
            class="block rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-gold"
            :active-class="l.exact ? '' : 'bg-surface-2 text-text'"
            :exact-active-class="'bg-surface-2 text-text'"
          >
            {{ l.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <div class="min-w-0 flex-1">
      <RouterView />
    </div>
  </div>
</template>

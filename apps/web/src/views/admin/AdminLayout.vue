<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useAdminOverview } from '@/composables/useAdmin'

/** Admin shell: a grouped section nav (a scrolling tab row on phones) next to the current admin page. */
const auth = useAuthStore()
const { overview } = useAdminOverview()

interface Link {
  to: string
  label: string
  show: boolean
  exact?: boolean
  count?: number
}

const groups = computed(() => {
  const o = overview.value
  const g: { label: string; links: Link[] }[] = [
    {
      label: 'League',
      links: [
        { to: '/admin', label: 'Overview', show: auth.isStaff, exact: true },
        { to: '/admin/season', label: 'Season & schedule', show: auth.isAdmin, count: o?.pending_teams },
        { to: '/admin/preseason', label: 'Preseason', show: auth.isAdmin },
        { to: '/admin/maps', label: 'Modes & maps', show: auth.isAdmin },
        { to: '/admin/announcements', label: 'Announcements', show: auth.isAdmin },
      ],
    },
    {
      label: 'Queues',
      links: [
        { to: '/admin/mismatches', label: 'Mismatch queue', show: auth.isAdmin, count: o?.open_mismatch_matches },
        { to: '/admin/disputes', label: 'Disputes', show: auth.isAdmin, count: o?.open_disputes },
        { to: '/admin/rosters', label: 'Roster approvals', show: auth.isAdmin, count: o?.pending_roster_requests },
      ],
    },
    {
      label: 'Content',
      links: [
        { to: '/admin/content', label: 'Content', show: auth.isAdmin },
        { to: '/admin/casting', label: 'Casting desk', show: auth.isCaster || auth.isAdmin },
      ],
    },
    {
      label: 'System',
      links: [
        { to: '/admin/health', label: 'Health', show: auth.isAdmin },
        { to: '/admin/discord', label: 'Discord sync', show: auth.isOwner },
        { to: '/admin/roles', label: 'User roles', show: auth.isOwner },
      ],
    },
  ]
  return g.map((x) => ({ ...x, links: x.links.filter((l) => l.show) })).filter((x) => x.links.length)
})
const flat = computed(() => groups.value.flatMap((g) => g.links))
</script>

<template>
  <div class="flex flex-col lg:flex-row">
    <!-- Desktop: a second, narrower column next to the rail -->
    <nav
      aria-label="Admin"
      class="hidden border-r border-line bg-surface lg:sticky lg:top-topbar lg:block lg:h-[calc(100dvh-var(--spacing-topbar))] lg:w-[200px] lg:shrink-0 lg:overflow-y-auto"
    >
      <p class="eyebrow-line px-5 pt-6 pb-2 text-faint">Control center</p>
      <div v-for="g in groups" :key="g.label" class="px-3 pb-3">
        <p class="eyebrow px-2 pt-3 pb-1.5 text-[0.65rem] text-faint">{{ g.label }}</p>
        <ul class="flex flex-col gap-0.5">
          <li v-for="l in g.links" :key="l.to">
            <RouterLink
              :to="l.to"
              class="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
              :active-class="l.exact ? '' : 'bg-accent-soft text-accent'"
              exact-active-class="bg-accent-soft text-accent"
            >
              <span class="truncate">{{ l.label }}</span>
              <span v-if="l.count" class="tnum rounded-full bg-brand px-1.5 text-[11px] font-semibold text-on-brand">{{ l.count }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
    <!-- Phones and tablets: scrolling tabs -->
    <nav aria-label="Admin" class="border-b border-line lg:hidden">
      <ul class="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        <li v-for="l in flat" :key="l.to" class="shrink-0">
          <RouterLink
            :to="l.to"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-text"
            :active-class="l.exact ? '' : 'bg-accent-soft text-accent'"
            exact-active-class="bg-accent-soft text-accent"
          >
            {{ l.label }}
            <span v-if="l.count" class="tnum rounded-full bg-brand px-1.5 text-[11px] font-semibold text-on-brand">{{ l.count }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
    <div class="min-w-0 flex-1">
      <RouterView v-slot="{ Component, route: r }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="r.path" />
        </Transition>
      </RouterView>
    </div>
  </div>
</template>

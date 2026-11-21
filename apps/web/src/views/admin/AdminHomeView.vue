<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const sections = computed(() =>
  [
    { to: '/admin/season', title: 'Season & schedule', body: 'Season settings, team approvals, divisions, modes and maps, schedule and playoffs.', ready: true, show: auth.isAdmin },
    { to: '/admin/discord', title: 'Discord sync', body: 'Resync team roles and channels; see sync errors.', ready: true, show: auth.isOwner },
    { to: '/admin/mismatches', title: 'Mismatch queue', body: 'Stats where the two captains disagree.', ready: false, show: auth.isAdmin },
    { to: '/admin/disputes', title: 'Disputes', body: 'Open disputes and their evidence.', ready: false, show: auth.isAdmin },
    { to: '/admin/rosters', title: 'Roster approvals', body: 'Emergency sub requests.', ready: false, show: auth.isAdmin },
    { to: '/admin/content', title: 'Content', body: 'Edit any match, result, team or free agent post.', ready: false, show: auth.isAdmin },
    { to: '/admin/roles', title: 'User roles', body: 'Grant and revoke staff roles.', ready: false, show: auth.isOwner },
  ].filter((s) => s.show),
)
</script>

<template>
  <div>
    <PageHeader eyebrow="Staff" title="Admin" description="League operations. Staff never act on matches or teams they play on; the database enforces it." />
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p v-if="!auth.isAdmin" class="text-sm text-muted">Casters manage broadcasts from match pages.</p>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="s in sections" :key="s.to">
          <RouterLink :to="s.to" class="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 transition-colors hover:border-gold-dim">
            <span class="flex items-center justify-between gap-2">
              <span class="font-heading text-xl group-hover:text-gold">{{ s.title }}</span>
              <UiBadge v-if="!s.ready">Soon</UiBadge>
            </span>
            <span class="mt-2 text-sm text-muted">{{ s.body }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>

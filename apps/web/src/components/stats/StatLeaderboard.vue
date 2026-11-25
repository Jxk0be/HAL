<script setup lang="ts">
import UiAvatar from '@/components/ui/UiAvatar.vue'
import type { LeaderboardRow } from '@/lib/leaderboard'

defineProps<{
  title: string
  rows: LeaderboardRow[]
  value: (r: LeaderboardRow) => string
}>()
</script>

<template>
  <section class="rounded-lg border border-line bg-surface" :aria-label="title">
    <h3 class="border-b border-line px-4 py-3 font-heading text-lg">{{ title }}</h3>
    <ol v-if="rows.length" class="divide-y divide-line">
      <li v-for="(r, i) in rows" :key="r.user_id ?? i" class="flex items-center gap-3 px-4 py-2.5 text-sm">
        <span class="tnum w-5 font-mono" :class="i === 0 ? 'text-accent' : 'text-muted'">{{ i + 1 }}</span>
        <UiAvatar :src="r.avatar_url" :name="r.activision_id" size="xs" decorative />
        <RouterLink :to="`/players/${r.user_id}`" class="min-w-0 flex-1 truncate hover:text-accent">{{ r.activision_id }}</RouterLink>
        <span v-if="r.incomplete" class="text-xs text-accent" :title="r.incomplete_reason ?? undefined">*<span class="sr-only"> incomplete data</span></span>
        <span v-if="r.team_tag" class="text-xs text-muted">{{ r.team_tag }}</span>
        <span class="tnum font-heading text-base" :class="i === 0 ? 'text-accent' : ''">{{ value(r) }}</span>
      </li>
    </ol>
    <p v-else class="px-4 py-6 text-sm text-muted">No stats yet.</p>
  </section>
</template>

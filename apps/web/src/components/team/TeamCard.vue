<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import type { TeamSummary } from '@/composables/useTeams'

defineProps<{
  team: TeamSummary
  record?: { wins: number; losses: number } | null
  /** Active recruiting post id, when the team is recruiting. */
  recruitPostId?: string | null
  /** Show "Interested" (signed-in player with a complete profile and no team). */
  canInterest?: boolean
  interested?: boolean
  busy?: boolean
}>()
defineEmits<{ interest: [postId: string] }>()
</script>

<template>
  <article class="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong motion-reduce:hover:translate-y-0">
    <div class="team-banner relative aspect-[3/1] bg-surface-2">
      <img v-if="team.bannerUrl" :src="team.bannerUrl" alt="" class="size-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-t from-surface/80 to-transparent" aria-hidden="true" />
      <span class="absolute top-3 right-3 flex gap-1.5">
        <UiBadge v-if="recruitPostId" variant="accent">Recruiting</UiBadge>
        <UiBadge :variant="team.status === 'approved' ? 'win' : 'neutral'">{{ team.status === 'approved' ? 'Approved' : 'Pending' }}</UiBadge>
      </span>
      <span class="absolute -bottom-7 left-4 rounded-xl ring-3 ring-surface">
        <TeamLogo :tag="team.tag" :name="team.name" :logo-url="team.logoUrl" size="lg" decorative />
      </span>
    </div>
    <div class="flex flex-1 flex-col px-4 pt-9 pb-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate font-heading text-xl">
            <RouterLink :to="`/teams/${team.id}`" class="hover:text-accent">{{ team.name }}</RouterLink>
          </h3>
          <p class="mt-0.5 text-sm text-muted">
            <span class="font-heading text-text">{{ team.tag }}</span><template v-if="team.division"> · {{ team.division }}</template>
          </p>
        </div>
        <p v-if="record" class="tnum shrink-0 font-heading text-2xl" :aria-label="`Record ${record.wins} wins, ${record.losses} losses`">
          {{ record.wins }}–{{ record.losses }}
        </p>
      </div>
      <div class="mt-4 flex items-center justify-between gap-3">
        <ul class="flex -space-x-2" :aria-label="`${team.starters.length} starters`">
          <li v-for="(p, i) in team.starters.slice(0, 4)" :key="i" class="rounded-full ring-2 ring-surface">
            <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
          </li>
        </ul>
        <span class="text-xs text-muted"><span class="tnum">{{ team.rosterSize }}</span> players</span>
      </div>
      <div class="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <UiButton :to="`/teams/${team.id}`" size="sm" variant="secondary">View team</UiButton>
        <UiButton
          v-if="recruitPostId && canInterest"
          size="sm"
          :disabled="interested"
          :loading="busy"
          @click="$emit('interest', recruitPostId)"
        >
          {{ interested ? 'Interest sent' : 'Interested' }}
        </UiButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Fallback when there's no banner: dark gradient + dot grid. */
.team-banner {
  background-image:
    radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px),
    radial-gradient(circle at 85% 0%, rgb(255 79 92 / 0.16), transparent 60%),
    linear-gradient(135deg, var(--color-surface-3), var(--color-bg));
  background-size:
    14px 14px,
    100% 100%,
    100% 100%;
}
</style>

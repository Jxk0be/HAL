<script setup lang="ts">
import { computed } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { describeMismatch } from '@/lib/reporting'
import type { ReportStatus } from '@/composables/useReport'

/** "Waiting for opponent" / "Confirmed" / "Mismatch: admins notified", with the fields that differ. */
const props = defineProps<{
  status: ReportStatus
  homeTag: string
  awayTag: string
  /** The viewer's side, to say "you" and "your opponent". */
  myTeamSide?: 'home' | 'away' | null
}>()

const state = computed(() => {
  const s = props.status
  if (s.status === 'confirmed') {
    return {
      label: 'Confirmed',
      variant: 'win' as const,
      text:
        s.resultSource === 'single_report'
          ? 'Only one team reported within 24 hours, so that report was accepted.'
          : s.resultSource === 'admin'
            ? 'An admin settled this result.'
            : 'Both reports agree on the result. Standings are updated.',
    }
  }
  if (s.status === 'disputed') {
    return { label: 'Mismatch: admins notified', variant: 'loss' as const, text: 'The two reports disagree on the maps. Admins will review the screenshots, or either captain can correct and resubmit.' }
  }
  const mine = props.myTeamSide === 'home' ? s.homeReportedAt : props.myTeamSide === 'away' ? s.awayReportedAt : null
  const theirs = props.myTeamSide === 'home' ? s.awayReportedAt : props.myTeamSide === 'away' ? s.homeReportedAt : null
  if (mine && !theirs) {
    return { label: 'Waiting for opponent', variant: 'gold' as const, text: 'Your report is in. If the other captain hasn’t reported 24 hours after the match time, yours is accepted.' }
  }
  if (!mine && theirs) {
    return { label: 'Your report is due', variant: 'gold' as const, text: 'Your opponent has reported. Submit yours so the result can be confirmed.' }
  }
  return { label: 'Not reported yet', variant: 'neutral' as const, text: 'Both captains submit the full scoreboard after the match.' }
})

const playerMismatches = computed(() => props.status.mismatches.filter((m) => m.kind === 'player_stat' && !m.resolved))
const mapMismatches = computed(() => props.status.mismatches.filter((m) => m.kind === 'map_score' && !m.resolved))
</script>

<template>
  <div class="flex flex-col gap-3 text-sm" role="status">
    <div class="flex flex-wrap items-center gap-2">
      <UiBadge :variant="state.variant">{{ state.label }}</UiBadge>
    </div>
    <p class="text-muted">{{ state.text }}</p>
    <dl class="grid grid-cols-2 gap-2 text-xs">
      <div>
        <dt class="text-muted">{{ homeTag }} report</dt>
        <dd><LeagueTime v-if="status.homeReportedAt" :iso="status.homeReportedAt" /><span v-else class="text-faint">Not yet</span></dd>
      </div>
      <div>
        <dt class="text-muted">{{ awayTag }} report</dt>
        <dd><LeagueTime v-if="status.awayReportedAt" :iso="status.awayReportedAt" /><span v-else class="text-faint">Not yet</span></dd>
      </div>
    </dl>
    <div v-if="mapMismatches.length">
      <p class="font-medium text-loss">Maps that don’t match</p>
      <ul class="mt-1 list-disc pl-5 text-muted">
        <li v-for="(m, i) in mapMismatches" :key="i">{{ describeMismatch(m) }}</li>
      </ul>
    </div>
    <div v-if="playerMismatches.length">
      <p class="font-medium text-loss">Player stats that don’t match</p>
      <p class="text-xs text-muted">Admins settle these from the screenshots. The result isn’t affected.</p>
      <ul class="mt-1 list-disc pl-5 text-muted">
        <li v-for="(m, i) in playerMismatches" :key="i">{{ describeMismatch(m) }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useRecusal, useRosterRequests, type RosterRequestRow } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const r = useRosterRequests()
const { rows, loading, busy } = r
const { isRecused } = useRecusal()
const notes = reactive<Record<string, string>>({})

const TYPE: Record<RosterRequestRow['type'], string> = { add: 'Add player', drop: 'Drop player', emergency_sub: 'Emergency sub' }
const recused = (q: RosterRequestRow) => isRecused(q.team.id, q.match?.home.id, q.match?.away.id)
const locked = (q: RosterRequestRow) => Boolean(q.team.lockAt && new Date(q.team.lockAt).getTime() <= Date.now())

async function review(q: RosterRequestRow, approve: boolean) {
  const res = await r.review(q.id, approve, notes[q.id]?.trim() || undefined)
  if (!res.ok) toast.error(res.message)
  else toast.success(approve ? (q.type === 'emergency_sub' ? `${q.player} can play this one match for ${q.team.tag}.` : 'Approved.') : 'Denied.')
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Admin" title="Roster approvals" description="Pending emergency subs and roster fixes. An approved emergency sub joins the roster for that one match only." />
    <div class="px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="5" />
      <UiEmptyState v-else-if="!rows.length" title="No pending requests" description="Captains request emergency subs from their My Team page." />
      <ul v-else class="flex flex-col gap-3">
        <li v-for="q in rows" :key="q.id" class="rounded-lg border border-line bg-surface p-4" :class="recused(q) ? 'opacity-70' : ''">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-heading text-lg">{{ TYPE[q.type] }}: {{ q.player }}</p>
              <p class="text-sm text-muted">
                <RouterLink :to="`/teams/${q.team.id}`" class="hover:text-gold">{{ q.team.name }} [{{ q.team.tag }}]</RouterLink>
                <template v-if="q.match">
                  · for <RouterLink :to="`/matches/${q.match.id}`" class="hover:text-gold">{{ q.match.home.tag }} vs {{ q.match.away.tag }}</RouterLink>,
                  week {{ q.match.week }}, <LeagueTime :iso="q.match.scheduledAt" />
                </template>
              </p>
              <p class="mt-1 text-xs text-muted">Requested <LeagueTime :iso="q.createdAt" /></p>
            </div>
            <span class="flex flex-wrap gap-2">
              <UiBadge :variant="q.team.changesUsed >= q.team.maxChanges ? 'loss' : 'neutral'">
                Changes {{ q.team.changesUsed }}/{{ q.team.maxChanges }}
              </UiBadge>
              <UiBadge :variant="locked(q) ? 'loss' : 'win'">{{ locked(q) ? 'Rosters locked' : 'Rosters open' }}</UiBadge>
            </span>
          </div>
          <p v-if="q.note" class="mt-2 text-sm">{{ q.note }}</p>
          <div class="mt-3 border-t border-line pt-3">
            <RecusedNotice v-if="recused(q)" />
            <div v-else class="flex flex-wrap items-end gap-2">
              <label class="flex min-w-56 flex-1 flex-col gap-1 text-xs">
                <span class="text-muted">Note for the captain (optional)</span>
                <input v-model="notes[q.id]" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-gold" />
              </label>
              <UiButton size="sm" :disabled="busy" @click="review(q, true)">Approve</UiButton>
              <UiButton size="sm" variant="danger" :disabled="busy" @click="review(q, false)">Deny</UiButton>
            </div>
            <div v-if="!recused(q)" class="mt-2"><PublicLogNotice /></div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

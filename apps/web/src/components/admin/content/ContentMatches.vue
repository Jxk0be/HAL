<script setup lang="ts">
import { computed, ref } from 'vue'
import MatchEditModal from '@/components/admin/MatchEditModal.vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import ResultEditorModal from '@/components/admin/ResultEditorModal.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { adminResults, useRecusal } from '@/composables/useAdmin'
import { useSeasonMatches, type AdminMatch } from '@/composables/useSeasonMatches'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  seasonId: string
  timezone: string
  teams: { id: string; name: string; tag: string }[]
}>()

const toast = useToast()
const sm = useSeasonMatches(() => props.seasonId)
const { matches, loading, busy } = sm
const { isRecused } = useRecusal()

const search = ref('')
const status = ref<string>('')
const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'unreported', label: 'Unreported 24h+' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'awaiting_reports', label: 'Awaiting reports' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'confirmed', label: 'Final' },
  { value: 'forfeit', label: 'Forfeit' },
  { value: 'cancelled', label: 'Cancelled' },
]
const team = (id: string) => props.teams.find((t) => t.id === id) ?? { id, name: '?', tag: '?' }

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const dayAgo = Date.now() - 24 * 3600_000
  return matches.value.filter((m) => {
    if (status.value === 'unreported') {
      if (!['scheduled', 'checkin_open', 'live', 'awaiting_reports'].includes(m.status) || new Date(m.scheduledAt).getTime() > dayAgo) return false
    } else if (status.value && m.status !== status.value) return false
    if (!q) return true
    const h = team(m.homeTeamId)
    const a = team(m.awayTeamId)
    return [h.name, h.tag, a.name, a.tag, `week ${m.week}`].some((s) => s.toLowerCase().includes(q))
  })
})

// Edit teams and times
const editOpen = ref(false)
const editing = ref<AdminMatch | null>(null)
async function saveEdit(id: string, patch: Parameters<typeof sm.updateMatch>[1]) {
  const r = await sm.updateMatch(id, patch)
  if (r.ok) {
    toast.success('Match saved.')
    editOpen.value = false
  } else toast.error(r.message)
}

// Result
const resultOpen = ref(false)
const resultMatch = ref<{ id: string; home: { tag: string; name: string }; away: { tag: string; name: string } } | null>(null)
function editResult(m: AdminMatch) {
  resultMatch.value = { id: m.id, home: team(m.homeTeamId), away: team(m.awayTeamId) }
  resultOpen.value = true
}

async function clearResult(m: AdminMatch) {
  if (!window.confirm('Clear this result? Maps, stats and both captains’ reports are removed so the match can be reported again.')) return
  const r = await adminResults.clearResult(m.id)
  if (r.ok) {
    toast.success('Result cleared.')
    void sm.reload()
  } else toast.error(r.message)
}

async function forfeit(m: AdminMatch, teamId: string) {
  if (!teamId) return
  if (!window.confirm(`Record a forfeit by ${team(teamId).name}?`)) return
  const r = await adminResults.forfeit(m.id, teamId)
  if (r.ok) {
    toast.success('Forfeit recorded.')
    void sm.reload()
  } else toast.error(r.message)
}

async function cancel(m: AdminMatch) {
  if (!window.confirm('Cancel this match? It no longer counts in the standings.')) return
  const r = await sm.updateMatch(m.id, { status: 'cancelled' })
  if (r.ok) toast.success('Match cancelled.')
  else toast.error(r.message)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-48 flex-1"><UiInput v-model="search" label="Search" placeholder="Team name, tag or week 3" /></div>
      <div class="min-w-44"><UiSelect v-model="status" label="Status" :options="STATUS_OPTIONS" /></div>
    </div>
    <PublicLogNotice />
    <UiSkeleton v-if="loading" :lines="6" />
    <UiEmptyState v-else-if="!filtered.length" title="No matches" description="Nothing matches those filters." />
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-for="m in filtered" :key="m.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm" :class="isRecused(m.homeTeamId, m.awayTeamId) ? 'opacity-70' : ''">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/matches/${m.id}`" class="font-medium hover:text-gold">{{ team(m.homeTeamId).tag }} vs {{ team(m.awayTeamId).tag }}</RouterLink>
          <span class="block text-xs text-muted">Week {{ m.week }}<template v-if="m.stage === 'playoff'"> · playoffs</template> · <LeagueTime :iso="m.scheduledAt" /></span>
        </span>
        <UiBadge :variant="m.status === 'confirmed' ? 'win' : ['disputed', 'forfeit', 'cancelled'].includes(m.status) ? 'loss' : 'neutral'">{{ m.status.replace('_', ' ') }}</UiBadge>
        <RecusedNotice v-if="isRecused(m.homeTeamId, m.awayTeamId)" />
        <span v-else class="flex flex-wrap items-center gap-1.5">
          <UiButton size="sm" variant="ghost" @click="editing = m; editOpen = true">Edit</UiButton>
          <UiButton size="sm" variant="ghost" @click="editResult(m)">Result</UiButton>
          <UiButton v-if="m.status !== 'scheduled'" size="sm" variant="ghost" @click="clearResult(m)">Clear</UiButton>
          <select
            class="h-8 rounded-md border border-line-strong bg-surface-2 px-2 text-xs"
            :aria-label="`Record a forfeit for ${team(m.homeTeamId).tag} vs ${team(m.awayTeamId).tag}`"
            @change="forfeit(m, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
          >
            <option value="">Forfeit…</option>
            <option :value="m.homeTeamId">{{ team(m.homeTeamId).tag }} forfeits</option>
            <option :value="m.awayTeamId">{{ team(m.awayTeamId).tag }} forfeits</option>
          </select>
          <UiButton v-if="m.status !== 'cancelled'" size="sm" variant="danger" @click="cancel(m)">Cancel</UiButton>
        </span>
      </li>
    </ul>

    <MatchEditModal v-model="editOpen" :match="editing" :teams="teams" :timezone="timezone" :busy="busy" @save="saveEdit" />
    <ResultEditorModal v-model="resultOpen" :match="resultMatch" @saved="sm.reload()" />
  </div>
</template>

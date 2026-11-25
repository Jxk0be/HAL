<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import ResultEditorModal from '@/components/admin/ResultEditorModal.vue'
import ScreenshotViewer from '@/components/admin/ScreenshotViewer.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { adminResults, useDisputes, useRecusal, type DisputeRow } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type { Database } from '@/types/database'

type PenaltyType = Database['public']['Enums']['penalty_type']

const toast = useToast()
const d = useDisputes()
const { rows, loading, busy } = d
const { isRecused } = useRecusal()

const tab = ref<'open' | 'resolved'>('open')
const tabs = computed(() => [
  { value: 'open' as const, label: 'Open', count: rows.value.filter((r) => r.status === 'open').length },
  { value: 'resolved' as const, label: 'Resolved' },
])
const shown = computed(() => rows.value.filter((r) => r.status === tab.value))
const recused = (r: DisputeRow) => isRecused(r.match.home.id, r.match.away.id)
const teamOf = (r: DisputeRow, id: string) => (id === r.match.home.id ? r.match.home : r.match.away)

// Resolve
const resolution = reactive<Record<string, string>>({})
async function resolve(r: DisputeRow) {
  const text = resolution[r.id]?.trim() ?? ''
  if (text.length < 10) {
    toast.error('Write the decision (at least 10 characters). It is shown publicly on the match page.')
    return
  }
  const res = await d.resolve(r.id, text)
  if (res.ok) toast.success('Dispute resolved.')
  else toast.error(res.message)
}
async function reopen(r: DisputeRow) {
  const res = await d.reopen(r.id)
  if (res.ok) toast.success('Dispute reopened.')
  else toast.error(res.message)
}

// Result editor
const editing = ref<DisputeRow | null>(null)
const editorOpen = ref(false)
const editorMatch = computed(() => (editing.value ? { id: editing.value.matchId, home: editing.value.match.home, away: editing.value.match.away } : null))
function editResult(r: DisputeRow) {
  editing.value = r
  editorOpen.value = true
}

// Forfeit
async function forfeit(r: DisputeRow, teamId: string) {
  const team = teamOf(r, teamId)
  if (!window.confirm(`Record a forfeit by ${team.name}? The other team wins 3–0 in the standings.`)) return
  const res = await adminResults.forfeit(r.matchId, teamId)
  if (res.ok) {
    toast.success(`Forfeit by ${team.tag} recorded.`)
    void d.reload()
  } else toast.error(res.message)
}

// Penalty
const penaltyFor = ref<DisputeRow | null>(null)
const penaltyOpen = ref(false)
const penalty = reactive<{ teamId: string; type: PenaltyType; note: string }>({ teamId: '', type: 'warning', note: '' })
const PENALTIES: { value: PenaltyType; label: string }[] = [
  { value: 'warning', label: 'Warning' },
  { value: 'map_forfeit', label: 'Map forfeit' },
  { value: 'series_forfeit', label: 'Series forfeit' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'team_removal', label: 'Team removal' },
  { value: 'other', label: 'Other' },
]
function openPenalty(r: DisputeRow) {
  penaltyFor.value = r
  penalty.teamId = r.match.home.id
  penalty.type = 'warning'
  penalty.note = ''
  penaltyOpen.value = true
}
async function issuePenalty() {
  const r = penaltyFor.value
  if (!r || penalty.note.trim().length < 3) {
    toast.error('Add a short note explaining the penalty.')
    return
  }
  const res = await d.penalty({ team_id: penalty.teamId, user_id: null, match_id: r.matchId, type: penalty.type, note: penalty.note.trim() })
  if (res.ok) {
    toast.success('Penalty issued.')
    penaltyOpen.value = false
  } else toast.error(res.message)
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Admin" title="Disputes" description="Open disputes first. Decisions are public on the match page; evidence stays with the teams and staff." />
    <div class="px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="6" />
      <UiTabs v-else v-model="tab" label="Dispute status" :tabs="tabs">
        <UiEmptyState v-if="!shown.length" :title="tab === 'open' ? 'No open disputes' : 'No resolved disputes yet'" />
        <ul v-else class="flex flex-col gap-4">
          <li v-for="r in shown" :key="r.id" class="rounded-lg border border-line bg-surface p-4 sm:p-5" :class="recused(r) ? 'opacity-70' : ''">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <RouterLink :to="`/matches/${r.matchId}`" class="font-heading text-xl hover:text-accent">{{ r.match.home.tag }} vs {{ r.match.away.tag }}</RouterLink>
                <p class="text-xs text-muted">
                  Week {{ r.match.week }} · <LeagueTime :iso="r.match.scheduledAt" /> · opened by {{ r.openedBy }} ({{ teamOf(r, r.teamId).tag }}) <LeagueTime :iso="r.createdAt" />
                </p>
              </div>
              <span class="flex flex-wrap gap-2">
                <UiBadge variant="outline">{{ r.category }}</UiBadge>
                <UiBadge :variant="r.status === 'open' ? 'loss' : 'win'">{{ r.status }}</UiBadge>
                <UiBadge variant="outline">Match: {{ r.match.status }}</UiBadge>
              </span>
            </div>

            <p class="mt-3 text-sm whitespace-pre-line">{{ r.reason }}</p>
            <p class="mt-1 text-xs text-muted">Discuss it with both captains on the <RouterLink :to="`/matches/${r.matchId}`" class="text-accent hover:text-accent-strong">match page</RouterLink>.</p>

            <div v-if="r.evidence.length" class="mt-3 flex flex-col gap-2">
              <p class="eyebrow text-muted">Evidence</p>
              <ScreenshotViewer
                :images="r.evidence.filter((e) => e.signedUrl).map((e, i) => ({ url: e.signedUrl!, label: e.note ?? `Evidence ${i + 1}` }))"
                label="Evidence images"
              />
              <ul class="flex flex-col gap-1 text-sm">
                <li v-for="e in r.evidence.filter((x) => x.url)" :key="e.id">
                  <a :href="e.url!" target="_blank" rel="noopener noreferrer" class="text-accent hover:text-accent-strong">{{ e.note || e.url }}</a>
                </li>
              </ul>
            </div>

            <p v-if="r.resolution" class="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"><strong class="text-accent">Decision:</strong> {{ r.resolution }}</p>

            <div class="mt-4 border-t border-line pt-4">
              <RecusedNotice v-if="recused(r)" />
              <template v-else-if="r.status === 'open'">
                <label class="flex flex-col gap-1.5 text-sm">
                  <span class="font-medium">Decision (shown publicly)</span>
                  <textarea v-model="resolution[r.id]" rows="3" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
                </label>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UiButton :disabled="busy" @click="resolve(r)">Resolve</UiButton>
                  <UiButton variant="secondary" @click="editResult(r)">Overturn result</UiButton>
                  <UiButton variant="secondary" @click="openPenalty(r)">Issue penalty</UiButton>
                  <UiButton variant="danger" @click="forfeit(r, r.match.home.id)">Forfeit {{ r.match.home.tag }}</UiButton>
                  <UiButton variant="danger" @click="forfeit(r, r.match.away.id)">Forfeit {{ r.match.away.tag }}</UiButton>
                </div>
                <div class="mt-3"><PublicLogNotice /></div>
              </template>
              <UiButton v-else size="sm" variant="ghost" :disabled="busy" @click="reopen(r)">Reopen</UiButton>
            </div>
          </li>
        </ul>
      </UiTabs>
    </div>

    <ResultEditorModal v-model="editorOpen" :match="editorMatch" @saved="d.reload()" />

    <UiModal v-model="penaltyOpen" title="Issue a penalty">
      <form v-if="penaltyFor" class="flex flex-col gap-4" @submit.prevent="issuePenalty">
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Team</span>
          <select v-model="penalty.teamId" class="h-10 rounded-md border border-line-strong bg-surface-2 px-3">
            <option :value="penaltyFor.match.home.id">{{ penaltyFor.match.home.name }}</option>
            <option :value="penaltyFor.match.away.id">{{ penaltyFor.match.away.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Penalty</span>
          <select v-model="penalty.type" class="h-10 rounded-md border border-line-strong bg-surface-2 px-3">
            <option v-for="p in PENALTIES" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Note (rule number and reason)</span>
          <textarea v-model="penalty.note" rows="3" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2" />
        </label>
        <p class="text-xs text-muted">A forfeit penalty is a record only; use the Forfeit buttons to change the result.</p>
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="penaltyOpen = false">Cancel</UiButton>
          <UiButton type="submit" :loading="busy">Issue penalty</UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

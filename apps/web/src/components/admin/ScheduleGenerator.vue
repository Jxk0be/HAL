<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import MatchEditModal from './MatchEditModal.vue'
import type { AdminTeam, Division } from '@/composables/useSeasonAdmin'
import { useSeasonMatches, type AdminMatch } from '@/composables/useSeasonMatches'
import { useToast } from '@/composables/useToast'
import { generateSchedule, scheduleSummary } from '@/lib/schedule'
import { formatLeagueTime, type Night } from '@/lib/time'
import type { Database } from '@/types/database'

const props = defineProps<{
  season: Database['public']['Tables']['seasons']['Row']
  divisions: Division[]
  teams: AdminTeam[]
  canEdit: boolean
}>()

const toast = useToast()
const sm = useSeasonMatches(() => props.season.id)

// Which division: '' = whole league (no divisions).
const divisionId = ref('')
watch(
  () => props.divisions,
  (d) => (divisionId.value = d[0]?.id ?? ''),
  { immediate: true },
)
const divisionOptions = computed(() =>
  props.divisions.length ? props.divisions.map((d) => ({ value: d.id, label: d.name })) : [{ value: '', label: 'Whole league' }],
)
const divTeams = computed(() =>
  props.teams.filter((t) => (props.divisions.length ? t.divisionId === divisionId.value : true)),
)
const teamName = (id: string) => props.teams.find((t) => t.id === id)?.tag ?? '?'
const teamFull = (id: string) => props.teams.find((t) => t.id === id)?.name ?? 'Unknown team'

const existing = computed(() =>
  sm.matches.value.filter((m) => m.stage === 'regular' && (m.divisionId ?? '') === divisionId.value),
)

// Preview
const seed = ref(Math.floor(Math.random() * 1e9))
const preview = computed(() => {
  if (!props.season.starts_on || divTeams.value.length < 2) return null
  return generateSchedule({
    teamIds: divTeams.value.map((t) => t.id),
    weeks: props.season.regular_weeks,
    nights: props.season.match_nights as Night[],
    startDate: props.season.starts_on,
    matchTime: props.season.match_time.slice(0, 5),
    timezone: props.season.timezone,
    seed: seed.value,
  })
})
const summary = computed(() =>
  preview.value ? scheduleSummary(preview.value, divTeams.value.map((t) => t.id)) : [],
)
const weeks = computed(() => Array.from({ length: props.season.regular_weeks }, (_, i) => i + 1))

function cell(teamId: string, week: number) {
  if (!preview.value) return []
  const games = preview.value.matches
    .filter((m) => m.week === week && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .map((m) => (m.homeTeamId === teamId ? `vs ${teamName(m.awayTeamId)}` : `@ ${teamName(m.homeTeamId)}`))
  const byes = preview.value.byes.filter((b) => b.teamId === teamId && Math.ceil(b.round / props.season.match_nights.length) === week)
  return [...games, ...byes.map(() => 'bye')]
}

const confirmOpen = ref(false)
async function save(replace: boolean) {
  if (!preview.value) return
  const rows = preview.value.matches.map((m) => ({
    division_id: divisionId.value || null,
    week: m.week,
    stage: 'regular' as const,
    home_team_id: m.homeTeamId,
    away_team_id: m.awayTeamId,
    default_at: m.defaultAt,
  }))
  const r = await sm.createMatches(rows, replace)
  confirmOpen.value = false
  if (!r.ok) return toast.error(r.message)
  toast.success(`Saved ${r.count} matches.`)
}

// Editing saved matches
const editing = ref<AdminMatch | null>(null)
const editOpen = ref(false)
function edit(m: AdminMatch) {
  editing.value = m
  editOpen.value = true
}
async function saveEdit(id: string, patch: Parameters<typeof sm.updateMatch>[1]) {
  const r = await sm.updateMatch(id, patch)
  if (!r.ok) return toast.error(r.message)
  editOpen.value = false
  toast.success('Match updated.')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-3">
      <div class="w-56">
        <UiSelect v-model="divisionId" label="Division" :options="divisionOptions" :disabled="divisions.length === 0" />
      </div>
      <p class="pb-2 text-sm text-muted">
        <span class="tnum">{{ divTeams.length }}</span> approved teams ·
        {{ season.regular_weeks }} weeks · {{ season.match_nights.join(' & ') }} at {{ season.match_time.slice(0, 5) }} ET
      </p>
    </div>

    <UiEmptyState
      v-if="!season.starts_on"
      title="Set the start date first"
      description="Add the regular season start date on the Season tab, then come back to generate the schedule."
    />
    <UiEmptyState v-else-if="divTeams.length < 2" title="Not enough teams" description="Approve at least two teams (and place them in this division) to build a schedule." />

    <template v-else>
      <!-- Saved schedule -->
      <section v-if="existing.length" aria-labelledby="saved-title" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="saved-title" class="font-heading text-xl">Saved schedule <UiBadge variant="win">{{ existing.length }} matches</UiBadge></h3>
        </div>
        <div class="max-h-[28rem] overflow-auto rounded-lg border border-line bg-surface">
          <table class="w-full text-sm">
            <caption class="sr-only">Saved regular-season matches</caption>
            <thead class="sticky top-0 bg-surface">
              <tr class="border-b border-line">
                <th scope="col" class="eyebrow px-4 py-2.5 text-left text-muted">Week</th>
                <th scope="col" class="eyebrow px-4 py-2.5 text-left text-muted">When (ET)</th>
                <th scope="col" class="eyebrow px-4 py-2.5 text-left text-muted">Match</th>
                <th scope="col" class="eyebrow px-4 py-2.5 text-left text-muted">Status</th>
                <th scope="col" class="px-4 py-2.5"><span class="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in existing" :key="m.id" class="border-b border-line last:border-b-0">
                <td class="tnum px-4 py-2">{{ m.week }}</td>
                <td class="px-4 py-2 text-muted">{{ formatLeagueTime(m.scheduledAt, season.timezone) }}</td>
                <td class="px-4 py-2">{{ teamFull(m.homeTeamId) }} <span class="text-muted">vs</span> {{ teamFull(m.awayTeamId) }}</td>
                <td class="px-4 py-2"><UiBadge>{{ m.status }}</UiBadge></td>
                <td class="px-4 py-2 text-right">
                  <UiButton v-if="canEdit" size="sm" variant="ghost" @click="edit(m)">Edit<span class="sr-only"> week {{ m.week }} match</span></UiButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Generator preview -->
      <section v-if="preview" aria-labelledby="preview-title" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="preview-title" class="font-heading text-xl">
            {{ existing.length ? 'Generate a new schedule' : 'Preview' }}
            <span class="tnum text-base text-muted">· {{ preview.matches.length }} matches</span>
          </h3>
          <div v-if="canEdit" class="flex gap-2">
            <UiButton size="sm" variant="secondary" @click="seed = Math.floor(Math.random() * 1e9)">Regenerate</UiButton>
            <UiButton size="sm" :loading="sm.busy.value" @click="existing.length ? (confirmOpen = true) : save(false)">
              {{ existing.length ? 'Replace schedule' : 'Save schedule' }}
            </UiButton>
          </div>
        </div>
        <div class="overflow-x-auto rounded-lg border border-line bg-surface">
          <table class="w-full text-xs">
            <caption class="sr-only">Schedule preview: each team's opponents per week (vs = home, @ = away)</caption>
            <thead>
              <tr class="border-b border-line">
                <th scope="col" class="eyebrow sticky left-0 bg-surface px-3 py-2.5 text-left text-muted">Team</th>
                <th v-for="w in weeks" :key="w" scope="col" class="eyebrow px-3 py-2.5 text-left text-muted">Wk {{ w }}</th>
                <th scope="col" class="eyebrow px-3 py-2.5 text-right text-muted">H/A</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in divTeams" :key="t.id" class="border-b border-line last:border-b-0">
                <th scope="row" class="sticky left-0 bg-surface px-3 py-2 text-left font-medium whitespace-nowrap">{{ t.tag }}</th>
                <td v-for="w in weeks" :key="w" class="px-3 py-2 whitespace-nowrap text-muted">
                  <span v-for="(c, i) in cell(t.id, w)" :key="i" class="block" :class="c === 'bye' ? 'text-faint italic' : c.startsWith('vs') ? 'text-text' : ''">{{ c }}</span>
                </td>
                <td class="tnum px-3 py-2 text-right text-muted">
                  {{ summary.find((s) => s.teamId === t.id)?.home }}/{{ summary.find((s) => s.teamId === t.id)?.away }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted">
          "vs" is a home match, "@" is away. Times are {{ season.match_time.slice(0, 5) }} Eastern on each match night; daylight saving
          time is handled automatically.
        </p>
      </section>
    </template>

    <UiModal v-model="confirmOpen" title="Replace the saved schedule?" description="Every match that hasn't been played yet is deleted and replaced with this preview." size="sm">
      <template #footer>
        <UiButton variant="ghost" @click="confirmOpen = false">Cancel</UiButton>
        <UiButton variant="danger" :loading="sm.busy.value" @click="save(true)">Replace schedule</UiButton>
      </template>
    </UiModal>

    <MatchEditModal
      v-model="editOpen"
      :match="editing"
      :teams="divTeams.map((t) => ({ id: t.id, name: t.name }))"
      :timezone="season.timezone"
      :busy="sm.busy.value"
      @save="saveEdit"
    />
  </div>
</template>

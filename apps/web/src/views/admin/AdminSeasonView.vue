<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import SeasonSettingsForm from '@/components/admin/SeasonSettingsForm.vue'
import TeamApprovalQueue from '@/components/admin/TeamApprovalQueue.vue'
import DivisionsPanel from '@/components/admin/DivisionsPanel.vue'
import ScheduleGenerator from '@/components/admin/ScheduleGenerator.vue'
import PlayoffGenerator from '@/components/admin/PlayoffGenerator.vue'
import { useSeasonAdmin, type SeasonPatch } from '@/composables/useSeasonAdmin'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()
const admin = useSeasonAdmin()
const { season, divisions, approved, pending, loading, busy } = admin
// Latched: later reloads (after an action, realtime) keep the content instead of re-showing the skeleton.
const ready = useReady(() => loading.value)

type Tab = 'season' | 'teams' | 'divisions' | 'schedule' | 'playoffs'
const tab = ref<Tab>('season')
const tabs = computed(() => [
  { value: 'season' as const, label: 'Season' },
  { value: 'teams' as const, label: 'Team approvals', count: pending.value.length },
  { value: 'divisions' as const, label: 'Divisions' },
  { value: 'schedule' as const, label: 'Schedule' },
  { value: 'playoffs' as const, label: 'Playoffs' },
])

async function result(p: Promise<{ ok: boolean; message?: string }>, success: string) {
  const r = await p
  if (!r.ok) toast.error(r.message ?? 'Something went wrong.')
  else toast.success(success)
}
const saveSeason = (patch: SeasonPatch) => result(admin.saveSeason(patch), 'Season saved.')
const uploadBanner = (file: File) => result(admin.uploadBanner(file), 'Banner updated.')

// New season: the owner names it; it starts as a draft with default settings to edit on the Season tab.
const newSeasonName = ref('')
async function createSeason() {
  const name = newSeasonName.value.trim()
  if (!name) return
  const r = await admin.createSeason(name)
  if (!r.ok) return toast.error(r.message)
  newSeasonName.value = ''
  tab.value = 'season'
  toast.success(`${name} created as a draft. Fill in the settings, then set Status to "Signups open".`)
}
const review = (teamId: string, approve: boolean, note: string | null) =>
  result(
    admin.updateTeam(teamId, { status: approve ? 'approved' : 'removed', review_note: note }),
    approve ? 'Team approved. Its Discord role and channel are being created.' : 'Team denied.',
  )
</script>

<template>
  <div>
    <PageHeader compact eyebrow="Admin" title="Season & schedule">
      <template v-if="season" #actions>
        <UiBadge variant="accent">{{ season.name }} · {{ season.status }}</UiBadge>
      </template>
    </PageHeader>

    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div v-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="form" :count="5" /></div>
      <UiEmptyState
        v-else-if="!season"
        title="No season yet"
        :description="
          auth.isOwner
            ? 'Name your first season. It starts as a draft only staff can see; fill in the dates and settings, then open signups.'
            : 'The league owner creates seasons. Ask them to set one up.'
        "
      >
        <form v-if="auth.isOwner" class="flex w-full max-w-md flex-col items-stretch gap-2 text-left sm:flex-row sm:items-end" @submit.prevent="createSeason">
          <div class="flex-1"><UiInput v-model="newSeasonName" label="Season name" placeholder="Season 1" autocomplete="off" /></div>
          <UiButton type="submit" :disabled="busy || !newSeasonName.trim()">Create season</UiButton>
        </form>
      </UiEmptyState>

      <form
        v-if="ready && season?.status === 'complete' && auth.isOwner"
        class="mb-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-end"
        @submit.prevent="createSeason"
      >
        <p class="text-sm text-muted sm:flex-1">{{ season.name }} is complete. Start the next one: it begins as a draft.</p>
        <UiInput v-model="newSeasonName" label="Next season name" placeholder="Season 2" autocomplete="off" />
        <UiButton type="submit" :disabled="busy || !newSeasonName.trim()">Start next season</UiButton>
      </form>

      <UiTabs v-if="ready && season" v-model="tab" label="Season admin sections" :tabs="tabs">
        <template #default="{ active }">
          <SeasonSettingsForm v-if="active === 'season'" :season="season" :readonly="!auth.isOwner" :busy="busy" @save="saveSeason" @banner="uploadBanner" />
          <TeamApprovalQueue v-else-if="active === 'teams'" :pending="pending" :busy="busy" @review="review" />
          <DivisionsPanel
            v-else-if="active === 'divisions'"
            :divisions="divisions"
            :teams="approved"
            :can-edit="auth.isOwner"
            :busy="busy"
            @add="(n) => result(admin.addDivision(n), 'Division added.')"
            @rename="(id, n) => result(admin.renameDivision(id, n), 'Division renamed.')"
            @split="result(admin.splitDivisions(), 'Premier and Contender created.')"
            @assign="(t, d) => result(admin.updateTeam(t, { division_id: d }), 'Team placed.')"
          />
          <ScheduleGenerator v-else-if="active === 'schedule'" :season="season" :divisions="divisions" :teams="approved" :can-edit="auth.isAdmin" />
          <PlayoffGenerator v-else-if="active === 'playoffs'" :season="season" :divisions="divisions" :teams="approved" :can-edit="auth.isAdmin" />
        </template>
      </UiTabs>
    </div>
  </div>
</template>

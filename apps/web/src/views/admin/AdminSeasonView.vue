<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import SeasonSettingsForm from '@/components/admin/SeasonSettingsForm.vue'
import TeamApprovalQueue from '@/components/admin/TeamApprovalQueue.vue'
import DivisionsPanel from '@/components/admin/DivisionsPanel.vue'
import GameDataPanel from '@/components/admin/GameDataPanel.vue'
import ScheduleGenerator from '@/components/admin/ScheduleGenerator.vue'
import PlayoffGenerator from '@/components/admin/PlayoffGenerator.vue'
import { useSeasonAdmin, type SeasonPatch } from '@/composables/useSeasonAdmin'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()
const admin = useSeasonAdmin()
const { season, divisions, approved, pending, loading, busy } = admin

type Tab = 'season' | 'teams' | 'divisions' | 'game' | 'schedule' | 'playoffs'
const tab = ref<Tab>('season')
const tabs = computed(() => [
  { value: 'season' as const, label: 'Season' },
  { value: 'teams' as const, label: 'Team approvals', count: pending.value.length },
  { value: 'divisions' as const, label: 'Divisions' },
  { value: 'game' as const, label: 'Modes & maps' },
  { value: 'schedule' as const, label: 'Schedule' },
  { value: 'playoffs' as const, label: 'Playoffs' },
])

async function result(p: Promise<{ ok: boolean; message?: string }>, success: string) {
  const r = await p
  if (!r.ok) toast.error(r.message ?? 'Something went wrong.')
  else toast.success(success)
}
const saveSeason = (patch: SeasonPatch) => result(admin.saveSeason(patch), 'Season saved.')
const review = (teamId: string, approve: boolean, note: string | null) =>
  result(
    admin.updateTeam(teamId, { status: approve ? 'approved' : 'removed', review_note: note }),
    approve ? 'Team approved. Its Discord role and channel are being created.' : 'Team denied.',
  )
</script>

<template>
  <div>
    <PageHeader eyebrow="Admin" title="Season & schedule">
      <template v-if="season" #actions>
        <UiBadge variant="accent">{{ season.name }} · {{ season.status }}</UiBadge>
      </template>
    </PageHeader>

    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="8" />
      <UiEmptyState v-else-if="!season" title="No season yet" description="Create a season in the database to start." />

      <UiTabs v-else v-model="tab" label="Season admin sections" :tabs="tabs">
        <template #default="{ active }">
          <SeasonSettingsForm v-if="active === 'season'" :season="season" :readonly="!auth.isOwner" :busy="busy" @save="saveSeason" />
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
          <GameDataPanel v-else-if="active === 'game'" />
          <ScheduleGenerator v-else-if="active === 'schedule'" :season="season" :divisions="divisions" :teams="approved" :can-edit="auth.isAdmin" />
          <PlayoffGenerator v-else-if="active === 'playoffs'" :season="season" :divisions="divisions" :teams="approved" :can-edit="auth.isAdmin" />
        </template>
      </UiTabs>
    </div>
  </div>
</template>

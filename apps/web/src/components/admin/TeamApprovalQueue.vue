<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiInput from '@/components/ui/UiInput.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import type { AdminTeam } from '@/composables/useSeasonAdmin'
import { useRecusal } from '@/composables/useAdmin'

defineProps<{ pending: AdminTeam[]; busy: boolean }>()
const emit = defineEmits<{ review: [teamId: string, approve: boolean, note: string | null] }>()

/** Admins never review their own team (rule 14.3); the database refuses it too. */
const { isRecused } = useRecusal()
const denying = ref<AdminTeam | null>(null)
const open = ref(false)
const note = ref('')

function askDeny(t: AdminTeam) {
  denying.value = t
  note.value = ''
  open.value = true
}
function deny() {
  if (!denying.value) return
  emit('review', denying.value.id, false, note.value.trim() || null)
  open.value = false
}
/** Rule 3.5: a team needs 4 players before it can be approved (the database enforces it too). */
const MIN_PLAYERS = 4
const created = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <div>
    <UiEmptyState v-if="pending.length === 0" title="No teams waiting" description="New teams show up here. Admins are pinged in #admin-only once a team has 4 players." />
    <ul v-else class="flex flex-col gap-3">
      <li v-for="t in pending" :key="t.id" class="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
        <TeamLogo :tag="t.tag" :name="t.name" decorative />
        <div class="min-w-0 flex-1">
          <RouterLink :to="`/teams/${t.id}`" class="font-medium hover:text-accent">{{ t.name }}</RouterLink>
          <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <UiBadge variant="outline">{{ t.tag }}</UiBadge>
            Captain {{ t.captainName }} · <span class="tnum">{{ t.rosterSize }}</span> {{ t.rosterSize === 1 ? 'player' : 'players' }} · registered {{ created(t.createdAt) }}
            <UiBadge :variant="t.rosterSize >= MIN_PLAYERS ? 'win' : 'neutral'">
              {{ t.rosterSize >= MIN_PLAYERS ? 'Ready to review' : `Building roster (${t.rosterSize}/${MIN_PLAYERS})` }}
            </UiBadge>
          </p>
        </div>
        <RecusedNotice v-if="isRecused(t.id)" />
        <div v-else class="flex gap-2">
          <UiButton size="sm" variant="danger" :disabled="busy" @click="askDeny(t)">Deny<span class="sr-only"> {{ t.name }}</span></UiButton>
          <UiButton
            size="sm"
            :disabled="busy || t.rosterSize < MIN_PLAYERS"
            :title="t.rosterSize < MIN_PLAYERS ? `Needs ${MIN_PLAYERS} players to be approved` : undefined"
            @click="emit('review', t.id, true, null)"
          >
            Approve<span class="sr-only"> {{ t.name }}</span>
          </UiButton>
        </div>
      </li>
    </ul>

    <UiModal v-model="open" :title="`Deny ${denying?.name ?? 'team'}?`" description="The team is removed from the season. The note is shown to the captain." size="sm">
      <UiInput v-model="note" label="Note to the captain" placeholder="Reason (optional)" />
      <template #footer>
        <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
        <UiButton variant="danger" :loading="busy" @click="deny">Deny team</UiButton>
      </template>
    </UiModal>
  </div>
</template>

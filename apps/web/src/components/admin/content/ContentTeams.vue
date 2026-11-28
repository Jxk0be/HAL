<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPageSkeleton from '@/components/ui/UiPageSkeleton.vue'
import { useReady } from '@/composables/useReady'
import { useContentTeams, useRecusal, type ContentTeam } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ seasonId: string }>()
const toast = useToast()
const c = useContentTeams(() => props.seasonId)
const { teams, divisions, loading, busy } = c
// Latched: later reloads (after an action, realtime) keep the content instead of re-showing the skeleton.
const ready = useReady(() => loading.value)
const { isRecused } = useRecusal()

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? teams.value.filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)) : teams.value
})

async function apply(t: ContentTeam, patch: Parameters<typeof c.update>[1], success: string) {
  const r = await c.update(t.id, patch)
  if (r.ok) toast.success(success)
  else toast.error(r.message)
}

const editOpen = ref(false)
const editing = ref<ContentTeam | null>(null)
const form = reactive({ name: '', tag: '' })
function edit(t: ContentTeam) {
  editing.value = t
  form.name = t.name
  form.tag = t.tag
  editOpen.value = true
}
async function saveEdit() {
  const t = editing.value
  if (!t) return
  const r = await c.update(t.id, { name: form.name.trim(), tag: form.tag.trim() })
  if (r.ok) {
    toast.success('Team saved. Its Discord role and channel are renamed to match.')
    editOpen.value = false
  } else toast.error(r.message)
}

// Delete: every player becomes a free agent; teams with matches are kept as "removed".
const deleteOpen = ref(false)
const deleting = ref<ContentTeam | null>(null)
function askDelete(t: ContentTeam) {
  deleting.value = t
  deleteOpen.value = true
}
async function confirmDelete() {
  const t = deleting.value
  if (!t) return
  const r = await c.deleteTeam(t.id)
  if (!r.ok) return toast.error(r.message)
  deleteOpen.value = false
  const players = r.value.released === 1 ? '1 player is' : `${r.value.released} players are`
  toast.success(
    r.value.deleted
      ? `${t.name} deleted. ${players} now free agents.`
      : `${t.name} has matches, so it's kept as removed for the record. ${players} now free agents.`,
  )
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="max-w-sm"><UiInput v-model="search" label="Search teams" placeholder="Name or tag" /></div>
    <PublicLogNotice />
    <div v-if="!ready" role="status" aria-busy="true"><span class="sr-only">Loading…</span><UiPageSkeleton variant="table" :count="6" /></div>
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-if="!filtered.length" class="px-4 py-3 text-sm text-muted">No teams.</li>
      <li v-for="t in filtered" :key="t.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm" :class="isRecused(t.id) ? 'opacity-70' : ''">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/teams/${t.id}`" class="font-medium hover:text-accent">{{ t.name }} [{{ t.tag }}]</RouterLink>
          <span class="block text-xs text-muted">{{ t.rosterSize }} {{ t.rosterSize === 1 ? 'player' : 'players' }} · {{ t.forfeits }} {{ t.forfeits === 1 ? 'forfeit' : 'forfeits' }}</span>
        </span>
        <UiBadge :variant="t.status === 'approved' ? 'win' : t.status === 'removed' ? 'loss' : 'accent'">{{ t.status }}</UiBadge>
        <RecusedNotice v-if="isRecused(t.id)" />
        <span v-else class="flex flex-wrap items-center gap-1.5">
          <select
            :value="t.divisionId ?? ''"
            class="h-8 rounded-md border border-line-strong bg-surface-2 px-2 text-xs"
            :aria-label="`Division for ${t.name}`"
            :disabled="busy"
            @change="apply(t, { division_id: ($event.target as HTMLSelectElement).value || null }, 'Division updated.')"
          >
            <option value="">No division</option>
            <option v-for="d in divisions" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
          <UiButton size="sm" variant="ghost" @click="edit(t)">Edit</UiButton>
          <UiButton v-if="t.status === 'removed' && t.rosterSize > 0" size="sm" variant="secondary" :disabled="busy" @click="apply(t, { status: 'approved' }, `${t.name} restored.`)">Restore</UiButton>
          <UiButton v-if="t.status !== 'removed' || t.rosterSize > 0" size="sm" variant="danger" :disabled="busy" @click="askDelete(t)">Delete</UiButton>
        </span>
      </li>
    </ul>

    <UiModal v-model="editOpen" :title="editing ? `Edit ${editing.name}` : 'Edit team'">
      <form class="flex flex-col gap-4" @submit.prevent="saveEdit">
        <UiInput v-model="form.name" label="Name" required />
        <UiInput v-model="form.tag" label="Tag" hint="2–5 letters or numbers, capitals kept as typed" required />
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="editOpen = false">Cancel</UiButton>
          <UiButton type="submit" :loading="busy">Save</UiButton>
        </div>
      </form>
    </UiModal>

    <UiModal v-model="deleteOpen" :title="deleting ? `Delete ${deleting.name}?` : 'Delete team?'">
      <div v-if="deleting" class="flex flex-col gap-4 text-sm">
        <p>
          All {{ deleting.rosterSize }} {{ deleting.rosterSize === 1 ? 'player' : 'players' }} on {{ deleting.name }}, captain included,
          leave the team and become free agents. Its Discord role and channel are deleted.
        </p>
        <p class="text-muted">
          If the team already has matches, it stays on record as removed so opponents' results and standings don't change.
          Otherwise it's deleted completely. This can't be undone.
        </p>
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="deleteOpen = false">Cancel</UiButton>
          <UiButton variant="danger" :loading="busy" @click="confirmDelete">Delete team</UiButton>
        </div>
      </div>
    </UiModal>
  </div>
</template>

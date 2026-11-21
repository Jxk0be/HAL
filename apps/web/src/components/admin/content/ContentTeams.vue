<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useContentTeams, useRecusal, type ContentTeam } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ seasonId: string }>()
const toast = useToast()
const c = useContentTeams(() => props.seasonId)
const { teams, divisions, loading, busy } = c
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
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="max-w-sm"><UiInput v-model="search" label="Search teams" placeholder="Name or tag" /></div>
    <PublicLogNotice />
    <UiSkeleton v-if="loading" :lines="6" />
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-if="!filtered.length" class="px-4 py-3 text-sm text-muted">No teams.</li>
      <li v-for="t in filtered" :key="t.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm" :class="isRecused(t.id) ? 'opacity-70' : ''">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/teams/${t.id}`" class="font-medium hover:text-gold">{{ t.name }} [{{ t.tag }}]</RouterLink>
          <span class="block text-xs text-muted">{{ t.rosterSize }} players · {{ t.forfeits }} forfeits</span>
        </span>
        <UiBadge :variant="t.status === 'approved' ? 'win' : t.status === 'removed' ? 'loss' : 'gold'">{{ t.status }}</UiBadge>
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
          <UiButton v-if="t.status !== 'removed'" size="sm" variant="danger" :disabled="busy" @click="apply(t, { status: 'removed' }, `${t.name} removed. Its Discord role and channel are deleted.`)">Remove</UiButton>
          <UiButton v-else size="sm" variant="secondary" :disabled="busy" @click="apply(t, { status: 'approved' }, `${t.name} restored.`)">Restore</UiButton>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import type { AdminTeam, Division } from '@/composables/useSeasonAdmin'

const props = defineProps<{ divisions: Division[]; teams: AdminTeam[]; canEdit: boolean; busy: boolean }>()
const emit = defineEmits<{
  add: [name: string]
  rename: [id: string, name: string]
  split: []
  assign: [teamId: string, divisionId: string | null]
}>()

const newName = ref('')
const renames = ref<Record<string, string>>({})
const options = computed(() => [
  { value: '', label: 'Unassigned' },
  ...props.divisions.map((d) => ({ value: d.id, label: d.name })),
])
const needsSplit = computed(() => props.teams.length > 16)

function add() {
  if (!newName.value.trim()) return
  emit('add', newName.value)
  newName.value = ''
}
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[20rem_1fr]">
    <section aria-labelledby="div-list">
      <h3 id="div-list" class="eyebrow mb-3 text-muted">Divisions</h3>
      <p v-if="divisions.length === 0" class="mb-3 text-sm text-muted">
        No divisions. With 16 or fewer teams you don't need any: everyone plays in one table.
      </p>
      <ul class="flex flex-col gap-2">
        <li v-for="d in divisions" :key="d.id" class="flex items-end gap-2">
          <UiInput
            :model-value="renames[d.id] ?? d.name"
            :label="`Division tier ${d.tier}`"
            :disabled="!canEdit"
            @update:model-value="(v: string) => (renames[d.id] = v)"
          />
          <UiButton
            v-if="canEdit && renames[d.id] && renames[d.id] !== d.name"
            size="sm"
            variant="secondary"
            :disabled="busy"
            @click="emit('rename', d.id, renames[d.id]!)"
          >
            Rename
          </UiButton>
        </li>
      </ul>
      <form v-if="canEdit" class="mt-4 flex items-end gap-2" @submit.prevent="add">
        <UiInput v-model="newName" label="New division" placeholder="Premier" />
        <UiButton type="submit" size="sm" :disabled="busy || !newName.trim()">Add</UiButton>
      </form>
      <div v-if="canEdit && needsSplit" class="mt-6 rounded-md border border-gold-dim/40 bg-gold-soft p-4 text-sm">
        <p>{{ teams.length }} approved teams: more than 16, so the rules call for two divisions.</p>
        <UiButton size="sm" class="mt-3" :disabled="busy" @click="emit('split')">Create Premier and Contender</UiButton>
      </div>
    </section>

    <section aria-labelledby="div-teams">
      <h3 id="div-teams" class="eyebrow mb-3 text-muted">Place teams</h3>
      <UiEmptyState v-if="teams.length === 0" title="No approved teams" description="Approve teams first, then place them here." />
      <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <li v-for="t in teams" :key="t.id" class="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <TeamLogo :tag="t.tag" :name="t.name" size="sm" decorative />
          <span class="min-w-0 flex-1 truncate text-sm">{{ t.name }}</span>
          <div class="w-48">
            <UiSelect
              :model-value="t.divisionId ?? ''"
              :label="`Division for ${t.name}`"
              hide-label
              :options="options"
              :disabled="busy || divisions.length === 0"
              @update:model-value="(v: string) => emit('assign', t.id, v || null)"
            />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import type { AdminMatch } from '@/composables/useSeasonMatches'
import { toZoned, zonedToUtc } from '@/lib/time'

const props = defineProps<{
  match: AdminMatch | null
  teams: { id: string; name: string }[]
  timezone: string
  busy: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
  save: [id: string, patch: { week: number; home_team_id: string; away_team_id: string; scheduled_at: string; default_at: string }]
}>()

const form = reactive({ week: '1', home: '', away: '', date: '', time: '21:00', moveDefault: true })
watch(
  () => props.match,
  (m) => {
    if (!m) return
    const z = toZoned(m.scheduledAt, props.timezone)
    form.week = String(m.week)
    form.home = m.homeTeamId
    form.away = m.awayTeamId
    form.date = z.date
    form.time = z.time
    form.moveDefault = true
  },
  { immediate: true },
)
const options = computed(() => props.teams.map((t) => ({ value: t.id, label: t.name })))
const invalid = computed(() => !form.home || !form.away || form.home === form.away || !form.date)

function save() {
  if (!props.match || invalid.value) return
  const at = zonedToUtc(form.date, form.time, props.timezone).toISOString()
  emit('save', props.match.id, {
    week: Number(form.week),
    home_team_id: form.home,
    away_team_id: form.away,
    scheduled_at: at,
    default_at: form.moveDefault ? at : props.match.defaultAt,
  })
}
</script>

<template>
  <UiModal v-model="open" title="Edit match" description="Changes are recorded in the public audit log.">
    <div class="grid gap-4 sm:grid-cols-2">
      <UiSelect v-model="form.home" label="Home" :options="options" />
      <UiSelect v-model="form.away" label="Away" :options="options" :error="form.home && form.home === form.away ? 'Pick two different teams.' : undefined" />
      <UiInput v-model="form.date" type="date" label="Date (ET)" />
      <UiInput v-model="form.time" type="time" label="Time (ET)" />
      <UiInput v-model="form.week" type="number" label="Week" />
      <label class="flex items-center gap-2 self-end pb-2 text-sm">
        <input v-model="form.moveDefault" type="checkbox" class="size-4 accent-[var(--color-accent)]" />
        Also move the default time
      </label>
    </div>
    <p class="mt-3 text-xs text-muted">
      The default time is what reschedule rules measure from. Leave it unticked to record an agreed
      reschedule.
    </p>
    <template #footer>
      <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
      <UiButton :loading="busy" :disabled="invalid" @click="save">Save match</UiButton>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { reactive, useId, watch } from 'vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { FREE_AGENT_ROLES } from '@/lib/players'
import type { PostInput } from '@/composables/useFreeAgentPost'

const props = defineProps<{
  initial: PostInput | null
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ submit: [value: PostInput]; cancel: [] }>()

const form = reactive({ role: '' as string, availability: '', note: '' })
watch(
  () => props.initial,
  (v) => {
    form.role = v?.preferred_role ?? ''
    form.availability = v?.availability ?? ''
    form.note = v?.note ?? ''
  },
  { immediate: true },
)

const noteId = useId()
const roleOptions = FREE_AGENT_ROLES.map((r) => ({ value: r, label: r === 'Flex' ? 'Flex (AR or SMG)' : r }))

function submit() {
  emit('submit', {
    preferred_role: form.role || null,
    availability: form.availability || null,
    note: form.note || null,
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <UiSelect v-model="form.role" label="Preferred role" placeholder="Any role" :options="roleOptions" />
    <UiInput
      v-model="form.availability"
      label="Availability"
      placeholder="Tue/Thu nights, weekends after 7 PM ET"
      hint="Match nights are Tuesday and Thursday at 9 PM ET."
    />
    <div class="flex flex-col gap-1.5">
      <label :for="noteId" class="eyebrow text-muted">About you</label>
      <textarea
        :id="noteId"
        v-model="form.note"
        rows="4"
        maxlength="1000"
        placeholder="Experience, past teams, what you're looking for…"
        class="w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-gold-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
      />
      <p class="tnum text-right text-xs text-muted">{{ form.note.length }}/1000</p>
    </div>
    <p v-if="error" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <UiButton variant="ghost" @click="emit('cancel')">Cancel</UiButton>
      <UiButton type="submit" :loading="busy">{{ initial ? 'Save post' : 'Post' }}</UiButton>
    </div>
  </form>
</template>

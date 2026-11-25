<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { MyProfile } from '@/stores/auth'
import { PLATFORM_OPTIONS, validateActivisionId, type Platform } from '@/lib/validation/profile'
import { useMyProfile } from '@/composables/useMyProfile'

const props = defineProps<{
  profile: MyProfile
  /** On a team: the free agent switch is locked off. */
  onTeam?: boolean
  submitLabel?: string
}>()
const emit = defineEmits<{ saved: [] }>()

const { save, saving, error } = useMyProfile()

const form = reactive({
  activisionId: '',
  platform: '' as Platform | '',
  adult: false,
  controller: false,
  freeAgent: true,
})
const touched = ref(false)

function reset(p: MyProfile) {
  form.activisionId = p.activision_id ?? ''
  form.platform = p.platform ?? ''
  form.adult = Boolean(p.age_confirmed_at)
  form.controller = Boolean(p.controller_confirmed_at)
  form.freeAgent = p.is_free_agent
}
watch(() => props.profile, reset, { immediate: true })

const errors = computed(() => ({
  activisionId: validateActivisionId(form.activisionId),
  platform: form.platform ? null : 'Choose your platform.',
  adult: form.adult ? null : 'You must be 18 or older to play in Blackhat.',
  controller: form.controller ? null : 'Blackhat is controller only on every platform.',
}))
const valid = computed(() => Object.values(errors.value).every((e) => e === null))
const show = (key: keyof typeof errors.value) => (touched.value ? (errors.value[key] ?? undefined) : undefined)

async function submit() {
  touched.value = true
  if (!valid.value || !form.platform) return
  const p = props.profile
  const now = new Date().toISOString() // the server replaces these with its own timestamp
  const ok = await save({
    activision_id: form.activisionId,
    platform: form.platform,
    is_free_agent: props.onTeam ? p.is_free_agent : form.freeAgent,
    ...(p.age_confirmed_at ? {} : { age_confirmed_at: now }),
    ...(p.controller_confirmed_at ? {} : { controller_confirmed_at: now }),
  })
  if (ok) emit('saved')
}
</script>

<template>
  <form class="flex flex-col gap-6" novalidate @submit.prevent="submit">
    <div class="grid gap-5 sm:grid-cols-2">
      <UiInput
        v-model="form.activisionId"
        label="Activision ID"
        placeholder="Name#1234567"
        autocomplete="off"
        required
        hint="Shown on your public profile and roster. Include the # and numbers."
        :error="show('activisionId')"
      />
      <UiSelect
        v-model="form.platform"
        label="Platform"
        placeholder="Choose a platform"
        :options="PLATFORM_OPTIONS"
        required
        :error="show('platform')"
      />
    </div>

    <fieldset class="flex flex-col gap-4 rounded-lg border border-line bg-surface-2/50 p-4 sm:p-5">
      <legend class="eyebrow px-1 text-accent">Eligibility</legend>
      <UiCheckbox
        v-model="form.adult"
        label="I am 18 or older"
        required
        :disabled="Boolean(profile.age_confirmed_at)"
        :description="profile.age_confirmed_at ? 'Confirmed.' : undefined"
        :error="show('adult')"
      />
      <UiCheckbox
        v-model="form.controller"
        label="I play with a controller"
        required
        :disabled="Boolean(profile.controller_confirmed_at)"
        :description="profile.controller_confirmed_at ? 'Confirmed. Blackhat is controller only on every platform.' : 'Blackhat is controller only on every platform. PC is allowed with a controller.'"
        :error="show('controller')"
      />
    </fieldset>

    <p v-if="profile.is_player === false" class="rounded-md border border-line bg-surface-2/50 px-4 py-3 text-sm text-muted">
      This is a <strong class="text-text">staff-only account</strong>: you run the league but don't play, so you're not on the
      free agent list and can't join a team. Only the owner can change this.
    </p>
    <UiCheckbox
      v-else
      v-model="form.freeAgent"
      label="List me as a free agent"
      :disabled="onTeam"
      :description="
        onTeam
          ? 'You are on a team, so you are not on the free agent list.'
          : 'Captains can find you on the Free Agents page and invite you to their team.'
      "
    />

    <p v-if="error" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">
      {{ error }}
    </p>

    <div>
      <UiButton type="submit" :loading="saving">{{ submitLabel ?? 'Save profile' }}</UiButton>
    </div>
  </form>
</template>

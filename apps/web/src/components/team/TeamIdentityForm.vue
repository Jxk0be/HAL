<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import { validateLogo, validateTag, validateTeamName } from '@/lib/teams'

/** Name, tag and logo. Used to create a team and to edit it. Emits the values; the parent saves. */
const props = defineProps<{
  initial?: { name: string; tag: string; logoUrl: string | null }
  submitLabel: string
  busy?: boolean
  serverError?: string | null
}>()
const emit = defineEmits<{ submit: [value: { name: string; tag: string; logo: File | null }] }>()

const form = reactive({ name: '', tag: '' })
const logo = ref<File | null>(null)
const preview = ref<string | null>(null)
const logoError = ref<string | null>(null)
const touched = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('file')

watch(
  () => props.initial,
  (v) => {
    form.name = v?.name ?? ''
    form.tag = v?.tag ?? ''
    preview.value = v?.logoUrl ?? null
    logo.value = null
  },
  { immediate: true },
)

const errors = computed(() => ({ name: validateTeamName(form.name), tag: validateTag(form.tag) }))

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  logoError.value = validateLogo(file)
  if (logoError.value) return
  logo.value = file
  preview.value = URL.createObjectURL(file)
}

function submit() {
  touched.value = true
  if (errors.value.name || errors.value.tag || logoError.value) return
  emit('submit', { name: form.name.trim(), tag: form.tag.trim().toUpperCase(), logo: logo.value })
}
</script>

<template>
  <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
    <div class="grid gap-5 sm:grid-cols-[1fr_8rem]">
      <UiInput
        v-model="form.name"
        label="Team name"
        placeholder="Seraphim"
        required
        :error="touched ? (errors.name ?? undefined) : undefined"
      />
      <UiInput
        v-model="form.tag"
        label="Tag"
        placeholder="SRPH"
        required
        hint="2–4 characters"
        :error="touched ? (errors.tag ?? undefined) : undefined"
      />
    </div>

    <div class="flex items-center gap-4">
      <TeamLogo :tag="form.tag || '?'" :logo-url="preview" size="lg" decorative />
      <div class="flex flex-col gap-1.5">
        <input
          id="team-logo"
          ref="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="sr-only"
          @change="onFile"
        />
        <UiButton variant="secondary" size="sm" @click="fileInput?.click()">
          {{ preview ? 'Change logo' : 'Upload logo' }}
        </UiButton>
        <p class="text-xs" :class="logoError ? 'text-loss' : 'text-muted'" aria-live="polite">
          {{ logoError ?? 'Optional. Square PNG, JPG or WebP, up to 1 MB.' }}
        </p>
      </div>
    </div>

    <p v-if="serverError" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">
      {{ serverError }}
    </p>
    <div>
      <UiButton type="submit" :loading="busy">{{ submitLabel }}</UiButton>
    </div>
  </form>
</template>

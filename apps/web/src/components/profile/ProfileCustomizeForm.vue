<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { useMyProfile } from '@/composables/useMyProfile'
import { FREE_AGENT_ROLES } from '@/lib/players'
import {
  BIO_MAX,
  handleProblem,
  normalizeHandle,
  PROFILE_COLOR_LABEL,
  PROFILE_COLORS,
  profileColorVar,
  SOCIALS,
  WEAPON_MAX,
  type SocialKey,
} from '@/lib/profileExtras'
import type { MyProfile } from '@/stores/auth'

/** My profile → Customize: what shows on the public player page besides stats. */
const props = defineProps<{ profile: MyProfile }>()
const emit = defineEmits<{ saved: [] }>()

const { save, saving } = useMyProfile()
const failed = ref<string | null>(null)
const bioId = useId()

const form = reactive({
  bio: '',
  mainRole: '' as string,
  weapon: '',
  color: '' as string,
  socials: { twitch: '', youtube: '', x: '', tiktok: '' } as Record<SocialKey, string>,
})
watch(
  () => props.profile,
  (p) => {
    form.bio = p.bio ?? ''
    form.mainRole = p.main_role ?? ''
    form.weapon = p.favorite_weapon ?? ''
    form.color = p.profile_color ?? ''
    form.socials = { twitch: p.twitch_handle ?? '', youtube: p.youtube_handle ?? '', x: p.x_handle ?? '', tiktok: p.tiktok_handle ?? '' }
  },
  { immediate: true },
)

const handles = computed(() =>
  Object.fromEntries(SOCIALS.map((s) => [s.key, normalizeHandle(form.socials[s.key])])) as Record<SocialKey, string>,
)
const problems = computed(() =>
  Object.fromEntries(SOCIALS.map((s) => [s.key, handleProblem(s.key, handles.value[s.key])])) as Record<SocialKey, string | null>,
)
const invalid = computed(() => form.bio.length > BIO_MAX || form.weapon.length > WEAPON_MAX || Object.values(problems.value).some(Boolean))
const roleOptions = FREE_AGENT_ROLES.map((r) => ({ value: r, label: r === 'Flex' ? 'Flex (AR or SMG)' : r }))

async function submit() {
  failed.value = null
  if (invalid.value) return
  const ok = await save({
    bio: form.bio.trim() || null,
    main_role: form.mainRole || null,
    favorite_weapon: form.weapon.trim() || null,
    profile_color: form.color || null,
    twitch_handle: handles.value.twitch || null,
    youtube_handle: handles.value.youtube || null,
    x_handle: handles.value.x || null,
    tiktok_handle: handles.value.tiktok || null,
  })
  if (!ok) {
    failed.value = "Couldn't save. Check the handles and try again."
    return
  }
  emit('saved')
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="submit">
    <div class="flex flex-col gap-1.5">
      <label :for="bioId" class="eyebrow text-muted">Bio</label>
      <textarea
        :id="bioId"
        v-model="form.bio"
        rows="3"
        :maxlength="BIO_MAX"
        placeholder="Who you are, how you play, past teams…"
        class="w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
      />
      <p class="tnum text-right text-xs text-muted">{{ form.bio.length }}/{{ BIO_MAX }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UiSelect v-model="form.mainRole" label="Main role" placeholder="Not set" :options="roleOptions" />
      <UiInput
        v-model="form.weapon"
        label="Favourite weapon"
        placeholder="e.g. your go-to SMG"
        :error="form.weapon.length > WEAPON_MAX ? `Keep it under ${WEAPON_MAX} characters.` : undefined"
      />
    </div>

    <fieldset>
      <legend class="eyebrow mb-2 text-muted">Profile colour</legend>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="c in PROFILE_COLORS"
          :key="c"
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          :class="form.color === c ? 'border-accent' : 'border-line'"
        >
          <input v-model="form.color" type="radio" name="profile-color" :value="c" class="sr-only" />
          <span class="size-3.5 rounded-full" :style="{ background: profileColorVar(c) }" aria-hidden="true" />
          {{ PROFILE_COLOR_LABEL[c] }}
        </label>
        <label
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          :class="!form.color ? 'border-accent bg-accent-soft' : 'border-line'"
        >
          <input v-model="form.color" type="radio" name="profile-color" value="" class="sr-only" />
          Default
        </label>
      </div>
    </fieldset>

    <fieldset class="grid gap-4 sm:grid-cols-2">
      <legend class="eyebrow mb-2 text-muted">Socials</legend>
      <UiInput
        v-for="s in SOCIALS"
        :key="s.key"
        v-model="form.socials[s.key]"
        :label="s.label"
        :placeholder="s.key === 'twitch' ? 'Handle or link' : '@handle or link'"
        :error="problems[s.key] ?? undefined"
        autocomplete="off"
      />
    </fieldset>

    <p v-if="failed" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">{{ failed }}</p>
    <div class="flex justify-end">
      <UiButton type="submit" :loading="saving" :disabled="invalid">Save</UiButton>
    </div>
  </form>
</template>

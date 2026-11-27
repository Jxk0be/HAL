<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import { useTeamRecruitPost } from '@/composables/useRecruiting'
import { useTeamInvites } from '@/composables/useInvites'
import { useTeamActions } from '@/composables/useTeamActions'
import { useToast } from '@/composables/useToast'
import { FREE_AGENT_ROLES } from '@/lib/players'
import {
  canLookFor,
  LOOKING_FOR,
  LOOKING_FOR_LABEL,
  lookingForOptions,
  RECRUIT_AVAILABILITY_MAX,
  RECRUIT_NOTE_MAX,
  spotsSummary,
  type LookingFor,
} from '@/lib/recruiting'

/** My team → Looking for players: one post per team, on the Teams recruiting page and in #teams-recruiting. */
const props = defineProps<{ teamId: string; locked: boolean }>()
const emit = defineEmits<{ invited: [] }>()

const toast = useToast()
const recruit = useTeamRecruitPost(() => props.teamId)
const { post, interested, spots, saving } = recruit
const sent = useTeamInvites(() => props.teamId)
const invitedIds = computed(() => new Set(sent.invites.value.map((i) => i.player.id)))
const actions = useTeamActions()

const editing = ref(false)
const error = ref<string | null>(null)
const noteId = useId()
const form = reactive({ lookingFor: 'any' as LookingFor | '', roles: [] as string[], availability: '', note: '' })

function fillForm() {
  const p = post.value
  form.lookingFor = p?.lookingFor ?? LOOKING_FOR.find((k) => k !== 'any' && canLookFor(k, spots.value)) ?? 'any'
  form.roles = [...(p?.roles ?? [])]
  form.availability = p?.availability ?? ''
  form.note = p?.note ?? ''
}
watch([post, spots], () => {
  if (!editing.value) fillForm()
})

const options = computed(() => lookingForOptions(spots.value))
const rolesLabel = (roles: string[]) => (roles.length ? roles.join(', ') : 'Any')
const canPost = computed(() => !props.locked && spots.value.open > 0)
const showForm = computed(() => editing.value || (!post.value && canPost.value))

async function submit() {
  error.value = null
  if (!form.lookingFor) {
    error.value = 'Pick what you are looking for.'
    return
  }
  const r = await recruit.save(props.teamId, {
    lookingFor: form.lookingFor,
    roles: form.roles,
    availability: form.availability.trim() || null,
    note: form.note.trim() || null,
  })
  if (!r.ok) {
    error.value = r.message
    return
  }
  const wasEdit = Boolean(editing.value)
  editing.value = false
  toast.success(wasEdit ? 'Post updated, here and in #teams-recruiting.' : 'Your post is up. The bot adds it to #teams-recruiting within a few minutes.')
}

function startEdit() {
  fillForm()
  error.value = null
  editing.value = true
}

async function takeDown() {
  const r = await recruit.remove()
  if (!r.ok) return toast.error(r.message)
  editing.value = false
  toast.show('Your recruiting post is down, here and in #teams-recruiting.')
}

async function invite(playerId: string, name: string) {
  const kind = post.value?.lookingFor
  const role = kind === 'starter' || kind === 'sub' ? kind : undefined
  const r = await actions.invite(props.teamId, playerId, role)
  if (!r.ok) return toast.error(r.message)
  toast.success(`Invite sent to ${name}.`)
  await sent.reload()
  emit('invited')
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
defineExpose({ reload: recruit.reload })
</script>

<template>
  <UiCard eyebrow="Recruit" title="Looking for players">
    <template v-if="post && !editing" #actions>
      <UiBadge variant="accent">Live</UiBadge>
    </template>

    <p v-if="recruit.loading.value" class="text-sm text-muted">Loading…</p>

    <template v-else>
      <p class="mb-4 text-sm text-muted">
        Posts go on the <RouterLink to="/teams-recruiting" class="text-accent hover:text-accent-strong">Teams recruiting</RouterLink>
        page and in #teams-recruiting. Players press <strong class="text-text">I'm interested</strong> and your team channel
        gets a ping. It comes down by itself once the spot is filled.
      </p>

      <!-- Current post -->
      <div v-if="post && !editing" class="flex flex-col gap-3">
        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt class="eyebrow text-muted">Looking for</dt>
            <dd class="mt-0.5">{{ LOOKING_FOR_LABEL[post.lookingFor] }}</dd>
          </div>
          <div>
            <dt class="eyebrow text-muted">{{ post.roles.length > 1 ? 'Roles' : 'Role' }}</dt>
            <dd class="mt-0.5">{{ rolesLabel(post.roles) }}</dd>
          </div>
          <div v-if="post.availability" class="col-span-2">
            <dt class="eyebrow text-muted">When you play</dt>
            <dd class="mt-0.5">{{ post.availability }}</dd>
          </div>
          <div v-if="post.note" class="col-span-2">
            <dt class="sr-only">About the team</dt>
            <dd class="whitespace-pre-line text-muted">{{ post.note }}</dd>
          </div>
        </dl>
        <p class="text-xs text-muted">{{ spotsSummary(spots) }} · updated {{ when(post.updatedAt) }}</p>
        <div class="flex flex-wrap gap-2">
          <UiButton size="sm" variant="secondary" @click="startEdit">Edit</UiButton>
          <UiButton size="sm" variant="ghost" :loading="saving" @click="takeDown">Take down</UiButton>
        </div>

        <section class="mt-2 border-t border-line pt-4" aria-labelledby="recruit-interested">
          <h3 id="recruit-interested" class="eyebrow text-muted">Interested players ({{ interested.length }})</h3>
          <p v-if="interested.length === 0" class="mt-2 text-sm text-faint">Nobody yet.</p>
          <ul v-else class="mt-2 flex flex-col gap-2">
            <li v-for="p in interested" :key="p.id" class="flex items-center gap-3">
              <UiAvatar :src="p.avatarUrl" :name="p.name" size="sm" decorative />
              <div class="min-w-0 flex-1">
                <RouterLink :to="`/players/${p.id}`" class="block truncate text-sm font-medium hover:text-accent">{{ p.name }}</RouterLink>
                <p class="truncate text-xs text-muted">{{ p.activisionId }} · {{ when(p.at) }}</p>
              </div>
              <UiBadge v-if="invitedIds.has(p.id)" variant="accent">Invited</UiBadge>
              <UiButton v-else-if="spots.open > 0 && !locked" size="sm" :disabled="actions.busy.value" @click="invite(p.id, p.name)">
                Invite<span class="sr-only"> {{ p.name }}</span>
              </UiButton>
            </li>
          </ul>
        </section>
      </div>

      <!-- Form -->
      <form v-else-if="showForm" class="flex flex-col gap-4" @submit.prevent="submit">
        <UiSelect v-model="form.lookingFor" label="Looking for" :options="options" required :hint="spotsSummary(spots)" />
        <fieldset class="flex flex-col gap-1.5">
          <legend class="eyebrow text-muted">Roles</legend>
          <div class="flex flex-wrap gap-4 pt-1">
            <label v-for="r in FREE_AGENT_ROLES" :key="r" class="flex cursor-pointer items-center gap-2 text-sm">
              <input v-model="form.roles" type="checkbox" :value="r" class="size-4 accent-[var(--color-accent)]" />
              {{ r === 'Flex' ? 'Flex (AR or SMG)' : r }}
            </label>
          </div>
          <p class="text-xs text-muted">Tick every role you'd take. None ticked means any role.</p>
        </fieldset>
        <UiInput
          v-model="form.availability"
          label="When you play"
          placeholder="Scrims Mon/Wed, match nights Tue/Thu 9 PM ET"
          :error="form.availability.length > RECRUIT_AVAILABILITY_MAX ? `Keep it under ${RECRUIT_AVAILABILITY_MAX} characters.` : undefined"
        />
        <div class="flex flex-col gap-1.5">
          <label :for="noteId" class="eyebrow text-muted">About the spot</label>
          <textarea
            :id="noteId"
            v-model="form.note"
            rows="4"
            :maxlength="RECRUIT_NOTE_MAX"
            placeholder="What you need, the level you play at, what you expect from a player…"
            class="w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
          />
          <p class="tnum text-right text-xs text-muted">{{ form.note.length }}/{{ RECRUIT_NOTE_MAX }}</p>
        </div>
        <p v-if="error" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <UiButton v-if="editing" variant="ghost" @click="editing = false">Cancel</UiButton>
          <UiButton type="submit" :loading="saving">{{ editing ? 'Save post' : 'Post' }}</UiButton>
        </div>
      </form>

      <p v-else class="text-sm text-muted">
        {{ locked ? 'Rosters are locked, so recruiting posts are closed.' : 'Your roster is full. Free up a spot to post.' }}
      </p>
    </template>
  </UiCard>
</template>

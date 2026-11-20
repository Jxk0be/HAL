<script setup lang="ts">
import { computed, ref } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import PlatformBadge from '@/components/ui/PlatformBadge.vue'
import { useFreeAgentSearch } from '@/composables/useFreeAgentSearch'
import { useTeamInvites } from '@/composables/useInvites'
import { useTeamActions } from '@/composables/useTeamActions'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  teamId: string
  openSpots: number
  locked: boolean
}>()

const query = ref('')
const { results, loading } = useFreeAgentSearch(query)
const { invites, reload } = useTeamInvites(() => props.teamId)
const actions = useTeamActions()
const toast = useToast()
const pendingIds = computed(() => new Set(invites.value.map((i) => i.player.id)))
const canInvite = computed(() => props.openSpots > 0 && !props.locked)

async function invite(id: string, name: string) {
  const result = await actions.invite(props.teamId, id)
  if (!result.ok) return toast.error(result.message)
  toast.success(`Invite sent to ${name}. They have 7 days to accept.`)
  await reload()
}

async function cancel(id: string, name: string) {
  const result = await actions.cancelInvite(id)
  if (!result.ok) return toast.error(result.message)
  toast.show(`Invite to ${name} cancelled.`)
  await reload()
}

const expires = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <UiInput
        v-model="query"
        label="Find a free agent"
        placeholder="Discord name or Activision ID"
        autocomplete="off"
        :disabled="!canInvite"
        :hint="
          locked ? 'Rosters are locked for this season.'
          : openSpots === 0 ? 'Your roster is full. Remove a player to invite someone new.'
          : `${openSpots} open ${openSpots === 1 ? 'spot' : 'spots'}. Invited players join when they accept.`
        "
      >
        <template #prefix>
          <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.5" />
            <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </template>
      </UiInput>

      <div v-if="query.trim().length >= 2" class="mt-3" aria-live="polite">
        <p v-if="loading" class="text-sm text-muted">Searching…</p>
        <p v-else-if="results.length === 0" class="text-sm text-muted">No free agents match “{{ query.trim() }}”.</p>
        <ul v-else class="divide-y divide-line overflow-hidden rounded-lg border border-line">
          <li v-for="r in results" :key="r.id" class="flex items-center gap-3 bg-surface-2/50 px-3 py-2.5">
            <UiAvatar :src="r.avatarUrl" :name="r.name" size="sm" decorative />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ r.name }}</p>
              <p class="flex items-center gap-2 text-xs text-muted">
                <PlatformBadge :platform="r.platform" />
                <span class="truncate">{{ r.activisionId ?? 'Profile not set up yet' }}</span>
              </p>
            </div>
            <UiBadge v-if="pendingIds.has(r.id)" variant="gold">Invited</UiBadge>
            <UiButton
              v-else
              size="sm"
              :disabled="!canInvite || actions.busy.value"
              @click="invite(r.id, r.name)"
            >
              Invite<span class="sr-only"> {{ r.name }}</span>
            </UiButton>
          </li>
        </ul>
      </div>
    </div>

    <div>
      <h3 class="eyebrow text-muted">Pending invites</h3>
      <p v-if="invites.length === 0" class="mt-2 text-sm text-muted">No pending invites.</p>
      <ul v-else class="mt-2 flex flex-col gap-2">
        <li v-for="i in invites" :key="i.id" class="flex items-center gap-3 rounded-md border border-line px-3 py-2">
          <UiAvatar :src="i.player.avatarUrl" :name="i.player.name" size="xs" decorative />
          <span class="min-w-0 flex-1 truncate text-sm">{{ i.player.name }}</span>
          <span class="text-xs text-muted">Expires {{ expires(i.expiresAt) }}</span>
          <UiButton size="sm" variant="ghost" :disabled="actions.busy.value" @click="cancel(i.id, i.player.name)">
            Cancel<span class="sr-only"> invite to {{ i.player.name }}</span>
          </UiButton>
        </li>
      </ul>
    </div>
  </div>
</template>

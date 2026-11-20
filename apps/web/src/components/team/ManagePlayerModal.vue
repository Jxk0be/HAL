<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { RosterPlayer } from '@/lib/teams'
import { useTeamActions } from '@/composables/useTeamActions'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  teamId: string
  player: RosterPlayer | null
  /** The viewer is the captain (not just the co-captain). */
  viewerIsCaptain: boolean
  startersFull: boolean
  subsFull: boolean
  /** Removing counts as a roster change right now. */
  removalCounts: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ changed: [] }>()

const actions = useTeamActions()
const toast = useToast()
const confirming = ref<'remove' | 'captain' | null>(null)
watch(open, (v) => !v && (confirming.value = null))

const p = computed(() => props.player)
const canRemove = computed(() => p.value && !p.value.isCaptain)

async function act(fn: () => Promise<{ ok: boolean; message?: string }>, success: string) {
  const result = await fn()
  if (!result.ok) {
    toast.error(result.message ?? 'Something went wrong.')
    return
  }
  toast.success(success)
  open.value = false
  emit('changed')
}

function toggleRole() {
  const player = p.value
  if (!player) return
  const role = player.role === 'starter' ? 'sub' : 'starter'
  void act(() => actions.setRole(player.memberId, role), `${player.name} is now a ${role}.`)
}
function toggleCoCaptain() {
  const player = p.value
  if (!player) return
  void act(
    () => actions.setCoCaptain(props.teamId, player.isCoCaptain ? null : player.userId),
    player.isCoCaptain ? `${player.name} is no longer co-captain.` : `${player.name} is now co-captain.`,
  )
}
function transfer() {
  const player = p.value
  if (!player) return
  void act(() => actions.transferCaptaincy(props.teamId, player.userId), `${player.name} is now the captain.`)
}
function remove() {
  const player = p.value
  if (!player) return
  void act(() => actions.removePlayer(props.teamId, player.userId), `${player.name} was removed from the roster.`)
}
</script>

<template>
  <UiModal v-model="open" :title="p ? `Manage ${p.name}` : 'Manage player'" size="sm">
    <div v-if="p && !confirming" class="flex flex-col gap-2">
      <UiButton
        variant="secondary"
        block
        :disabled="actions.busy.value || (p.role === 'sub' ? startersFull : subsFull)"
        @click="toggleRole"
      >
        {{ p.role === 'sub' ? 'Make starter' : 'Move to subs' }}
      </UiButton>
      <p v-if="p.role === 'sub' && startersFull" class="text-xs text-muted">All 4 starter spots are taken.</p>
      <p v-if="p.role === 'starter' && subsFull" class="text-xs text-muted">All sub spots are taken.</p>

      <template v-if="viewerIsCaptain && !p.isCaptain">
        <UiButton variant="secondary" block :disabled="actions.busy.value" @click="toggleCoCaptain">
          {{ p.isCoCaptain ? 'Remove as co-captain' : 'Make co-captain' }}
        </UiButton>
        <UiButton variant="secondary" block :disabled="actions.busy.value" @click="confirming = 'captain'">
          Make captain
        </UiButton>
      </template>

      <UiButton v-if="canRemove" variant="danger" block :disabled="actions.busy.value" @click="confirming = 'remove'">
        Remove from roster
      </UiButton>
    </div>

    <div v-else-if="p && confirming === 'remove'">
      <p class="text-sm text-muted">
        Remove <strong class="text-text">{{ p.name }}</strong> from the roster? They go back on the
        free agent list.
        <template v-if="removalCounts"> This uses one of your season's roster changes.</template>
        A dropped player can't join another team in your division for 7 days.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <UiButton variant="ghost" @click="confirming = null">Back</UiButton>
        <UiButton variant="danger" :loading="actions.busy.value" @click="remove">Remove player</UiButton>
      </div>
    </div>

    <div v-else-if="p && confirming === 'captain'">
      <p class="text-sm text-muted">
        Make <strong class="text-text">{{ p.name }}</strong> the captain? You stay on the roster but
        lose captain controls. Only the new captain can give them back.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <UiButton variant="ghost" @click="confirming = null">Back</UiButton>
        <UiButton :loading="actions.busy.value" @click="transfer">Transfer captaincy</UiButton>
      </div>
    </div>
  </UiModal>
</template>

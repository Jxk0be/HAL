<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import LeagueTime from './LeagueTime.vue'
import { useCheckin } from '@/composables/useMatchActions'
import { useToast } from '@/composables/useToast'

/**
 * Check-in for the two teams and staff. Captains check in 4 eligible players from 15 minutes
 * before the match to 30 minutes after (the same as the Discord button).
 */
const props = defineProps<{
  match: { id: string; scheduledAt: string; status: string; home: { id: string; name: string }; away: { id: string; name: string } }
  checkins: { teamId: string; at: string; names: string[]; source: string }[]
  /** The viewer's team when they captain one side, else null. */
  captainOf: string | null
}>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { players, busy, checkIn } = useCheckin(() => props.match.id, () => props.captainOf)

const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 30_000)
onUnmounted(() => clearInterval(clock))

const start = computed(() => new Date(props.match.scheduledAt).getTime())
const opensAt = computed(() => new Date(start.value - 15 * 60_000).toISOString())
const open = computed(() => ['scheduled', 'checkin_open'].includes(props.match.status) && now.value >= start.value - 15 * 60_000 && now.value <= start.value + 30 * 60_000)
const mine = computed(() => props.checkins.find((c) => c.teamId === props.captainOf) ?? null)
const teamName = (id: string) => (id === props.match.home.id ? props.match.home.name : props.match.away.name)

const picked = ref<string[]>([])
const editing = ref(false)
function toggle(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : picked.value.length < 4 ? [...picked.value, id] : picked.value
}
async function submit() {
  const r = await checkIn(picked.value)
  if (!r.ok) {
    toast.error(r.message)
    return
  }
  toast.success(`Checked in: ${r.value.players.join(', ')}`)
  editing.value = false
  picked.value = []
  emit('changed')
}
const showForm = computed(() => props.captainOf && open.value && (!mine.value || editing.value))
</script>

<template>
  <UiCard v-if="checkins.length || captainOf" eyebrow="Teams and staff only" title="Check-in">
    <div class="flex flex-col gap-4 text-sm">
      <ul v-if="checkins.length" class="flex flex-col gap-2">
        <li v-for="c in checkins" :key="c.teamId">
          <strong>{{ teamName(c.teamId) }}</strong> checked in <LeagueTime :iso="c.at" />
          <span class="text-xs text-muted"> ({{ c.source === 'discord' ? 'Discord' : 'site' }})</span>
          <span class="block text-muted">{{ c.names.join(', ') }}</span>
        </li>
      </ul>

      <template v-if="captainOf">
        <p v-if="!open && !mine" class="text-muted">
          Check-in opens <LeagueTime :iso="opensAt" /> (15 minutes before the match). You can also check in from your team's Discord channel.
        </p>
        <UiButton v-else-if="open && mine && !editing" size="sm" variant="ghost" class="self-start" @click="editing = true">Change line-up</UiButton>

        <form v-if="showForm" class="flex flex-col gap-3" @submit.prevent="submit">
          <fieldset>
            <legend class="font-medium">Pick your 4 players <span class="font-normal text-muted">({{ picked.length }}/4)</span></legend>
            <p v-if="players.length < 4" class="mt-1 text-loss">
              Only {{ players.length }} eligible players. Players must be on the roster 24 hours before the match; request an emergency sub below.
            </p>
            <ul class="mt-2 grid gap-2 sm:grid-cols-2">
              <li v-for="p in players" :key="p.userId">
                <label class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2" :class="picked.includes(p.userId) ? 'border-accent bg-accent-soft' : 'border-line-strong'">
                  <input
                    type="checkbox"
                    class="size-4 accent-[var(--color-accent)]"
                    :checked="picked.includes(p.userId)"
                    :disabled="!picked.includes(p.userId) && picked.length >= 4"
                    @change="toggle(p.userId)"
                  />
                  <span>{{ p.name }}</span>
                  <span v-if="p.emergency" class="text-xs text-muted">emergency sub</span>
                </label>
              </li>
            </ul>
          </fieldset>
          <div class="flex gap-2">
            <UiButton type="submit" size="sm" :disabled="picked.length !== 4" :loading="busy">Check in</UiButton>
            <UiButton v-if="editing" size="sm" variant="ghost" @click="editing = false">Cancel</UiButton>
          </div>
        </form>
      </template>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useContentPlayers, useRecusal, type ContentPlayer } from '@/composables/useAdmin'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { zonedToUtc } from '@/lib/time'

const auth = useAuthStore()
const toast = useToast()
const c = useContentPlayers()
const { players, loading, busy } = c
const { isRecused } = useRecusal()

const query = ref('')
watchDebounced(query, (q) => void c.search(q), { debounce: 300 })
const banned = (p: ContentPlayer) => Boolean(p.bannedUntil && new Date(p.bannedUntil).getTime() > Date.now())

const open = ref(false)
const target = ref<ContentPlayer | null>(null)
const form = reactive({ until: '', reason: '', lift: false })
function openBan(p: ContentPlayer, lift: boolean) {
  target.value = p
  form.until = ''
  form.reason = ''
  form.lift = lift
  open.value = true
}
async function save() {
  const p = target.value
  if (!p) return
  // Bans end at 11:59 PM Eastern on the chosen day.
  const until = form.lift ? null : form.until ? zonedToUtc(form.until, '23:59', 'America/New_York').toISOString() : null
  if (!form.lift && !until) {
    toast.error('Choose the last day of the ban.')
    return
  }
  const r = await c.ban(p.id, until, form.reason)
  if (r.ok) {
    toast.success(form.lift ? `${p.name}'s ban is lifted.` : `${p.name} is banned.`)
    open.value = false
  } else toast.error(r.message)
}

// Incomplete stats flag (this season's leaderboard).
const flagOpen = ref(false)
const flagTarget = ref<ContentPlayer | null>(null)
const flagNote = ref('')
function openFlag(p: ContentPlayer) {
  flagTarget.value = p
  flagNote.value = p.statsFlag?.note ?? ''
  flagOpen.value = true
}
async function saveFlag() {
  const p = flagTarget.value
  if (!p) return
  if (flagNote.value.trim().length > 200) return toast.error('Keep the note to 200 characters.')
  const r = await c.flagStats(p.id, flagNote.value)
  if (!r.ok) return toast.error(r.message)
  toast.success(`${p.name} is marked "Incomplete data" on the leaderboard.`)
  flagOpen.value = false
}
async function clearFlag(p: ContentPlayer) {
  const r = await c.clearStatsFlag(p.id)
  if (r.ok) toast.success(`${p.name}'s "Incomplete data" mark is removed.`)
  else toast.error(r.message)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="max-w-sm"><UiInput v-model="query" label="Search players" placeholder="Discord name or Activision ID" hint="Empty shows banned players and players marked as having incomplete stats." /></div>
    <PublicLogNotice />
    <UiSkeleton v-if="loading" :lines="5" />
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-if="!players.length" class="px-4 py-3 text-sm text-muted">{{ query ? 'No players found.' : 'Nobody is banned or flagged.' }}</li>
      <li v-for="p in players" :key="p.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/players/${p.id}`" class="font-medium hover:text-accent">{{ p.name }}</RouterLink>
          <span class="block text-xs text-muted">{{ p.activisionId ?? 'No Activision ID' }}<template v-if="p.team"> · {{ p.team.tag }}</template></span>
        </span>
        <UiBadge v-if="banned(p)" variant="loss">Banned until <LeagueTime :iso="p.bannedUntil!" /></UiBadge>
        <UiBadge v-if="p.statsFlag" variant="accent" :title="p.statsFlag.note ?? undefined">Incomplete data</UiBadge>
        <RecusedNotice v-if="p.team && isRecused(p.team.id)" />
        <span v-else-if="p.id !== auth.profile?.id" class="flex flex-wrap gap-1.5">
          <UiButton size="sm" variant="ghost" @click="openFlag(p)">{{ p.statsFlag ? 'Edit stats note' : 'Mark stats incomplete' }}</UiButton>
          <UiButton v-if="p.statsFlag" size="sm" variant="ghost" :disabled="busy" @click="clearFlag(p)">Clear stats mark</UiButton>
          <UiButton v-if="banned(p)" size="sm" variant="secondary" @click="openBan(p, true)">Lift ban</UiButton>
          <UiButton size="sm" variant="danger" @click="openBan(p, false)">{{ banned(p) ? 'Change ban' : 'Ban' }}</UiButton>
        </span>
      </li>
    </ul>

    <UiModal v-model="open" :title="target ? (form.lift ? `Lift ${target.name}'s ban` : `Ban ${target.name}`) : 'Ban'">
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <label v-if="!form.lift" class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Banned through (Eastern)</span>
          <input v-model="form.until" type="date" class="h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Reason (rule number and what happened)</span>
          <textarea v-model="form.reason" rows="3" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <p class="text-xs text-muted">A banned player can’t join or play for a team. The reason is recorded as a public penalty.</p>
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
          <UiButton type="submit" :variant="form.lift ? 'primary' : 'danger'" :loading="busy">{{ form.lift ? 'Lift ban' : 'Ban player' }}</UiButton>
        </div>
      </form>
    </UiModal>

    <UiModal v-model="flagOpen" :title="flagTarget ? `Mark ${flagTarget.name}'s stats incomplete` : 'Mark stats incomplete'" size="sm">
      <form class="flex flex-col gap-4" @submit.prevent="saveFlag">
        <p class="text-sm text-muted">
          Shows an <span class="text-accent">Incomplete data</span> mark on their row of this season's leaderboard. Their stats stay
          listed. Use it when we couldn't get their numbers for a match.
        </p>
        <UiInput v-model="flagNote" label="Note (shown publicly when hovering the mark)" placeholder="e.g. Week 3 vs ELO: scoreboard lost" hint="Optional, up to 200 characters." />
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="flagOpen = false">Cancel</UiButton>
          <UiButton type="submit" :loading="busy">Save</UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

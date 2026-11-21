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
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="max-w-sm"><UiInput v-model="query" label="Search players" placeholder="Discord name or Activision ID" hint="Empty shows currently banned players." /></div>
    <PublicLogNotice />
    <UiSkeleton v-if="loading" :lines="5" />
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-if="!players.length" class="px-4 py-3 text-sm text-muted">{{ query ? 'No players found.' : 'Nobody is banned.' }}</li>
      <li v-for="p in players" :key="p.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/players/${p.id}`" class="font-medium hover:text-gold">{{ p.name }}</RouterLink>
          <span class="block text-xs text-muted">{{ p.activisionId ?? 'No Activision ID' }}<template v-if="p.team"> · {{ p.team.tag }}</template></span>
        </span>
        <UiBadge v-if="banned(p)" variant="loss">Banned until <LeagueTime :iso="p.bannedUntil!" /></UiBadge>
        <RecusedNotice v-if="p.team && isRecused(p.team.id)" />
        <span v-else-if="p.id !== auth.profile?.id" class="flex gap-1.5">
          <UiButton v-if="banned(p)" size="sm" variant="secondary" @click="openBan(p, true)">Lift ban</UiButton>
          <UiButton size="sm" variant="danger" @click="openBan(p, false)">{{ banned(p) ? 'Change ban' : 'Ban' }}</UiButton>
        </span>
      </li>
    </ul>

    <UiModal v-model="open" :title="target ? (form.lift ? `Lift ${target.name}'s ban` : `Ban ${target.name}`) : 'Ban'">
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <label v-if="!form.lift" class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Banned through (Eastern)</span>
          <input v-model="form.until" type="date" class="h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:outline-2 focus-visible:outline-gold" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm">
          <span class="font-medium">Reason (rule number and what happened)</span>
          <textarea v-model="form.reason" rows="3" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-gold" />
        </label>
        <p class="text-xs text-muted">A banned player can’t join or play for a team. The reason is recorded as a public penalty.</p>
        <PublicLogNotice />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
          <UiButton type="submit" :variant="form.lift ? 'primary' : 'danger'" :loading="busy">{{ form.lift ? 'Lift ban' : 'Ban player' }}</UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { broadcastActions, useCastingDesk, type CastingMatch } from '@/composables/useBroadcasts'
import { useRecusal } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { isStreamUrl } from '@/lib/broadcast'
import { toZoned } from '@/lib/time'

/**
 * Casting desk for casters and admins. The league has no stream of its own: casters stream on their own
 * channel and paste the link here. Casters can only change broadcasts; everything is logged.
 */
const auth = useAuthStore()
const toast = useToast()
const { matches, loading, reload } = useCastingDesk(7)
const { isRecused } = useRecusal()
const me = computed(() => auth.profile?.id ?? null)

const today = toZoned(new Date().toISOString()).date
const groups = computed(() => {
  const live = matches.value.filter((m) => m.live)
  const rest = matches.value.filter((m) => !m.live)
  return [
    { title: 'Live now', items: live },
    { title: 'Today', items: rest.filter((m) => toZoned(m.scheduledAt).date === today) },
    { title: 'Next 7 days', items: rest.filter((m) => toZoned(m.scheduledAt).date > today) },
  ].filter((g) => g.items.length)
})

const mine = (m: CastingMatch) => m.casterId === me.value
const takenByOther = (m: CastingMatch) => Boolean(m.casterId && !mine(m) && !auth.isAdmin)
const busy = ref<string | null>(null)

async function act(m: CastingMatch, p: Promise<{ ok: boolean; message?: string }>, success: string) {
  busy.value = m.id
  const r = await p
  busy.value = null
  if (r.ok) {
    toast.success(success)
    void reload()
  } else toast.error(r.message ?? 'Something went wrong.')
}

// Go live dialog
const dialog = ref(false)
const target = ref<CastingMatch | null>(null)
const url = ref('')
const urlError = computed(() => (url.value && !isStreamUrl(url.value) ? 'Use an https:// link to Twitch, YouTube or Kick.' : undefined))
function openLive(m: CastingMatch) {
  target.value = m
  url.value = m.url ?? ''
  dialog.value = true
}
async function goLive() {
  const m = target.value
  if (!m || !isStreamUrl(url.value)) return
  await act(m, broadcastActions.goLive(m.id, url.value), `${m.home.tag} vs ${m.away.tag} is live. The banner is up across the site.`)
  dialog.value = false
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Casters" title="Casting desk" description="Claim a match so other casters know it's covered, go live with your stream link, and end the broadcast when you're done. The link stays on the match page as the VOD." />
    <div class="flex flex-col gap-8 px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="6" />
      <UiEmptyState v-else-if="!groups.length" title="Nothing to cast this week" description="Matches for today and the next 7 days appear here." />
      <section v-for="g in groups" :key="g.title" :aria-labelledby="`cast-${g.title}`">
        <h2 :id="`cast-${g.title}`" class="eyebrow mb-3 text-accent">{{ g.title }}</h2>
        <ul class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          <li v-for="m in g.items" :key="m.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm" :class="isRecused(m.home.id, m.away.id) ? 'opacity-70' : ''">
            <span class="min-w-48 flex-1">
              <RouterLink :to="`/matches/${m.id}`" class="font-heading text-lg hover:text-accent">{{ m.home.tag }} vs {{ m.away.tag }}</RouterLink>
              <span class="block text-xs text-muted">{{ weekLabel(m.week) }} · <LeagueTime :iso="m.scheduledAt" /></span>
            </span>
            <UiBadge v-if="m.live" variant="live">Live</UiBadge>
            <span v-if="m.caster" class="text-xs text-muted">{{ mine(m) ? 'You' : m.caster }}{{ m.live ? ' casting' : ' claimed it' }}</span>

            <RecusedNotice v-if="isRecused(m.home.id, m.away.id)" />
            <span v-else-if="m.live" class="flex flex-wrap gap-2">
              <UiButton v-if="m.url" :href="m.url" size="sm" variant="ghost">Open stream</UiButton>
              <UiButton v-if="mine(m) || auth.isAdmin" size="sm" variant="secondary" @click="openLive(m)">Change link</UiButton>
              <UiButton v-if="mine(m) || auth.isAdmin" size="sm" variant="danger" :loading="busy === m.id" @click="act(m, broadcastActions.end(m.id), 'Broadcast ended. The link stays on the match page.')">End broadcast</UiButton>
            </span>
            <span v-else-if="!takenByOther(m)" class="flex flex-wrap gap-2">
              <UiButton v-if="!m.casterId" size="sm" variant="ghost" :loading="busy === m.id" @click="act(m, broadcastActions.claim(m.id, true), 'Claimed. Other casters can see it is covered.')">Claim</UiButton>
              <UiButton v-else size="sm" variant="ghost" :loading="busy === m.id" @click="act(m, broadcastActions.claim(m.id, false), 'Released.')">Release</UiButton>
              <UiButton size="sm" @click="openLive(m)">Go live</UiButton>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <UiModal v-model="dialog" :title="target ? `Go live: ${target.home.tag} vs ${target.away.tag}` : 'Go live'" description="Paste your stream link. Everyone on the site sees a Live banner with a Watch button.">
      <form class="flex flex-col gap-4" @submit.prevent="goLive">
        <UiInput v-model="url" label="Stream link" type="url" placeholder="https://twitch.tv/yourchannel" hint="Twitch, YouTube or Kick, https only." :error="urlError" autocomplete="off" required />
        <p class="text-xs text-muted">Going live is logged publicly. You can only change broadcasts, never scores.</p>
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="dialog = false">Cancel</UiButton>
          <UiButton type="submit" :disabled="!isStreamUrl(url)" :loading="busy === target?.id">{{ target?.live ? 'Update link' : 'Go live' }}</UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useAnnouncements, type AnnouncementRow } from '@/composables/useAnnouncements'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const { rows, season, channelSet, loading, error, busyKey, post, setAuto } = useAnnouncements()

// Discord markup in the preview: <t:…> timestamps become dates, **bold** stays readable.
function previewText(text: string | null): string {
  return (text ?? '')
    .replace(/<t:(\d+):[A-Za-z]>/g, (_, s: string) =>
      new Date(Number(s) * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
}

const confirming = ref<AnnouncementRow | null>(null)
const everyone = ref(false)
const open = ref(false)
function askPost(r: AnnouncementRow) {
  confirming.value = r
  everyone.value = false
  open.value = true
}
async function confirmPost() {
  const r = confirming.value
  if (!r) return
  const res = await post(r.key, everyone.value)
  open.value = false
  if (res.ok) toast.success(`"${r.label}" posted in #announcements.`)
  else toast.error(res.message)
}

async function toggle(r: AnnouncementRow) {
  const res = await setAuto(r.key, !r.auto)
  if (!res.ok) return toast.error(res.message)
  toast.success(r.auto ? `"${r.label}" will post automatically.` : `"${r.label}" won't post automatically.`)
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Announcements"
      description="Season announcements built from the season settings. Preview them, post one to #announcements now, or let the bot post it automatically a week and a day before."
    />
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="8" />
      <p v-else-if="error" class="text-sm text-loss" role="alert">{{ error }}</p>
      <UiEmptyState v-else-if="!season" title="No season running" description="Announcements use the season in signups, regular season or playoffs." />
      <template v-else>
        <p v-if="!channelSet" class="rounded-md border border-accent-dim bg-accent-soft px-4 py-3 text-sm">
          Set the <strong>#announcements</strong> channel ID on Admin → Discord before posting.
        </p>
        <article v-for="r in rows" :key="r.key" class="rounded-lg border border-line bg-surface">
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 class="font-heading text-lg">{{ r.label }}</h2>
              <p class="text-xs text-muted">
                {{ r.summary }}
                <template v-if="r.at"> · Date: <LeagueTime :iso="r.at" /></template>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UiBadge v-if="r.lastPostedAt" variant="outline">
                Last posted <LeagueTime :iso="r.lastPostedAt" />{{ r.lastPostedAuto ? ' (auto)' : '' }}
              </UiBadge>
              <label class="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-[var(--color-accent)]"
                  :checked="r.auto"
                  :disabled="busyKey === r.key"
                  @change="toggle(r)"
                />
                Automatic
              </label>
              <UiButton size="sm" :disabled="Boolean(r.unavailable) || !channelSet" :loading="busyKey === r.key" @click="askPost(r)">
                Post now<span class="sr-only">: {{ r.label }}</span>
              </UiButton>
            </div>
          </header>
          <div class="px-4 py-3">
            <p v-if="r.unavailable" class="text-sm text-muted">{{ r.unavailable }}</p>
            <template v-else>
              <p class="font-heading text-base text-accent">{{ r.title }}</p>
              <p class="mt-1 text-sm whitespace-pre-line text-muted">{{ previewText(r.description) }}</p>
            </template>
          </div>
        </article>
        <p class="text-xs text-muted">
          Automatic posts go out a week and a day before signups open, the season start, the roster lock and the playoffs (on the
          day for "Signups are open" and "Roster changes now count"), once per season each. The bot checks every 5 minutes.
        </p>
      </template>
    </div>

    <UiModal v-model="open" :title="confirming ? `Post “${confirming.label}”?` : 'Post announcement?'" size="sm">
      <p class="text-sm text-muted">It goes to #announcements as shown in the preview, with today's countdown.</p>
      <label class="mt-4 flex items-center gap-2 text-sm">
        <input v-model="everyone" type="checkbox" class="size-4 accent-[var(--color-accent)]" />
        Ping @everyone
      </label>
      <template #footer>
        <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
        <UiButton :loading="Boolean(busyKey)" @click="confirmPost">Post to Discord</UiButton>
      </template>
    </UiModal>
  </div>
</template>

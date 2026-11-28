<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useAnnouncements, type AnnouncementRow } from '@/composables/useAnnouncements'
import { useToast } from '@/composables/useToast'
import { CUSTOM_BODY_MAX, customAnnouncementProblem, parseCustomAnnouncement, previewLine } from '@/lib/announcements'

const toast = useToast()
const { rows, season, channelSet, loading, error, busyKey, post, postCustom, setAuto } = useAnnouncements()

// Custom announcement: paste text; a bold first line becomes the title.
const customId = useId()
const customText = ref('')
const customEveryone = ref(false)
const customOpen = ref(false)
const parsed = computed(() => parseCustomAnnouncement(customText.value))
const customProblem = computed(() => (customText.value.trim() ? customAnnouncementProblem(customText.value) : null))
const bodyLines = computed(() =>
  parsed.value.body.split('\n').map((l) => {
    const bullet = /^\s*[-*]\s+/.test(l)
    return { bullet, parts: previewLine(bullet ? l.replace(/^\s*[-*]\s+/, '') : l) }
  }),
)
function askCustom() {
  customEveryone.value = false
  customOpen.value = true
}
async function confirmCustom() {
  const res = await postCustom(customText.value, customEveryone.value)
  customOpen.value = false
  if (!res.ok) return toast.error(res.message)
  toast.success('Announcement posted in #announcements.')
  customText.value = ''
}

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
      compact
      eyebrow="Admin"
      title="Announcements"
      description="Season announcements built from the season settings. Preview them, post one to #announcements now, or let the bot post it automatically a week and a day before."
    />
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
      <!-- Custom announcement -->
      <article class="rounded-lg border border-line bg-surface">
        <header class="border-b border-line px-4 py-3">
          <h2 class="font-heading text-lg">Custom announcement</h2>
          <p class="text-xs text-muted">
            Paste any text and the bot posts it to #announcements in the announcement box. Make the first line bold
            (<code>**Like this**</code>) to use it as the title. Discord formatting works: <code>**bold**</code>, <code>- bullets</code>, links.
          </p>
        </header>
        <div class="grid gap-4 px-4 py-4 md:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label :for="customId" class="eyebrow text-muted">Text</label>
            <textarea
              :id="customId"
              v-model="customText"
              rows="12"
              :maxlength="CUSTOM_BODY_MAX + 300"
              placeholder="**Preseason matches are coming**&#10;&#10;Before the regular season we'll run optional preseason matches…"
              class="w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 font-mono text-sm text-text placeholder:text-faint focus:border-accent-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
              :aria-describedby="`${customId}-problem`"
            />
            <p :id="`${customId}-problem`" class="text-xs" :class="customProblem ? 'text-loss' : 'text-muted'" aria-live="polite">
              {{ customProblem ?? `${parsed.body.length}/${CUSTOM_BODY_MAX} characters` }}
            </p>
          </div>
          <div class="flex flex-col gap-1.5">
            <p class="eyebrow text-muted">Preview</p>
            <div class="min-h-40 rounded-md border-l-4 border-brand bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
              <p v-if="!customText.trim()" class="text-faint">Your announcement shows here.</p>
              <template v-else>
                <p v-if="parsed.title" class="font-heading text-base text-text">{{ parsed.title }}</p>
                <div class="mt-1 flex flex-col text-muted">
                  <p v-for="(l, i) in bodyLines" :key="i" :class="l.parts.length ? '' : 'h-3'">
                    <span v-if="l.bullet" aria-hidden="true">• </span>
                    <template v-for="(p, j) in l.parts" :key="j"><strong v-if="p.bold" class="text-text">{{ p.text }}</strong><template v-else>{{ p.text }}</template></template>
                  </p>
                </div>
                <p class="mt-3 text-xs text-faint">Blackhat Invitational League · today</p>
              </template>
            </div>
          </div>
        </div>
        <div class="flex justify-end border-t border-line px-4 py-3">
          <UiButton :disabled="!customText.trim() || !!customProblem || !channelSet" :loading="busyKey === 'custom'" @click="askCustom">
            Post to #announcements
          </UiButton>
        </div>
      </article>

      <h2 class="eyebrow mt-4 text-accent">Season announcements</h2>
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

    <UiModal v-model="customOpen" :title="parsed.title ? `Post “${parsed.title}”?` : 'Post this announcement?'" size="sm">
      <p class="text-sm text-muted">It goes to #announcements exactly as the preview shows.</p>
      <label class="mt-4 flex items-center gap-2 text-sm">
        <input v-model="customEveryone" type="checkbox" class="size-4 accent-[var(--color-accent)]" />
        Ping @everyone
      </label>
      <template #footer>
        <UiButton variant="ghost" @click="customOpen = false">Cancel</UiButton>
        <UiButton :loading="busyKey === 'custom'" @click="confirmCustom">Post to Discord</UiButton>
      </template>
    </UiModal>
  </div>
</template>

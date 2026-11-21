<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ScreenshotViewer from '@/components/admin/ScreenshotViewer.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiModal from '@/components/ui/UiModal.vue'
import LeagueTime from './LeagueTime.vue'
import { useMatchDispute } from '@/composables/useMatchActions'
import { useToast } from '@/composables/useToast'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/image'
import { DISPUTE_CATEGORIES, disputeWindow, type DisputeCategory } from '@/lib/reschedule'

/**
 * Disputes on the match page: captains of either team open one (within the 24-hour window);
 * while it is open the match shows "Under review", and captains and staff discuss it here.
 * Evidence and comments are visible to the two teams and staff only.
 */
const props = defineProps<{
  match: { id: string; scheduledAt: string; confirmedAt: string | null; status: string; home: { id: string; tag: string }; away: { id: string; tag: string } }
  /** The viewer's team in this match when they captain it, else null. */
  captainOf: string | null
  /** Staff who may comment (not on either team). */
  staff: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const d = useMatchDispute(() => props.match.id)
const { dispute, busy } = d
const tag = (teamId: string) => (teamId === props.match.home.id ? props.match.home.tag : props.match.away.tag)
const categoryLabel = (c: DisputeCategory) => DISPUTE_CATEGORIES.find((x) => x.value === c)?.label ?? c

const openWindow = computed(() => disputeWindow(props.match))
const canOpen = computed(() => {
  const now = Date.now()
  return Boolean(
    props.captainOf && props.match.status !== 'cancelled' && dispute.value?.status !== 'open'
      && now >= openWindow.value.opens.getTime() && now <= openWindow.value.closes.getTime(),
  )
})
const canComment = computed(() => dispute.value?.status === 'open' && (props.captainOf || props.staff))

// Open form
const showForm = ref(false)
const form = reactive({ category: 'score' as DisputeCategory, description: '', files: [] as File[], links: [{ url: '', note: '' }] })
function addFiles(list: FileList | null) {
  const files = Array.from(list ?? []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
  form.files = [...form.files, ...files].slice(0, 6)
}
async function submit() {
  if (!props.captainOf) return
  if (form.description.trim().length < 10) {
    toast.error('Describe what happened (at least 10 characters).')
    return
  }
  const bad = form.links.find((l) => l.url.trim() && !/^https:\/\//.test(l.url.trim()))
  if (bad) {
    toast.error('Links must start with https://')
    return
  }
  const r = await d.open({ matchId: props.match.id, teamId: props.captainOf, category: form.category, description: form.description, files: form.files, links: form.links })
  if (!r.ok) {
    toast.error(r.message)
    return
  }
  toast.success('Dispute opened. The match is under review and admins have been notified.')
  showForm.value = false
  form.description = ''
  form.files = []
  form.links = [{ url: '', note: '' }]
  emit('changed')
}

// Comments
const comment = ref('')
async function send() {
  const body = comment.value.trim()
  if (!body) return
  const r = await d.comment(body)
  if (r.ok) comment.value = ''
  else toast.error(r.message)
}

const images = computed(() =>
  (dispute.value?.evidence ?? []).filter((e) => e.signedUrl).map((e, i) => ({ url: e.signedUrl!, label: e.note ?? `Evidence ${i + 1}` })),
)
</script>

<template>
  <div>
    <UiCard v-if="dispute" eyebrow="Dispute" :title="dispute.status === 'open' ? 'Under review' : 'Resolved'">
      <div class="flex flex-col gap-4 text-sm">
        <p class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UiBadge :variant="dispute.status === 'open' ? 'loss' : 'win'">{{ categoryLabel(dispute.category) }}</UiBadge>
          Opened by {{ tag(dispute.teamId) }} <LeagueTime :iso="dispute.createdAt" />
        </p>
        <p class="whitespace-pre-line">{{ dispute.reason }}</p>
        <p v-if="dispute.resolution" class="rounded-md border border-line bg-surface-2 px-3 py-2"><strong class="text-gold">Decision:</strong> {{ dispute.resolution }}</p>

        <div v-if="dispute.evidence.length" class="flex flex-col gap-2">
          <p class="eyebrow text-muted">Evidence <span class="normal-case tracking-normal">(teams and staff only)</span></p>
          <ScreenshotViewer v-if="images.length" :images="images" label="Dispute evidence" />
          <ul class="flex flex-col gap-1">
            <li v-for="e in dispute.evidence.filter((x) => x.url)" :key="e.id">
              <a :href="e.url!" target="_blank" rel="noopener noreferrer" class="text-gold hover:text-gold-strong">{{ e.note || e.url }}</a>
            </li>
          </ul>
        </div>

        <section v-if="dispute.comments.length || canComment" aria-label="Dispute discussion" class="flex flex-col gap-2 border-t border-line pt-4">
          <p class="eyebrow text-muted">Discussion</p>
          <ol class="flex flex-col gap-2">
            <li v-for="c in dispute.comments" :key="c.id" class="rounded-md border border-line bg-surface-2 px-3 py-2">
              <p class="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span class="font-medium text-text">{{ c.author }}</span>
                <UiBadge v-if="c.staff" variant="gold">Staff</UiBadge>
                <LeagueTime :iso="c.createdAt" />
              </p>
              <p class="mt-1 whitespace-pre-line">{{ c.body }}</p>
            </li>
          </ol>
          <form v-if="canComment" class="flex flex-col gap-2" @submit.prevent="send">
            <label class="flex flex-col gap-1.5">
              <span class="sr-only">Add a comment</span>
              <textarea v-model="comment" rows="2" maxlength="2000" placeholder="Add details, timestamps or a reply…" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2 focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-gold" />
            </label>
            <UiButton type="submit" size="sm" class="self-start" :loading="busy" :disabled="!comment.trim()">Post comment</UiButton>
          </form>
        </section>
      </div>
    </UiCard>

    <div v-if="canOpen" class="mt-4 flex flex-wrap items-center gap-3">
      <UiButton variant="danger" @click="showForm = true">Open a dispute</UiButton>
      <span class="text-xs text-muted">Open until <LeagueTime :iso="openWindow.closes.toISOString()" />.</span>
    </div>

    <UiModal v-model="showForm" title="Open a dispute" description="Admins review it with both teams. The reason and decision are public; evidence stays private." size="lg">
      <form class="flex flex-col gap-4 text-sm" @submit.prevent="submit">
        <label class="flex flex-col gap-1.5">
          <span class="font-medium">What is it about?</span>
          <select v-model="form.category" class="h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:outline-2 focus-visible:outline-gold">
            <option v-for="c in DISPUTE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-medium">What happened? <span class="font-normal text-muted">(shown publicly)</span></span>
          <textarea v-model="form.description" rows="4" maxlength="4000" class="rounded-md border border-line-strong bg-surface-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-gold" />
        </label>
        <div class="flex flex-col gap-1.5">
          <span class="font-medium">Screenshots <span class="font-normal text-muted">(optional, up to 6)</span></span>
          <input type="file" multiple :accept="ACCEPTED_IMAGE_TYPES.join(',')" aria-label="Add evidence screenshots" class="text-xs file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-text" @change="addFiles(($event.target as HTMLInputElement).files)" />
          <ul v-if="form.files.length" class="text-xs text-muted">
            <li v-for="(f, i) in form.files" :key="i" class="flex items-center gap-2">
              {{ f.name }}
              <button type="button" class="text-loss hover:underline" :aria-label="`Remove ${f.name}`" @click="form.files.splice(i, 1)">Remove</button>
            </li>
          </ul>
        </div>
        <div class="flex flex-col gap-2">
          <span class="font-medium">Video or clip links <span class="font-normal text-muted">(optional, https://)</span></span>
          <div v-for="(l, i) in form.links" :key="i" class="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <input v-model="l.url" type="url" placeholder="https://youtu.be/…" :aria-label="`Link ${i + 1}`" class="h-9 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:outline-2 focus-visible:outline-gold" />
            <input v-model="l.note" placeholder="What it shows" :aria-label="`Link ${i + 1} note`" class="h-9 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:outline-2 focus-visible:outline-gold" />
          </div>
          <UiButton v-if="form.links.length < 4" size="sm" variant="ghost" class="self-start" @click="form.links.push({ url: '', note: '' })">Add another link</UiButton>
        </div>
        <p class="text-xs text-muted">While a dispute is open, the result is on hold and reports can’t be changed.</p>
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="showForm = false">Cancel</UiButton>
          <UiButton type="submit" variant="danger" :loading="busy">Open dispute</UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

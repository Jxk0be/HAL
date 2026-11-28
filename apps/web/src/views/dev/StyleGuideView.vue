<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiTable from '@/components/ui/UiTable.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import TeamLogo from '@/components/ui/TeamLogo.vue'
import ScoreChip from '@/components/ui/ScoreChip.vue'
import UiCountdown from '@/components/ui/UiCountdown.vue'
import UiStepper from '@/components/ui/UiStepper.vue'
import UiStatTile from '@/components/ui/UiStatTile.vue'
import UiPodium from '@/components/ui/UiPodium.vue'
import type { TableSort } from '@/components/ui/types'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const modalOpen = ref(false)
function sendInvite() {
  modalOpen.value = false
  toast.success('Invite sent.')
}
const tab = ref<'standings' | 'kd' | 'score'>('standings')
const pill = ref<'all' | 'recruiting' | 'premier'>('all')
const steps = [
  { key: 'signups', label: 'Signups' },
  { key: 'pre', label: 'Preseason' },
  { key: 'w1', label: 'Week 1' },
  { key: 'w2', label: 'Week 2' },
  { key: 'w3', label: 'Week 3' },
  { key: 'playoffs', label: 'Playoffs' },
]
const podium = [
  { key: 'a', name: 'Viper#1234567', meta: 'SRPH · 1.42 K/D' },
  { key: 'b', name: 'Nyx#7654321', meta: 'HALO · 1.31 K/D' },
  { key: 'c', name: 'Grit#1111111', meta: 'GATE · 1.27 K/D' },
]
const platform = ref<'playstation' | 'xbox' | 'pc' | ''>('')
const search = ref('')
const activision = ref('')
const sort = ref<TableSort | null>({ key: 'wins', dir: 'desc' })
const countdownTo = new Date(Date.now() + 2 * 86400_000 + 5 * 3600_000).toISOString()

const columns = [
  { key: 'rank', label: '#', numeric: true },
  { key: 'team', label: 'Team', sortable: true },
  { key: 'wins', label: 'W', sortable: true, numeric: true },
  { key: 'losses', label: 'L', sortable: true, numeric: true },
  { key: 'mapDiff', label: 'Map +/-', sortable: true, numeric: true, hideOnMobile: true },
  { key: 'last', label: 'Last', hideOnMobile: true },
] as const
const rows = [
  { rank: 1, team: 'Seraphim', tag: 'SRPH', wins: 6, losses: 1, mapDiff: 11, last: { s: 3, o: 1 } },
  { rank: 2, team: 'Halo Theory', tag: 'HALO', wins: 5, losses: 2, mapDiff: 6, last: { s: 1, o: 3 } },
  { rank: 3, team: 'Gatekeepers', tag: 'GATE', wins: 4, losses: 3, mapDiff: 2, last: { s: 3, o: 2 } },
  { rank: 4, team: 'Nimbus', tag: 'NMB', wins: 1, losses: 6, mapDiff: -9, last: { s: 0, o: 3 } },
]

const swatches = [
  ['bg', 'bg-bg'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['surface-3', 'bg-surface-3'],
  ['line', 'bg-line'],
  ['accent', 'bg-accent'],
  ['accent-dim', 'bg-accent-dim'],
  ['win', 'bg-win'],
  ['loss', 'bg-loss'],
] as const
</script>

<template>
  <div>
    <PageHeader title="Style guide" eyebrow="Dev only" description="Every UI primitive in one place. Not included in production builds." />

    <div class="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6">
      <section aria-labelledby="sg-brand">
        <h2 id="sg-brand" class="eyebrow mb-4 text-accent">Brand</h2>
        <div class="flex flex-wrap items-center gap-10 rounded-lg border border-line bg-surface p-6">
          <BrandLogo :size="240" variant="full" />
          <BrandLogo :size="52" variant="emblem" />
          <BrandLogo :size="46" />
        </div>
      </section>

      <section aria-labelledby="sg-type">
        <h2 id="sg-type" class="eyebrow mb-4 text-accent">Color & type</h2>
        <div class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          <div v-for="[name, cls] in swatches" :key="name" class="overflow-hidden rounded-md border border-line">
            <div class="h-14" :class="cls" />
            <p class="bg-surface px-2 py-1.5 text-xs text-muted">{{ name }}</p>
          </div>
        </div>
        <div class="mt-6 space-y-3 rounded-lg border border-line bg-surface p-6">
          <p class="font-heading text-5xl">Display heading</p>
          <p class="font-heading text-2xl">Section heading</p>
          <p class="eyebrow text-accent">Eyebrow label</p>
          <p>Body text in Barlow. The quick brown fox jumps over the lazy dog.</p>
          <p class="text-muted">Muted supporting text.</p>
          <p class="tnum font-heading text-3xl">250 – 187 · 1.42 K/D · +38</p>
        </div>
      </section>

      <section aria-labelledby="sg-textures">
        <h2 id="sg-textures" class="eyebrow mb-4 text-accent">Tokens & textures</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <div class="rounded-xl border border-line bg-surface p-5">
            <p class="eyebrow-line text-faint">eyebrow-line</p>
            <p class="title-xl mt-3">Title XL</p>
          </div>
          <div class="texture-stripes card-accent rounded-xl border border-line bg-surface p-5">
            <p class="eyebrow text-faint">texture-stripes + card-accent</p>
            <p class="mt-2 font-heading text-2xl">Red top border</p>
          </div>
          <div class="texture-stripes card-accent rounded-xl border border-line bg-surface p-5" style="--card-accent: var(--color-line-strong)">
            <p class="eyebrow text-faint">neutral card-accent</p>
            <p class="mt-2 font-heading text-2xl">Neutral top border</p>
          </div>
          <div class="texture-stripes-brand rounded-xl bg-brand p-5 text-on-brand md:col-span-2">
            <p class="eyebrow">texture-stripes-brand</p>
            <p class="mt-2 font-heading text-2xl">Gold to Crimson. Prove it.</p>
          </div>
          <div class="flex flex-col gap-2 rounded-xl border border-line bg-rail p-5">
            <p class="eyebrow text-faint">rail · chip · track</p>
            <span class="w-fit rounded-full bg-chip px-3 py-1 text-sm text-muted">Chip</span>
            <div class="h-2 rounded-full bg-track"><div class="h-full w-2/3 rounded-full bg-accent" /></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="sg-kit">
        <h2 id="sg-kit" class="eyebrow mb-4 text-accent">Cards, tabs, stepper, tiles, podium</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <UiCard accent="red" title="Accent red">Needs your action.</UiCard>
          <UiCard accent="neutral" striped title="Neutral + striped">Information only.</UiCard>
          <UiCard accent="neutral" interactive title="Interactive">Lifts on hover.</UiCard>
        </div>
        <div class="mt-6">
          <UiTabs
            v-model="pill"
            variant="pill"
            label="Pill tabs"
            :tabs="[
              { value: 'all', label: 'All', count: 12 },
              { value: 'recruiting', label: 'Recruiting', count: 3 },
              { value: 'premier', label: 'Premier' },
            ]"
          >
            <p class="text-sm text-muted">Pill tab: {{ pill }}</p>
          </UiTabs>
        </div>
        <div class="mt-6 rounded-xl border border-line bg-surface p-5">
          <UiStepper :steps="steps" current-key="w2" label="Season progress" />
        </div>
        <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <UiStatTile label="Record" value="6–1" hint="Series W–L" />
          <UiStatTile label="Map diff" value="+11" accent="neutral" />
          <UiStatTile label="Standing" value="#1" accent="neutral" />
          <UiStatTile label="Forfeits" value="0" accent="neutral" />
        </div>
        <div class="mt-8">
          <UiPodium :entries="podium" label="Top K/D">
            <template #media="{ entry }"><UiAvatar :name="entry.name" decorative /></template>
          </UiPodium>
        </div>
      </section>

      <section aria-labelledby="sg-buttons">
        <h2 id="sg-buttons" class="eyebrow mb-4 text-accent">Buttons & badges</h2>
        <div class="flex flex-wrap items-center gap-3">
          <UiButton>Primary</UiButton>
          <UiButton variant="secondary">Secondary</UiButton>
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="danger">Danger</UiButton>
          <UiButton loading>Saving</UiButton>
          <UiButton disabled>Disabled</UiButton>
          <UiButton size="sm">Small</UiButton>
          <UiButton size="lg">Large</UiButton>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UiBadge>Neutral</UiBadge>
          <UiBadge variant="accent">Captain</UiBadge>
          <UiBadge variant="win">Confirmed</UiBadge>
          <UiBadge variant="loss">Disputed</UiBadge>
          <UiBadge variant="outline">Sub</UiBadge>
          <UiBadge variant="live">Live</UiBadge>
        </div>
      </section>

      <section aria-labelledby="sg-forms">
        <h2 id="sg-forms" class="eyebrow mb-4 text-accent">Forms</h2>
        <div class="grid gap-4 rounded-lg border border-line bg-surface p-6 sm:grid-cols-3">
          <UiInput v-model="activision" label="Activision ID" placeholder="Name#1234567" required hint="Shown on your public profile." />
          <UiSelect
            v-model="platform"
            label="Platform"
            placeholder="Choose a platform"
            :options="[
              { value: 'playstation', label: 'PlayStation' },
              { value: 'xbox', label: 'Xbox' },
              { value: 'pc', label: 'PC (controller)' },
            ]"
          />
          <UiInput v-model="search" label="Search players" placeholder="Discord or Activision name" error="No players match that name.">
            <template #prefix>
              <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.5" />
                <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </template>
          </UiInput>
        </div>
      </section>

      <section aria-labelledby="sg-data">
        <h2 id="sg-data" class="eyebrow mb-4 text-accent">Tabs, table, scores</h2>
        <UiTabs
          v-model="tab"
          label="Leaderboards"
          :tabs="[
            { value: 'standings', label: 'Standings', count: 4 },
            { value: 'kd', label: 'K/D' },
            { value: 'score', label: 'Avg score' },
          ]"
        >
          <template #default="{ active }">
            <UiTable
              v-if="active === 'standings'"
              v-model:sort="sort"
              :columns="columns"
              :rows="rows"
              row-key="team"
              caption="Season 1 standings"
              sort-rows
            >
              <template #cell-team="{ row }">
                <span class="flex items-center gap-3">
                  <TeamLogo :tag="row.tag" :name="row.team" size="sm" decorative />
                  <span class="font-medium">{{ row.team }}</span>
                </span>
              </template>
              <template #cell-mapDiff="{ value }">
                <span :class="Number(value) > 0 ? 'text-win' : Number(value) < 0 ? 'text-loss' : ''">
                  {{ Number(value) > 0 ? `+${value}` : value }}
                </span>
              </template>
              <template #cell-last="{ row }">
                <ScoreChip :score="row.last.s" :opponent="row.last.o" />
              </template>
            </UiTable>
            <UiEmptyState v-else title="No stats yet" description="Leaderboards fill in once the first matches are confirmed." />
          </template>
        </UiTabs>
      </section>

      <section aria-labelledby="sg-misc">
        <h2 id="sg-misc" class="eyebrow mb-4 text-accent">Cards, people, feedback</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <UiCard eyebrow="Week 3 · Tue" title="Next match">
            <div class="flex items-center justify-between gap-3">
              <TeamLogo tag="SRPH" name="Seraphim" />
              <span class="eyebrow text-muted">vs</span>
              <TeamLogo tag="GATE" name="Gatekeepers" />
            </div>
            <div class="mt-5"><UiCountdown :to="countdownTo" /></div>
          </UiCard>
          <UiCard eyebrow="Roster" title="Seraphim">
            <ul class="space-y-3">
              <li v-for="p in ['Kairo', 'Vex Nine', 'Lumen', 'Ash']" :key="p" class="flex items-center gap-3">
                <UiAvatar :name="p" size="sm" decorative />
                <span class="flex-1 text-sm">{{ p }}</span>
                <UiBadge v-if="p === 'Kairo'" variant="accent">Captain</UiBadge>
              </li>
            </ul>
          </UiCard>
          <UiCard eyebrow="Loading" title="Skeleton">
            <UiSkeleton :lines="4" />
            <div class="mt-6 flex flex-wrap gap-2">
              <UiButton size="sm" variant="secondary" @click="toast.success('Invite sent to Lumen.')">Success toast</UiButton>
              <UiButton size="sm" variant="secondary" @click="toast.error('Your roster is full (max 7 players).')">Error toast</UiButton>
              <UiButton size="sm" @click="modalOpen = true">Open modal</UiButton>
            </div>
          </UiCard>
        </div>
      </section>

      <section aria-labelledby="sg-banner">
        <h2 id="sg-banner" class="eyebrow mb-4 text-accent">Live banner</h2>
        <p class="text-sm text-muted">The banner shows at the top of every page while a caster is live (see /admin/casting). It reads real data, so it isn't previewed here.</p>
      </section>
    </div>

    <UiModal v-model="modalOpen" title="Invite Lumen?" description="They'll join as a sub. Starter spots are full.">
      <p class="text-sm text-muted">Invites expire after 7 days. Lumen can accept or decline from their profile.</p>
      <template #footer>
        <UiButton variant="ghost" @click="modalOpen = false">Cancel</UiButton>
        <UiButton @click="sendInvite">Send invite</UiButton>
      </template>
    </UiModal>
  </div>
</template>

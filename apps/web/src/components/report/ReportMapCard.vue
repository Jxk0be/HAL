<script setup lang="ts">
import { computed, ref } from 'vue'
import StatGrid from './StatGrid.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/image'
import { MAX_SCREENSHOTS, parseStat, type ReportMap } from '@/lib/reporting'
import type { GameMap, GameMode } from '@/composables/useGameData'
import type { RosterOption } from '@/composables/useReport'

const props = defineProps<{
  index: number
  homeTeam: { id: string; tag: string; name: string }
  awayTeam: { id: string; tag: string; name: string }
  modes: GameMode[]
  maps: GameMap[]
  /** "mapId:modeId" pairs that are legal. */
  legal: Set<string>
  roster: RosterOption[]
  previews: Record<string, string>
  uploading: boolean
  issues: string[]
  /** Shown on maps after the series was decided. */
  removable: boolean
}>()

const emit = defineEmits<{
  upload: [files: File[]]
  remove: []
}>()

const model = defineModel<ReportMap>({ required: true })
const number = computed(() => props.index + 1)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const modeOptions = computed(() => props.modes.filter((m) => m.active || m.id === model.value.modeId))
const mapOptions = computed(() =>
  props.maps.filter((m) => (m.active || m.id === model.value.mapId) && (!model.value.modeId || props.legal.has(`${m.id}:${model.value.modeId}`))),
)

function setMode(modeId: string) {
  const keepMap = model.value.mapId && props.legal.has(`${model.value.mapId}:${modeId}`)
  model.value = { ...model.value, modeId, mapId: keepMap ? model.value.mapId : '' }
}

function setScore(side: 'homeScore' | 'awayScore', raw: string) {
  const v = parseStat(raw)
  if (v !== undefined) model.value = { ...model.value, [side]: v }
}

const winner = computed(() => {
  const { homeScore: h, awayScore: a } = model.value
  if (h == null || a == null || h === a) return null
  return h > a ? props.homeTeam.tag : props.awayTeam.tag
})

function takeFiles(list: FileList | null | undefined) {
  const files = Array.from(list ?? []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
  if (files.length) emit('upload', files)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  takeFiles(e.dataTransfer?.files)
}

function removeShot(path: string) {
  model.value = { ...model.value, screenshots: model.value.screenshots.filter((p) => p !== path) }
}

const players = computed({
  get: () => model.value.players,
  set: (players) => (model.value = { ...model.value, players }),
})
</script>

<template>
  <section
    :aria-labelledby="`map-${number}-title`"
    class="rounded-lg border bg-surface p-4 sm:p-5"
    :class="issues.length ? 'border-loss/50' : 'border-line'"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 :id="`map-${number}-title`" class="font-heading text-xl">
        Map {{ number }}
        <span v-if="winner" class="ml-2 text-sm text-accent">{{ winner }} win</span>
      </h2>
      <UiButton v-if="removable" variant="danger" size="sm" @click="emit('remove')">Remove map {{ number }}</UiButton>
    </header>

    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium">Mode</span>
        <select
          :value="model.modeId"
          class="h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          @change="setMode(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Choose mode…</option>
          <option v-for="m in modeOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium">Map</span>
        <select
          :value="model.mapId"
          :disabled="!model.modeId"
          class="h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          @change="model = { ...model, mapId: ($event.target as HTMLSelectElement).value }"
        >
          <option value="">{{ model.modeId ? 'Choose map…' : 'Choose a mode first' }}</option>
          <option v-for="m in mapOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium">{{ homeTeam.tag }} score <span class="text-muted">(home)</span></span>
        <input
          :value="model.homeScore ?? ''"
          inputmode="numeric"
          autocomplete="off"
          class="tnum h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          @input="setScore('homeScore', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium">{{ awayTeam.tag }} score <span class="text-muted">(away)</span></span>
        <input
          :value="model.awayScore ?? ''"
          inputmode="numeric"
          autocomplete="off"
          class="tnum h-10 rounded-md border border-line-strong bg-surface-2 px-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          @input="setScore('awayScore', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <!-- Screenshots -->
    <div class="mt-5">
      <p class="text-sm font-medium">Scoreboard screenshots <span class="text-muted">(required, up to {{ MAX_SCREENSHOTS }})</span></p>
      <div
        class="mt-2 flex flex-wrap items-stretch gap-3 rounded-md border border-dashed p-3 transition-colors"
        :class="dragging ? 'border-accent bg-accent-soft' : 'border-line-strong'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <figure v-for="path in model.screenshots" :key="path" class="relative">
          <a v-if="previews[path]" :href="previews[path]" target="_blank" rel="noopener" class="block">
            <img :src="previews[path]" :alt="`Map ${number} screenshot`" class="h-20 w-32 rounded-sm border border-line object-cover" />
          </a>
          <span v-else class="grid h-20 w-32 place-items-center rounded-sm border border-line text-xs text-muted">Uploaded</span>
          <button
            type="button"
            class="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-line-strong bg-surface-3 text-xs hover:border-loss hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
            :aria-label="`Remove map ${number} screenshot`"
            @click="removeShot(path)"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </figure>
        <div v-if="model.screenshots.length < MAX_SCREENSHOTS" class="flex min-h-20 flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-muted">
          <span>{{ uploading ? 'Uploading…' : 'Drag screenshots here, or' }}</span>
          <UiButton size="sm" variant="secondary" :loading="uploading" @click="fileInput?.click()">Choose files</UiButton>
          <input
            ref="fileInput"
            type="file"
            :accept="ACCEPTED_IMAGE_TYPES.join(',')"
            multiple
            class="sr-only"
            :aria-label="`Add map ${number} screenshots`"
            @change="takeFiles(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''"
          />
        </div>
      </div>
    </div>

    <!-- Player stats -->
    <div class="mt-5">
      <p class="mb-2 text-sm font-medium">
        Player stats
        <span class="font-normal text-muted">· Enter or arrow keys to move, paste a spreadsheet row to fill across</span>
      </p>
      <StatGrid v-model="players" :map-number="number" :home-team="homeTeam" :away-team="awayTeam" :roster="roster" />
    </div>

    <ul v-if="issues.length" class="mt-4 flex flex-col gap-1 text-sm text-loss">
      <li v-for="i in issues" :key="i">{{ i }}</li>
    </ul>
  </section>
</template>

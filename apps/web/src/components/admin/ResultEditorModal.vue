<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import PublicLogNotice from './PublicLogNotice.vue'
import { useGameData } from '@/composables/useGameData'
import { adminResults, loadResultMaps, type ResultMap } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import { parseStat, seriesState } from '@/lib/reporting'

/** Set a match's maps and series directly (overturning a result). Player stats on kept maps stay. */
const props = defineProps<{
  match: { id: string; home: { tag: string; name: string }; away: { tag: string; name: string } } | null
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const game = useGameData()
const rows = ref<ResultMap[]>([])
const busy = ref(false)

const blank = (): ResultMap => ({ mode_id: '', map_id: '', home_score: null, away_score: null })

watch(open, async (v) => {
  if (!v || !props.match) return
  void game.load()
  rows.value = await loadResultMaps(props.match.id)
  while (rows.value.length < 3) rows.value.push(blank())
})

const series = computed(() => seriesState(rows.value.map((r) => ({ homeScore: r.home_score, awayScore: r.away_score }))))
const mapsFor = (modeId: string) => game.maps.value.filter((m) => !modeId || game.legal.value.has(`${m.id}:${modeId}`))

function setScore(i: number, side: 'home_score' | 'away_score', raw: string) {
  const v = parseStat(raw)
  const row = rows.value[i]
  if (row && v !== undefined) row[side] = v
}

async function save() {
  if (!props.match) return
  busy.value = true
  const r = await adminResults.setResult(props.match.id, rows.value)
  busy.value = false
  if (!r.ok) {
    toast.error(r.message)
    return
  }
  toast.success('Result updated. Standings are recalculated.')
  open.value = false
  emit('saved')
}
</script>

<template>
  <UiModal v-model="open" :title="match ? `Set result: ${match.home.tag} vs ${match.away.tag}` : 'Set result'" size="lg">
    <form v-if="match" class="flex flex-col gap-4" @submit.prevent="save">
      <p class="text-sm text-muted">
        Enter every map in order. This replaces the current result and settles any open map mismatches.
        Player stats on maps that stay are kept.
      </p>
      <div v-for="(r, i) in rows" :key="i" class="grid grid-cols-2 gap-2 rounded-md border border-line p-3 sm:grid-cols-[auto_1fr_1fr_5rem_5rem]">
        <span class="col-span-2 self-center font-heading text-sm text-gold sm:col-span-1">Map {{ i + 1 }}</span>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-muted">Mode</span>
          <select v-model="r.mode_id" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-gold">
            <option value="">Mode…</option>
            <option v-for="m in game.modes.value" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-muted">Map</span>
          <select v-model="r.map_id" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-gold">
            <option value="">Map…</option>
            <option v-for="m in mapsFor(r.mode_id)" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-muted">{{ match.home.tag }}</span>
          <input :value="r.home_score ?? ''" inputmode="numeric" class="tnum h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-gold" @input="setScore(i, 'home_score', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-muted">{{ match.away.tag }}</span>
          <input :value="r.away_score ?? ''" inputmode="numeric" class="tnum h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm focus-visible:outline-2 focus-visible:outline-gold" @input="setScore(i, 'away_score', ($event.target as HTMLInputElement).value)" />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton size="sm" variant="secondary" :disabled="rows.length >= 5" @click="rows.push(blank())">Add map</UiButton>
        <UiButton size="sm" variant="ghost" :disabled="rows.length <= 3" @click="rows.pop()">Remove last map</UiButton>
        <span class="tnum ml-auto text-sm">Series {{ match.home.tag }} {{ series.home }} – {{ series.away }} {{ match.away.tag }}</span>
      </div>
      <PublicLogNotice />
      <div class="flex justify-end gap-2">
        <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
        <UiButton type="submit" :loading="busy">Save result</UiButton>
      </div>
    </form>
  </UiModal>
</template>

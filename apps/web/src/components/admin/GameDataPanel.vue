<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useGameData } from '@/composables/useGameData'
import { useToast } from '@/composables/useToast'

/**
 * Mode-first editing: add a mode, select it, then add the maps played in that mode. A map name
 * used in several modes is one map in several pools. Removing a map only takes it out of that
 * mode's pool, so old match results keep their maps.
 */
const toast = useToast()
const g = useGameData()
void g.load()

const selectedId = ref<string | null>(null)
const selected = computed(() => g.modes.value.find((m) => m.id === selectedId.value) ?? null)
const poolMaps = computed(() => (selected.value ? g.mapsInMode(selected.value.id) : []))
/** Maps already used by other modes, offered as suggestions. */
const suggestions = computed(() => g.maps.value.filter((m) => !poolMaps.value.some((p) => p.id === m.id)))

// Select the first mode once loaded, and keep a valid selection.
watch(
  () => g.modes.value,
  (modes) => {
    if (!modes.some((m) => m.id === selectedId.value)) selectedId.value = modes[0]?.id ?? null
  },
)

const newMode = ref('')
const newMap = ref('')

async function act(p: Promise<{ ok: boolean; message?: string }>, success?: string) {
  const r = await p
  if (!r.ok) toast.error(r.message ?? 'Something went wrong.')
  else if (success) toast.success(success)
  return r.ok
}

async function addMode() {
  const name = newMode.value.trim()
  if (!name) return
  if (await act(g.addMode(name), `Added ${name}. Now add its maps.`)) {
    newMode.value = ''
    selectedId.value = g.modes.value.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? selectedId.value
  }
}

async function addMap() {
  const mode = selected.value
  const name = newMap.value.trim()
  if (!mode || !name) return
  if (await act(g.addMapToMode(mode.id, name), `Added ${name} to ${mode.name}.`)) newMap.value = ''
}

function removeMap(mapId: string, mapName: string) {
  const mode = selected.value
  if (!mode) return
  void act(g.setLegal(mapId, mode.id, false), `Removed ${mapName} from ${mode.name}.`)
}

function moveMode(index: number, dir: -1 | 1) {
  const list = g.modes.value
  const a = list[index]
  const b = list[index + dir]
  if (!a || !b) return
  // Swap sort orders (fall back to positions when they are equal).
  const aOrder = a.sortOrder === b.sortOrder ? index + 1 : a.sortOrder
  const bOrder = a.sortOrder === b.sortOrder ? index + 1 + dir : b.sortOrder
  void act(g.updateMode(a.id, { sort_order: bOrder })).then((ok) => ok && act(g.updateMode(b.id, { sort_order: aOrder })))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="text-sm text-muted">
      Add each mode, select it, then add the maps played in that mode. The report form only offers a
      mode’s maps. Removing a map takes it out of that mode only; deactivate a mode instead of
      deleting it, so old results keep their modes.
    </p>
    <UiSkeleton v-if="g.loading.value" :lines="5" />

    <div v-else class="grid gap-6 md:grid-cols-[16rem_1fr]">
      <!-- Modes -->
      <section aria-labelledby="modes-title">
        <h3 id="modes-title" class="eyebrow mb-3 text-muted">1. Modes</h3>
        <ul class="flex flex-col gap-1" role="list">
          <li v-if="g.modes.value.length === 0" class="rounded-md border border-dashed border-line-strong px-3 py-3 text-sm text-muted">
            No modes yet. Add Hardpoint, Search and Destroy, Control…
          </li>
          <li v-for="(m, i) in g.modes.value" :key="m.id" class="group flex items-center gap-1">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent"
              :class="m.id === selectedId ? 'border-accent-dim bg-accent-soft text-text' : 'border-line bg-surface hover:border-line-strong'"
              :aria-pressed="m.id === selectedId"
              @click="selectedId = m.id"
            >
              <span class="min-w-0 flex-1 truncate" :class="m.active ? '' : 'text-muted line-through'">{{ m.name }}</span>
              <span class="tnum text-xs text-muted" :aria-label="`${g.mapsInMode(m.id).length} maps`">{{ g.mapsInMode(m.id).length }}</span>
            </button>
            <span class="flex flex-col">
              <button
                type="button"
                class="grid h-4 w-6 place-items-center text-xs text-muted hover:text-accent disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                :disabled="i === 0 || g.busy.value"
                :aria-label="`Move ${m.name} up`"
                @click="moveMode(i, -1)"
              ><span aria-hidden="true">▲</span></button>
              <button
                type="button"
                class="grid h-4 w-6 place-items-center text-xs text-muted hover:text-accent disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                :disabled="i === g.modes.value.length - 1 || g.busy.value"
                :aria-label="`Move ${m.name} down`"
                @click="moveMode(i, 1)"
              ><span aria-hidden="true">▼</span></button>
            </span>
          </li>
        </ul>
        <form class="mt-3 flex items-end gap-2" @submit.prevent="addMode">
          <UiInput v-model="newMode" label="New mode" placeholder="Hardpoint" />
          <UiButton type="submit" size="md" :disabled="g.busy.value || !newMode.trim()">Add</UiButton>
        </form>
      </section>

      <!-- Maps in the selected mode -->
      <section aria-labelledby="pool-title" class="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <template v-if="selected">
          <div class="flex flex-wrap items-center gap-3">
            <h3 id="pool-title" class="flex-1 font-heading text-xl">
              <span class="eyebrow block text-muted">2. Maps in</span>
              {{ selected.name }}
            </h3>
            <UiBadge v-if="!selected.active">Inactive</UiBadge>
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="g.busy.value"
              @click="act(g.updateMode(selected.id, { active: !selected.active }), selected.active ? `${selected.name} deactivated.` : `${selected.name} activated.`)"
            >
              {{ selected.active ? 'Deactivate mode' : 'Activate mode' }}
            </UiButton>
          </div>

          <ul class="mt-4 flex flex-col divide-y divide-line rounded-md border border-line">
            <li v-if="poolMaps.length === 0" class="px-4 py-3 text-sm text-muted">No maps in {{ selected.name }} yet. Add the first one below.</li>
            <li v-for="m in poolMaps" :key="m.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span class="flex-1">{{ m.name }}</span>
              <UiButton size="sm" variant="ghost" :disabled="g.busy.value" @click="removeMap(m.id, m.name)">
                Remove<span class="sr-only"> {{ m.name }} from {{ selected.name }}</span>
              </UiButton>
            </li>
          </ul>

          <form class="mt-3 flex items-end gap-2" @submit.prevent="addMap">
            <div class="flex-1">
              <UiInput v-model="newMap" :label="`Add a map to ${selected.name}`" placeholder="Map name" autocomplete="off" list="hal-map-suggestions" />
              <datalist id="hal-map-suggestions">
                <option v-for="m in suggestions" :key="m.id" :value="m.name" />
              </datalist>
            </div>
            <UiButton type="submit" size="md" :disabled="g.busy.value || !newMap.trim()">Add map</UiButton>
          </form>
          <p v-if="suggestions.length" class="mt-2 text-xs text-muted">
            Maps from other modes are suggested as you type, so the same map is shared rather than duplicated.
          </p>
        </template>
        <p v-else id="pool-title" class="text-sm text-muted">Add a mode first, then select it to add its maps.</p>
      </section>
    </div>
  </div>
</template>

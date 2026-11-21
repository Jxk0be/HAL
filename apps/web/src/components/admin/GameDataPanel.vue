<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useGameData } from '@/composables/useGameData'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const g = useGameData()
void g.load()

const newMode = ref('')
const newMap = ref('')

async function act(p: Promise<{ ok: boolean; message?: string }>, success?: string) {
  const r = await p
  if (!r.ok) toast.error(r.message ?? 'Something went wrong.')
  else if (success) toast.success(success)
}
async function addMode() {
  if (!newMode.value.trim()) return
  await act(g.addMode(newMode.value), `Added ${newMode.value.trim()}.`)
  newMode.value = ''
}
async function addMap() {
  if (!newMap.value.trim()) return
  await act(g.addMap(newMap.value), `Added ${newMap.value.trim()}.`)
  newMap.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <p class="text-sm text-muted">
      Enter the MW4 modes and map pool here, then tick which maps are legal in each mode. Deactivate
      instead of deleting, so old match results keep their maps.
    </p>
    <UiSkeleton v-if="g.loading.value" :lines="5" />
    <template v-else>
      <div class="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="modes-title">
          <h3 id="modes-title" class="eyebrow mb-3 text-muted">Modes</h3>
          <ul class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            <li v-if="g.modes.value.length === 0" class="px-4 py-3 text-sm text-muted">No modes yet.</li>
            <li v-for="m in g.modes.value" :key="m.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span class="flex-1" :class="m.active ? '' : 'text-muted line-through'">{{ m.name }}</span>
              <UiBadge v-if="!m.active">Inactive</UiBadge>
              <UiButton size="sm" variant="ghost" :disabled="g.busy.value" @click="act(g.updateMode(m.id, { active: !m.active }))">
                {{ m.active ? 'Deactivate' : 'Activate' }}<span class="sr-only"> {{ m.name }}</span>
              </UiButton>
            </li>
          </ul>
          <form class="mt-3 flex items-end gap-2" @submit.prevent="addMode">
            <UiInput v-model="newMode" label="New mode" placeholder="Hardpoint" />
            <UiButton type="submit" size="sm" :disabled="g.busy.value || !newMode.trim()">Add</UiButton>
          </form>
        </section>

        <section aria-labelledby="maps-title">
          <h3 id="maps-title" class="eyebrow mb-3 text-muted">Maps</h3>
          <ul class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            <li v-if="g.maps.value.length === 0" class="px-4 py-3 text-sm text-muted">No maps yet.</li>
            <li v-for="m in g.maps.value" :key="m.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span class="flex-1" :class="m.active ? '' : 'text-muted line-through'">{{ m.name }}</span>
              <UiBadge v-if="!m.active">Inactive</UiBadge>
              <UiButton size="sm" variant="ghost" :disabled="g.busy.value" @click="act(g.updateMap(m.id, { active: !m.active }))">
                {{ m.active ? 'Deactivate' : 'Activate' }}<span class="sr-only"> {{ m.name }}</span>
              </UiButton>
            </li>
          </ul>
          <form class="mt-3 flex items-end gap-2" @submit.prevent="addMap">
            <UiInput v-model="newMap" label="New map" placeholder="Map name" />
            <UiButton type="submit" size="sm" :disabled="g.busy.value || !newMap.trim()">Add</UiButton>
          </form>
        </section>
      </div>

      <section v-if="g.modes.value.length && g.maps.value.length" aria-labelledby="pool-title">
        <h3 id="pool-title" class="eyebrow mb-3 text-muted">Map pool: legal maps per mode</h3>
        <div class="overflow-x-auto rounded-lg border border-line bg-surface">
          <table class="w-full text-sm">
            <caption class="sr-only">Which maps are legal in which mode</caption>
            <thead>
              <tr class="border-b border-line">
                <th scope="col" class="eyebrow px-4 py-3 text-left text-muted">Map</th>
                <th v-for="mode in g.modes.value" :key="mode.id" scope="col" class="eyebrow px-4 py-3 text-center text-muted">{{ mode.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="map in g.maps.value" :key="map.id" class="border-b border-line last:border-b-0">
                <th scope="row" class="px-4 py-2 text-left font-normal" :class="map.active ? '' : 'text-muted'">{{ map.name }}</th>
                <td v-for="mode in g.modes.value" :key="mode.id" class="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    class="size-4 accent-[var(--color-gold)]"
                    :aria-label="`${map.name} is legal in ${mode.name}`"
                    :checked="g.legal.value.has(`${map.id}:${mode.id}`)"
                    :disabled="g.busy.value"
                    @change="act(g.setLegal(map.id, mode.id, ($event.target as HTMLInputElement).checked))"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

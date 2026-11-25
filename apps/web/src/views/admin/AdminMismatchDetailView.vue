<script setup lang="ts">
import { weekLabel } from '@/lib/preseason'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import RecusedNotice from '@/components/admin/RecusedNotice.vue'
import ScreenshotViewer from '@/components/admin/ScreenshotViewer.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useMismatchDetail, useRecusal, type MismatchRow } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import { kd } from '@/lib/reporting'

const route = useRoute()
const toast = useToast()
const matchId = computed(() => (typeof route.params.matchId === 'string' ? route.params.matchId : null))
const d = useMismatchDetail(matchId)
const { match, rows, reports, names, modes, maps, loading, busy } = d
const { isRecused } = useRecusal()
const recused = computed(() => Boolean(match.value && isRecused(match.value.home.id, match.value.away.id)))

const open = computed(() => rows.value.filter((r) => !r.resolvedAt))
const settled = computed(() => rows.value.filter((r) => r.resolvedAt))
const mapNumbers = computed(() => {
  const n = Math.max(reports.value.home?.maps.length ?? 0, reports.value.away?.maps.length ?? 0)
  return Array.from({ length: n }, (_, i) => i + 1)
})

const FIELD: Record<string, string> = {
  played: 'Played', mode: 'Mode', map: 'Map', home_score: 'Home score', away_score: 'Away score',
  team: 'Team', kills: 'Kills', deaths: 'Deaths', score: 'Score',
}
const modeName = (id?: string) => modes.value.find((m) => m.id === id)?.name ?? '—'
const mapName = (id?: string) => maps.value.find((m) => m.id === id)?.name ?? '—'
const teamTag = (id?: string | null) =>
  !match.value ? '' : id === match.value.home.id ? match.value.home.tag : id === match.value.away.id ? match.value.away.tag : (id ?? '—')
const show = (r: MismatchRow, v: string | null) => (r.field === 'team' ? teamTag(v) : (v ?? '—'))

// ---- Keyboard: 1 = home, 2 = away, E = enter value, N = next ---------------------
const active = ref(0)
const editing = ref<string | null>(null)
const custom = ref('')
const activeRow = computed(() => open.value[active.value] ?? null)

function focusRow(i: number) {
  active.value = Math.max(0, Math.min(open.value.length - 1, i))
  void nextTick(() => document.getElementById(`mm-${activeRow.value?.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

async function settle(r: MismatchRow, choice: 'home' | 'away' | 'custom', value?: string) {
  if (recused.value || busy.value) return
  const res = await d.resolve(r.id, choice, value)
  if (!res.ok) {
    toast.error(res.message)
    return
  }
  editing.value = null
  custom.value = ''
  if (res.value.remaining === 0) {
    if (res.value.status === 'confirmed') toast.success('All settled. The result is confirmed and standings are updated.')
    else if (!res.value.series.valid) toast.error(`All fields settled, but the maps add up to ${res.value.series.home}–${res.value.series.away}. Set the result from Disputes or Content.`)
    else toast.success('All settled.')
  } else {
    toast.success('Settled.')
  }
  focusRow(Math.min(active.value, open.value.length - 1))
}

function startEdit(r: MismatchRow) {
  editing.value = r.id
  custom.value = r.field === 'team' ? (match.value?.home.id ?? '') : ''
  void nextTick(() => document.getElementById(`mm-input-${r.id}`)?.focus())
}

function onKeydown(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.closest('dialog') || e.metaKey || e.ctrlKey || e.altKey) return
  const r = activeRow.value
  if (!r) return
  if (e.key === '1') void settle(r, 'home')
  else if (e.key === '2') void settle(r, 'away')
  else if (e.key.toLowerCase() === 'e') {
    e.preventDefault()
    startEdit(r)
  } else if (e.key.toLowerCase() === 'n') focusRow((active.value + 1) % Math.max(1, open.value.length))
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ---- Side-by-side report view ----------------------------------------------------
function line(side: 'home' | 'away', n: number, userId: string) {
  return reports.value[side]?.players[n]?.find((p) => p.user_id === userId) ?? null
}
function players(n: number) {
  const ids = new Set<string>()
  for (const s of ['home', 'away'] as const) for (const p of reports.value[s]?.players[n] ?? []) ids.add(p.user_id)
  return [...ids]
}
function differs(n: number, userId: string, f: 'kills' | 'deaths' | 'score') {
  return line('home', n, userId)?.[f] !== line('away', n, userId)?.[f]
}
function shots(n: number) {
  const out: { url: string; label: string }[] = []
  for (const s of ['home', 'away'] as const) {
    const team = s === 'home' ? match.value?.home.tag : match.value?.away.tag
    reports.value[s]?.screenshots.filter((x) => x.mapNumber === n).forEach((x, i) => out.push({ url: x.url, label: `Map ${n}, ${team} screenshot ${i + 1}` }))
  }
  return out
}
</script>

<template>
  <div>
    <UiSkeleton v-if="loading" class="px-6 py-10" :lines="8" />
    <div v-else-if="!match" class="px-4 py-10 sm:px-6">
      <UiEmptyState title="Match not found" description="It may have been removed.">
        <UiButton to="/admin/mismatches" variant="secondary">Back to the queue</UiButton>
      </UiEmptyState>
    </div>

    <template v-else>
      <PageHeader eyebrow="Mismatch queue" :title="`${match.home.tag} vs ${match.away.tag}`">
        <template #actions>
          <UiButton :to="`/matches/${match.id}`" variant="secondary" size="sm">Match page</UiButton>
          <UiButton to="/admin/mismatches" variant="ghost" size="sm">Queue</UiButton>
        </template>
      </PageHeader>

      <div class="flex flex-col gap-8 px-4 py-8 sm:px-6">
        <p class="text-sm text-muted">
          {{ match.home.name }} (home) vs {{ match.away.name }} (away) · {{ weekLabel(match.week) }} · <LeagueTime :iso="match.scheduledAt" /> ·
          <UiBadge :variant="match.status === 'confirmed' ? 'win' : match.status === 'disputed' ? 'loss' : 'neutral'">{{ match.status }}</UiBadge>
        </p>

        <div v-if="recused" class="flex flex-col gap-2">
          <RecusedNotice />
          <p class="text-sm text-muted">Another admin has to settle this match.</p>
        </div>

        <template v-else>
          <!-- Open fields -->
          <section aria-labelledby="open-title">
            <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 id="open-title" class="eyebrow text-accent">To settle ({{ open.length }})</h2>
              <p class="text-xs text-muted">
                Keys: <kbd class="kbd">1</kbd> {{ match.home.tag }} value · <kbd class="kbd">2</kbd> {{ match.away.tag }} value ·
                <kbd class="kbd">E</kbd> enter a value · <kbd class="kbd">N</kbd> next
              </p>
            </div>
            <p v-if="!open.length" class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">Everything on this match is settled.</p>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="(r, i) in open"
                :id="`mm-${r.id}`"
                :key="r.id"
                class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-surface px-4 py-3"
                :class="i === active ? 'border-accent' : 'border-line'"
                @click="active = i"
              >
                <span class="min-w-40 flex-1">
                  <span class="block text-sm font-medium">Map {{ r.mapNumber }} · {{ r.kind === 'player_stat' ? r.player ?? 'Player' : 'Map' }}</span>
                  <span class="text-xs text-muted">{{ FIELD[r.field] ?? r.field }}</span>
                </span>
                <span class="tnum grid grid-cols-2 gap-4 text-sm">
                  <span><span class="eyebrow block text-muted">{{ match.home.tag }}</span>{{ show(r, r.homeValue) }}</span>
                  <span><span class="eyebrow block text-muted">{{ match.away.tag }}</span>{{ show(r, r.awayValue) }}</span>
                </span>
                <span v-if="editing !== r.id" class="flex flex-wrap gap-2">
                  <UiButton size="sm" variant="secondary" :disabled="busy" @click="settle(r, 'home')">Use {{ match.home.tag }} value</UiButton>
                  <UiButton size="sm" variant="secondary" :disabled="busy" @click="settle(r, 'away')">Use {{ match.away.tag }} value</UiButton>
                  <UiButton size="sm" variant="ghost" :disabled="busy" @click="startEdit(r)">Enter value</UiButton>
                </span>
                <form v-else class="flex flex-wrap items-end gap-2" @submit.prevent="settle(r, 'custom', custom)">
                  <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted">{{ FIELD[r.field] ?? r.field }}</span>
                    <select v-if="r.field === 'mode'" :id="`mm-input-${r.id}`" v-model="custom" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm">
                      <option value="">Choose…</option>
                      <option v-for="m in modes" :key="m.id" :value="m.name">{{ m.name }}</option>
                    </select>
                    <select v-else-if="r.field === 'map'" :id="`mm-input-${r.id}`" v-model="custom" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm">
                      <option value="">Choose…</option>
                      <option v-for="m in maps" :key="m.id" :value="m.name">{{ m.name }}</option>
                    </select>
                    <select v-else-if="r.field === 'played'" :id="`mm-input-${r.id}`" v-model="custom" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm">
                      <option value="">Choose…</option>
                      <template v-if="r.kind === 'map_score'"><option value="played">Played</option><option value="not reported">Not played</option></template>
                      <template v-else><option value="listed">Played</option><option value="not listed">Didn’t play</option></template>
                    </select>
                    <select v-else-if="r.field === 'team'" :id="`mm-input-${r.id}`" v-model="custom" class="h-9 rounded-md border border-line-strong bg-surface-2 px-2 text-sm">
                      <option :value="match.home.id">{{ match.home.tag }}</option>
                      <option :value="match.away.id">{{ match.away.tag }}</option>
                    </select>
                    <input v-else :id="`mm-input-${r.id}`" v-model="custom" inputmode="numeric" class="tnum h-9 w-28 rounded-md border border-line-strong bg-surface-2 px-2 text-sm" />
                  </label>
                  <UiButton type="submit" size="sm" :disabled="busy || !custom">Save</UiButton>
                  <UiButton size="sm" variant="ghost" @click="editing = null">Cancel</UiButton>
                </form>
              </li>
            </ul>
            <div class="mt-3"><PublicLogNotice /></div>
          </section>

          <!-- Both reports, side by side, per map -->
          <section aria-labelledby="reports-title" class="flex flex-col gap-6">
            <h2 id="reports-title" class="eyebrow text-accent">Both reports</h2>
            <article v-for="n in mapNumbers" :key="n" class="rounded-lg border border-line bg-surface p-4" :aria-labelledby="`rep-map-${n}`">
              <h3 :id="`rep-map-${n}`" class="font-heading text-lg">Map {{ n }}</h3>
              <div class="mt-3 grid gap-4 md:grid-cols-2">
                <div v-for="side in (['home', 'away'] as const)" :key="side">
                  <p class="eyebrow text-muted">{{ side === 'home' ? match.home.tag : match.away.tag }} report</p>
                  <template v-if="reports[side]?.maps[n - 1]">
                    <p class="mt-1 text-sm">
                      {{ modeName(reports[side]?.maps[n - 1]?.mode_id) }} · {{ mapName(reports[side]?.maps[n - 1]?.map_id) }} ·
                      <span class="tnum font-heading">{{ reports[side]?.maps[n - 1]?.home_score }} – {{ reports[side]?.maps[n - 1]?.away_score }}</span>
                    </p>
                  </template>
                  <p v-else class="mt-1 text-sm text-loss">Not reported</p>
                </div>
              </div>
              <div class="mt-3 overflow-x-auto">
                <table class="w-full min-w-[32rem] text-sm">
                  <caption class="sr-only">Map {{ n }} player stats from both reports</caption>
                  <thead>
                    <tr class="border-b border-line text-left">
                      <th scope="col" class="eyebrow py-2 pr-3 text-muted">Player</th>
                      <th scope="col" class="eyebrow px-2 py-2 text-right text-muted">K ({{ match.home.tag }} / {{ match.away.tag }})</th>
                      <th scope="col" class="eyebrow px-2 py-2 text-right text-muted">D</th>
                      <th scope="col" class="eyebrow px-2 py-2 text-right text-muted">Score</th>
                      <th scope="col" class="eyebrow px-2 py-2 text-right text-muted">K/D</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="uid in players(n)" :key="uid" class="border-b border-line last:border-b-0">
                      <th scope="row" class="py-1.5 pr-3 text-left font-normal">{{ names[uid] ?? 'Player' }} <span class="text-xs text-muted">{{ teamTag(line('home', n, uid)?.team_id ?? line('away', n, uid)?.team_id) }}</span></th>
                      <td v-for="f in (['kills', 'deaths', 'score'] as const)" :key="f" class="tnum px-2 py-1.5 text-right" :class="differs(n, uid, f) ? 'bg-loss-soft text-loss' : ''">
                        {{ line('home', n, uid)?.[f] ?? '—' }} / {{ line('away', n, uid)?.[f] ?? '—' }}
                      </td>
                      <td class="tnum px-2 py-1.5 text-right text-muted">{{ kd(line('home', n, uid)?.kills ?? null, line('home', n, uid)?.deaths ?? null) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="mt-3">
                <p class="eyebrow mb-2 text-muted">Screenshots (both teams)</p>
                <ScreenshotViewer :images="shots(n)" :label="`Map ${n} screenshots`" />
              </div>
            </article>
          </section>

          <section v-if="settled.length" aria-labelledby="done-title">
            <h2 id="done-title" class="eyebrow mb-3 text-muted">Settled ({{ settled.length }})</h2>
            <ul class="flex flex-col gap-1 text-sm text-muted">
              <li v-for="r in settled" :key="r.id">
                Map {{ r.mapNumber }} · {{ r.kind === 'player_stat' ? r.player : 'Map' }} · {{ FIELD[r.field] ?? r.field }} → <span class="text-text">{{ show(r, r.resolvedValue) }}</span>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kbd {
  border: 1px solid var(--color-line-strong);
  border-radius: 0.25rem;
  padding: 0 0.3rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
  color: var(--color-text);
}
</style>

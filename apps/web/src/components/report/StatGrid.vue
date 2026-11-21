<script setup lang="ts">
import { computed, ref } from 'vue'
import { kd, parsePastedRow, parseStat, PLAYERS_PER_SIDE, STAT_FIELDS, type PlayerRow, type StatField } from '@/lib/reporting'
import type { RosterOption } from '@/composables/useReport'

/**
 * Player stats for one map: 4 rows per team. Keyboard-first: Enter moves to the next cell like Tab,
 * arrow keys move between cells, and pasting a spreadsheet row (or several rows) fills across.
 */
const props = defineProps<{
  mapNumber: number
  homeTeam: { id: string; tag: string; name: string }
  awayTeam: { id: string; tag: string; name: string }
  roster: RosterOption[]
}>()

const rows = defineModel<PlayerRow[]>({ required: true })
const grid = ref<HTMLElement | null>(null)

const FIELD_LABEL: Record<StatField, string> = { kills: 'Kills', deaths: 'Deaths', score: 'Score' }
const COLS = STAT_FIELDS.length + 1 // player select + stats

const sections = computed(() => [
  { team: props.homeTeam, start: 0 },
  { team: props.awayTeam, start: PLAYERS_PER_SIDE },
])

function optionsFor(teamId: string, rowIndex: number) {
  const taken = new Set(rows.value.filter((_, i) => i !== rowIndex).map((r) => r.userId).filter(Boolean))
  return props.roster
    .filter((r) => r.teamId === teamId)
    .map((r) => ({ value: r.userId, label: r.sub ? `${r.name} (sub)` : r.name, disabled: taken.has(r.userId) }))
}

function nameOf(userId: string) {
  return props.roster.find((r) => r.userId === userId)?.name ?? 'Player'
}

function update(rowIndex: number, patch: Partial<PlayerRow>) {
  rows.value = rows.value.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r))
}

const invalid = ref(new Set<string>())
function onInput(rowIndex: number, field: StatField, raw: string) {
  const value = parseStat(raw)
  const key = `${rowIndex}:${field}`
  const next = new Set(invalid.value)
  if (value === undefined) next.add(key)
  else {
    next.delete(key)
    update(rowIndex, { [field]: value })
  }
  invalid.value = next
}

function focusCell(row: number, col: number) {
  const r = Math.max(0, Math.min(rows.value.length - 1, row))
  const c = Math.max(0, Math.min(COLS - 1, col))
  const el = grid.value?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)
  el?.focus()
  if (el instanceof HTMLInputElement) el.select()
}

function onKeydown(e: KeyboardEvent, row: number, col: number) {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  const isInput = el instanceof HTMLInputElement
  const atStart = !isInput || (el.selectionStart === 0 && el.selectionEnd === 0)
  const atEnd = !isInput || el.selectionStart === el.value.length
  switch (e.key) {
    case 'Enter': {
      e.preventDefault()
      const next = row * COLS + col + (e.shiftKey ? -1 : 1)
      focusCell(Math.floor(next / COLS), next % COLS)
      break
    }
    case 'ArrowDown':
      if (isInput) {
        e.preventDefault()
        focusCell(row + 1, col)
      }
      break
    case 'ArrowUp':
      if (isInput) {
        e.preventDefault()
        focusCell(row - 1, col)
      }
      break
    case 'ArrowRight':
      if (isInput && atEnd) {
        e.preventDefault()
        focusCell(row, col + 1)
      }
      break
    case 'ArrowLeft':
      if (isInput && atStart) {
        e.preventDefault()
        focusCell(row, col - 1)
      }
      break
  }
}

/** Paste "24  18  3400" (one row) or several lines: fills from this cell across and down. */
function onPaste(e: ClipboardEvent, row: number, fieldIndex: number) {
  const text = e.clipboardData?.getData('text') ?? ''
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const parsed = lines.map(parsePastedRow)
  if (!parsed.length || parsed.some((p) => !p) || (parsed.length === 1 && parsed[0]!.length === 1)) return
  e.preventDefault()
  let next = rows.value
  parsed.forEach((nums, li) => {
    const target = row + li
    if (target >= next.length || !nums) return
    const patch: Partial<PlayerRow> = {}
    nums.forEach((n, ni) => {
      const field = STAT_FIELDS[fieldIndex + ni]
      if (field) patch[field] = n
    })
    next = next.map((r, i) => (i === target ? { ...r, ...patch } : r))
  })
  rows.value = next
}
</script>

<template>
  <div ref="grid" class="overflow-x-auto rounded-md border border-line">
    <table class="w-full min-w-[34rem] text-sm">
      <caption class="sr-only">Map {{ mapNumber }} player stats</caption>
      <thead>
        <tr class="border-b border-line bg-surface-2 text-left">
          <th scope="col" class="eyebrow px-3 py-2 text-muted">Player</th>
          <th v-for="f in STAT_FIELDS" :key="f" scope="col" class="eyebrow w-24 px-2 py-2 text-right text-muted">{{ FIELD_LABEL[f] }}</th>
          <th scope="col" class="eyebrow w-16 px-3 py-2 text-right text-muted">K/D</th>
        </tr>
      </thead>
      <tbody v-for="s in sections" :key="s.team.id">
        <tr>
          <th colspan="5" scope="colgroup" class="border-b border-line bg-surface px-3 pt-3 pb-1 text-left font-heading text-xs tracking-wider text-gold">
            {{ s.team.tag }} <span class="text-muted">{{ s.team.name }}</span>
          </th>
        </tr>
        <tr v-for="offset in PLAYERS_PER_SIDE" :key="offset" class="border-b border-line last:border-b-0">
          <td class="px-2 py-1.5">
            <select
              :value="rows[s.start + offset - 1]?.userId ?? ''"
              :data-cell="`${s.start + offset - 1}:0`"
              :aria-label="`Map ${mapNumber}, ${s.team.tag} player ${offset}`"
              class="h-9 w-full min-w-40 rounded-sm border border-line-strong bg-surface-2 px-2 text-sm focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-gold"
              @change="update(s.start + offset - 1, { userId: ($event.target as HTMLSelectElement).value })"
              @keydown="onKeydown($event, s.start + offset - 1, 0)"
            >
              <option value="">Choose player…</option>
              <option v-for="o in optionsFor(s.team.id, s.start + offset - 1)" :key="o.value" :value="o.value" :disabled="o.disabled">
                {{ o.label }}
              </option>
            </select>
          </td>
          <td v-for="(f, fi) in STAT_FIELDS" :key="f" class="px-1 py-1.5">
            <input
              :value="rows[s.start + offset - 1]?.[f] ?? ''"
              :data-cell="`${s.start + offset - 1}:${fi + 1}`"
              :aria-label="`Map ${mapNumber}, ${rows[s.start + offset - 1]?.userId ? nameOf(rows[s.start + offset - 1]!.userId) : `${s.team.tag} player ${offset}`}, ${FIELD_LABEL[f]}`"
              :aria-invalid="invalid.has(`${s.start + offset - 1}:${f}`) || undefined"
              inputmode="numeric"
              autocomplete="off"
              class="tnum h-9 w-full rounded-sm border bg-surface-2 px-2 text-right focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-gold"
              :class="invalid.has(`${s.start + offset - 1}:${f}`) ? 'border-loss' : 'border-line-strong'"
              @input="onInput(s.start + offset - 1, f, ($event.target as HTMLInputElement).value)"
              @keydown="onKeydown($event, s.start + offset - 1, fi + 1)"
              @paste="onPaste($event, s.start + offset - 1, fi)"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </td>
          <td class="tnum px-3 py-1.5 text-right text-muted">
            {{ kd(rows[s.start + offset - 1]?.kills ?? null, rows[s.start + offset - 1]?.deaths ?? null) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

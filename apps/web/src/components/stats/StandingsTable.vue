<script setup lang="ts">
import TeamLogo from '@/components/ui/TeamLogo.vue'
import type { StandingRow } from '@/composables/useStats'

defineProps<{
  rows: StandingRow[]
  /** Draw the playoff line after this many teams (0 = none). */
  cutoff: number
  caption: string
  compact?: boolean
}>()
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-line bg-surface">
    <table class="w-full text-sm">
      <caption class="sr-only">{{ caption }}</caption>
      <thead>
        <tr class="border-b border-line">
          <th scope="col" class="eyebrow w-10 px-3 py-3 text-right text-muted">#</th>
          <th scope="col" class="eyebrow px-3 py-3 text-left text-muted">Team</th>
          <th scope="col" class="eyebrow px-3 py-3 text-right text-muted" title="Series wins and losses">W–L</th>
          <th v-if="!compact" scope="col" class="eyebrow hidden px-3 py-3 text-right text-muted sm:table-cell" title="Maps won and lost">Maps</th>
          <th scope="col" class="eyebrow px-3 py-3 text-right text-muted" title="Map differential">+/-</th>
          <th v-if="!compact" scope="col" class="eyebrow hidden px-3 py-3 text-left text-muted md:table-cell">Last 5</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(r, i) in rows" :key="r.team_id">
          <tr class="border-b border-line hover:bg-surface-2" :class="i + 1 === cutoff ? 'border-b-2 border-b-gold-dim' : ''">
            <td class="tnum px-3 py-3 text-right font-mono" :class="i < cutoff ? 'text-gold' : 'text-muted'">{{ r.rank }}</td>
            <td class="px-3 py-3">
              <RouterLink :to="`/teams/${r.team_id}`" class="flex items-center gap-3 hover:text-gold">
                <TeamLogo :tag="r.tag" :name="r.name" :logo-url="r.logo_url" size="sm" decorative />
                <span class="truncate font-medium">{{ r.name }}</span>
                <span v-if="r.needs_admin_decision" class="text-xs text-gold" title="Still tied after every tiebreak; league staff decide the order">*</span>
              </RouterLink>
            </td>
            <td class="tnum px-3 py-3 text-right font-medium">{{ r.wins }}–{{ r.losses }}</td>
            <td v-if="!compact" class="tnum hidden px-3 py-3 text-right text-muted sm:table-cell">{{ r.maps_won }}–{{ r.maps_lost }}</td>
            <td class="tnum px-3 py-3 text-right" :class="r.map_diff > 0 ? 'text-win' : r.map_diff < 0 ? 'text-loss' : 'text-muted'">
              {{ r.map_diff > 0 ? `+${r.map_diff}` : r.map_diff }}
            </td>
            <td v-if="!compact" class="hidden px-3 py-3 md:table-cell">
              <span class="flex gap-1" :aria-label="r.last5.length ? `Last ${r.last5.length}: ${r.last5.join(' ')}` : 'No results yet'">
                <span
                  v-for="(x, j) in r.last5"
                  :key="j"
                  class="grid size-5 place-items-center rounded-sm font-heading text-[0.65rem]"
                  :class="x === 'W' ? 'bg-win-soft text-win' : 'bg-loss-soft text-loss'"
                  aria-hidden="true"
                >{{ x }}</span>
                <span v-if="!r.last5.length" class="text-faint" aria-hidden="true">—</span>
              </span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

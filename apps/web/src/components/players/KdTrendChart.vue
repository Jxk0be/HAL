<script setup lang="ts">
import { computed } from 'vue'
import { trendPoints, type WeekLine } from '@/lib/playerStats'
import { weekLabel } from '@/lib/preseason'

/** K/D by week as a small line chart (plain SVG), with the numbers as a list for screen readers. */
const props = withDefaults(defineProps<{ weeks: WeekLine[]; color?: string }>(), { color: 'var(--color-accent)' })

const W = 600
const H = 180
const chart = computed(() => trendPoints(props.weeks, W, H, 16))
const path = computed(() => chart.value.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
/** Where K/D 1.0 sits. */
const evenY = computed(() => 16 + (1 - 1 / chart.value.max) * (H - 32))
</script>

<template>
  <figure class="flex flex-col gap-2">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full overflow-visible" role="img" :aria-label="`K/D by week, ${weeks.length} weeks`">
      <line x1="16" :x2="W - 16" :y1="evenY" :y2="evenY" stroke="var(--color-line-strong)" stroke-dasharray="4 4" />
      <text :x="W - 16" :y="evenY - 6" text-anchor="end" class="fill-[var(--color-faint)] text-[11px]">1.00</text>
      <path v-if="chart.points.length > 1" :d="path" fill="none" :stroke="color" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <g v-for="p in chart.points" :key="p.week">
        <circle :cx="p.x" :cy="p.y" r="4.5" :fill="color" />
        <text :x="p.x" :y="H" text-anchor="middle" class="fill-[var(--color-muted)] text-[11px]">W{{ p.week }}</text>
      </g>
    </svg>
    <figcaption class="sr-only">
      <ul>
        <li v-for="p in chart.points" :key="p.week">{{ weekLabel(p.week) }}: {{ p.value.toFixed(2) }} K/D</li>
      </ul>
    </figcaption>
  </figure>
</template>

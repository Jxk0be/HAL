<script setup lang="ts" generic="T extends { key: string }">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  /** Up to 3 entries, best first. */
  entries: readonly (T & { name: string; meta?: string; to?: RouteLocationRaw })[]
  label?: string
}>()

/** Desktop order #2, #1, #3; phones stack #1, #2, #3 (CSS order). */
const slots = computed(() =>
  props.entries.slice(0, 3).map((e, i) => ({ entry: e, rank: i + 1 })),
)
const orderClass = (rank: number) =>
  rank === 1 ? 'sm:order-2 sm:-mt-4' : rank === 2 ? 'sm:order-1 sm:mt-4' : 'sm:order-3 sm:mt-4'
</script>

<template>
  <ol :aria-label="label ?? 'Top 3'" class="grid gap-3 sm:grid-cols-3 sm:items-start">
    <li
      v-for="s in slots"
      :key="s.entry.key"
      class="texture-stripes card-accent relative overflow-hidden rounded-xl border border-line bg-surface p-5"
      :class="orderClass(s.rank)"
      :style="s.rank === 1 ? undefined : { '--card-accent': 'var(--color-line-strong)' }"
    >
      <div class="flex items-start justify-between gap-3">
        <span
          class="tnum font-heading text-5xl leading-none"
          :class="s.rank === 1 ? 'text-accent' : 'text-faint'"
          :aria-label="`Rank ${s.rank}`"
          >#{{ s.rank }}</span
        >
        <slot name="corner" :entry="s.entry" :rank="s.rank" />
      </div>
      <div class="mt-4 flex items-center gap-3">
        <slot name="media" :entry="s.entry" :rank="s.rank" />
        <div class="min-w-0">
          <component
            :is="s.entry.to ? 'RouterLink' : 'p'"
            :to="s.entry.to"
            class="block truncate font-heading text-xl text-text"
            :class="s.entry.to ? 'hover:text-accent' : ''"
            >{{ s.entry.name }}</component
          >
          <p v-if="s.entry.meta" class="truncate text-sm text-muted">{{ s.entry.meta }}</p>
        </div>
      </div>
      <slot name="stat" :entry="s.entry" :rank="s.rank" />
    </li>
  </ol>
</template>

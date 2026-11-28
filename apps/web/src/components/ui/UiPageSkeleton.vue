<script setup lang="ts">
import type { PageSkeletonVariant } from './types'

/**
 * Generic loading placeholders shaped like the common page layouts:
 *  - list:   rows with an avatar and two lines, in a bordered panel
 *  - cards:  a responsive grid of cards
 *  - table:  a header row plus rows
 *  - detail: a full-bleed banner hero, tabs and a two-column body (team, player, season pages)
 *  - form:   labeled fields and a button
 *  - panel:  a main column of cards beside a sidebar
 *  - tiles:  a row of stat tiles above a list
 * Decorative only: UiLoadGate supplies the role="status" wrapper and screen reader text.
 */
withDefaults(defineProps<{ variant?: PageSkeletonVariant; count?: number }>(), { variant: 'list' })
</script>

<template>
  <div aria-hidden="true">
    <div v-if="variant === 'list'" class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <div v-for="n in count ?? 6" :key="n" class="flex items-center gap-3 px-4 py-3.5">
        <div class="skeleton size-9 shrink-0 rounded-full" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="skeleton h-3.5 rounded-sm" :class="n % 3 === 0 ? 'w-1/3' : n % 2 ? 'w-1/2' : 'w-2/5'" />
          <div class="skeleton h-3 w-1/4 rounded-sm opacity-60" />
        </div>
        <div class="skeleton hidden h-6 w-16 sm:block" />
      </div>
    </div>

    <div v-else-if="variant === 'cards'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="n in count ?? 6" :key="n" class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div class="flex items-center gap-3">
          <div class="skeleton size-11 shrink-0 rounded-lg" />
          <div class="flex flex-1 flex-col gap-2">
            <div class="skeleton h-4 w-2/3 rounded-sm" />
            <div class="skeleton h-3 w-1/3 rounded-sm opacity-60" />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="skeleton h-3 w-full rounded-sm" />
          <div class="skeleton h-3 w-4/5 rounded-sm" />
        </div>
        <div class="mt-1 flex justify-end"><div class="skeleton h-8 w-24" /></div>
      </div>
    </div>

    <div v-else-if="variant === 'table'" class="overflow-hidden rounded-lg border border-line bg-surface">
      <div class="flex gap-4 border-b border-line bg-surface-2 px-4 py-3">
        <div class="skeleton h-3 w-8 rounded-sm" />
        <div class="skeleton h-3 w-32 rounded-sm" />
        <div class="ml-auto skeleton h-3 w-12 rounded-sm" />
        <div class="hidden skeleton h-3 w-12 rounded-sm sm:block" />
        <div class="hidden skeleton h-3 w-12 rounded-sm sm:block" />
      </div>
      <div v-for="n in count ?? 8" :key="n" class="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
        <div class="skeleton h-4 w-8 rounded-sm" />
        <div class="skeleton size-7 shrink-0 rounded-md" />
        <div class="skeleton h-4 rounded-sm" :class="n % 2 ? 'w-40' : 'w-28'" />
        <div class="ml-auto skeleton h-4 w-12 rounded-sm" />
        <div class="hidden skeleton h-4 w-12 rounded-sm sm:block" />
        <div class="hidden skeleton h-4 w-12 rounded-sm sm:block" />
      </div>
    </div>

    <div v-else-if="variant === 'detail'">
      <div class="skeleton aspect-[3/1] max-h-72 w-full rounded-none sm:aspect-[5/1]" />
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <div class="-mt-10 flex items-end gap-4">
          <div class="skeleton size-20 shrink-0 rounded-xl border-4 border-bg sm:size-24" />
          <div class="flex flex-1 flex-col gap-2 pb-1">
            <div class="skeleton h-3 w-32 rounded-sm" />
            <div class="skeleton h-8 w-3/5 max-w-sm" />
          </div>
        </div>
        <div class="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <div v-for="n in 4" :key="n" class="flex flex-col gap-2 bg-surface p-4">
            <div class="skeleton h-3 w-16 rounded-sm" />
            <div class="skeleton h-7 w-12" />
          </div>
        </div>
        <div class="mt-8 flex gap-6 border-b border-line pb-3">
          <div v-for="n in 4" :key="n" class="skeleton h-4 w-16 rounded-sm" />
        </div>
        <div class="mt-6 grid gap-6 pb-14 lg:grid-cols-[1fr_22rem]">
          <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <div v-for="n in 5" :key="n" class="flex items-center gap-3">
              <div class="skeleton size-9 shrink-0 rounded-full" />
              <div class="skeleton h-4 rounded-sm" :class="n % 2 ? 'w-1/2' : 'w-1/3'" />
            </div>
          </div>
          <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <div class="skeleton h-4 w-24 rounded-sm" />
            <div class="skeleton h-3 w-full rounded-sm" />
            <div class="skeleton h-3 w-4/5 rounded-sm" />
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="variant === 'form'" class="flex max-w-2xl flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div v-for="n in count ?? 4" :key="n" class="flex flex-col gap-2">
        <div class="skeleton h-3 w-28 rounded-sm" />
        <div class="skeleton h-11 w-full" />
      </div>
      <div class="skeleton h-11 w-36" />
    </div>

    <div v-else-if="variant === 'panel'" class="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div class="flex flex-col gap-6">
        <div v-for="n in count ?? 2" :key="n" class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <div class="skeleton h-3 w-20 rounded-sm" />
          <div class="skeleton h-6 w-1/2" />
          <div class="skeleton mt-2 h-3 w-full rounded-sm" />
          <div class="skeleton h-3 w-5/6 rounded-sm" />
          <div class="skeleton h-3 w-2/3 rounded-sm" />
        </div>
      </div>
      <div class="flex flex-col gap-6">
        <div v-for="n in 2" :key="n" class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <div class="skeleton h-3 w-20 rounded-sm" />
          <div class="skeleton h-3 w-full rounded-sm" />
          <div class="skeleton h-3 w-3/4 rounded-sm" />
        </div>
      </div>
    </div>

    <div v-else-if="variant === 'tiles'" class="flex flex-col gap-6">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div v-for="n in 4" :key="n" class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div class="skeleton h-3 w-20 rounded-sm" />
          <div class="skeleton h-8 w-14" />
        </div>
      </div>
      <div class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <div v-for="n in count ?? 4" :key="n" class="flex items-center gap-3 px-4 py-3.5">
          <div class="skeleton h-4 rounded-sm" :class="n % 2 ? 'w-1/2' : 'w-1/3'" />
          <div class="ml-auto skeleton h-4 w-16 rounded-sm" />
        </div>
      </div>
    </div>
  </div>
</template>

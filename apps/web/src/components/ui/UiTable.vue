<script setup lang="ts" generic="Row extends Record<string, unknown>">
import { computed } from 'vue'
import type { TableColumn, TableSort } from './types'

const props = defineProps<{
  columns: readonly TableColumn[]
  rows: readonly Row[]
  rowKey: keyof Row & string
  caption: string
  /** Show the caption visually (it is always available to screen readers). */
  showCaption?: boolean
  /** Sort rows client-side by the current sort. Off when the parent sorts. */
  sortRows?: boolean
}>()

const sort = defineModel<TableSort | null>('sort', { default: null })

function toggle(col: TableColumn) {
  if (!col.sortable) return
  if (sort.value?.key !== col.key) {
    sort.value = { key: col.key, dir: col.numeric ? 'desc' : 'asc' }
  } else {
    sort.value = { key: col.key, dir: sort.value.dir === 'asc' ? 'desc' : 'asc' }
  }
}

const displayRows = computed(() => {
  const s = sort.value
  if (!props.sortRows || !s) return props.rows
  const factor = s.dir === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const av = a[s.key]
    const bv = b[s.key]
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv)) * factor
  })
})

function ariaSort(col: TableColumn) {
  if (!col.sortable) return undefined
  if (sort.value?.key !== col.key) return 'none'
  return sort.value.dir === 'asc' ? 'ascending' : 'descending'
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-line bg-surface">
    <table class="w-full border-collapse text-sm">
      <caption
        class="px-4 pt-4 pb-2 text-left font-heading text-base"
        :class="showCaption ? '' : 'sr-only'"
      >
        {{ caption }}
      </caption>
      <thead>
        <tr class="border-b border-line">
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            :aria-sort="ariaSort(col)"
            class="eyebrow px-4 py-3 font-semibold text-muted"
            :class="[
              col.numeric ? 'text-right' : 'text-left',
              col.hideOnMobile ? 'hidden sm:table-cell' : '',
              col.class,
            ]"
          >
            <button
              v-if="col.sortable"
              type="button"
              class="inline-flex items-center gap-1 tracking-[inherit] uppercase hover:text-text"
              :class="sort?.key === col.key ? 'text-accent' : ''"
              @click="toggle(col)"
            >
              {{ col.label }}
              <svg viewBox="0 0 10 10" class="size-2.5" aria-hidden="true">
                <path
                  v-if="sort?.key !== col.key || sort.dir === 'asc'"
                  d="M5 2l3 3H2z"
                  fill="currentColor"
                  :opacity="sort?.key === col.key ? 1 : 0.4"
                />
                <path
                  v-if="sort?.key !== col.key || sort.dir === 'desc'"
                  d="M5 8L2 5h6z"
                  fill="currentColor"
                  :opacity="sort?.key === col.key ? 1 : 0.4"
                />
              </svg>
            </button>
            <template v-else>{{ col.label }}</template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in displayRows"
          :key="String(row[rowKey])"
          class="border-b border-line last:border-b-0 hover:bg-surface-2"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3"
            :class="[
              col.numeric ? 'tnum text-right' : 'text-left',
              col.hideOnMobile ? 'hidden sm:table-cell' : '',
              col.class,
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]" :index="index">
              {{ row[col.key] ?? '—' }}
            </slot>
          </td>
        </tr>
        <tr v-if="displayRows.length === 0">
          <td :colspan="columns.length" class="px-4 py-8 text-center text-muted">
            <slot name="empty">Nothing here yet.</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

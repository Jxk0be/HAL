<script setup lang="ts" generic="T extends string">
import { useId, useTemplateRef } from 'vue'

const props = defineProps<{
  tabs: readonly { value: T; label: string; count?: number }[]
  /** Accessible name for the tab list. */
  label: string
}>()

const model = defineModel<T>({ required: true })
const id = useId()
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

function select(index: number) {
  const tab = props.tabs[index]
  if (!tab) return
  model.value = tab.value
  buttons.value?.[index]?.focus()
}

function onKeydown(e: KeyboardEvent, index: number) {
  const last = props.tabs.length - 1
  const next =
    e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
    : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
    : e.key === 'Home' ? 0
    : e.key === 'End' ? last
    : null
  if (next === null) return
  e.preventDefault()
  select(next)
}
</script>

<template>
  <div>
    <div
      role="tablist"
      :aria-label="label"
      class="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      <button
        v-for="(tab, i) in tabs"
        :id="`${id}-tab-${tab.value}`"
        ref="buttons"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="model === tab.value"
        :aria-controls="`${id}-panel`"
        :tabindex="model === tab.value ? 0 : -1"
        class="-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 font-heading text-sm tracking-wider transition-colors"
        :class="
          model === tab.value
            ? 'border-accent text-text'
            : 'border-transparent text-muted hover:text-text'
        "
        @click="select(i)"
        @keydown="onKeydown($event, i)"
      >
        {{ tab.label }}
        <span v-if="tab.count !== undefined" class="tnum text-xs text-muted">{{ tab.count }}</span>
      </button>
    </div>
    <div
      :id="`${id}-panel`"
      role="tabpanel"
      :aria-labelledby="`${id}-tab-${model}`"
      tabindex="0"
      class="pt-4 focus-visible:outline-offset-4"
    >
      <slot :active="model" />
    </div>
  </div>
</template>

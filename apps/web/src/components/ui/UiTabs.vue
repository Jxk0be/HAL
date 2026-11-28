<script setup lang="ts" generic="T extends string">
import { onMounted, useId, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tabFromHash } from './tabsHash'

const props = withDefaults(
  defineProps<{
    tabs: readonly { value: T; label: string; count?: number }[]
    /** Accessible name for the tab list. */
    label: string
    /** 'underline' (default) or rounded 'pill' chips. */
    variant?: 'underline' | 'pill'
    /** Keep the selected tab in the URL hash (#value). */
    hashSync?: boolean
  }>(),
  { variant: 'underline' },
)

const model = defineModel<T>({ required: true })
const id = useId()
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')
const route = useRoute()
const router = useRouter()

function select(index: number) {
  const tab = props.tabs[index]
  if (!tab) return
  model.value = tab.value
  buttons.value?.[index]?.focus()
  buttons.value?.[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
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

function fromHash() {
  const v = tabFromHash(route.hash, props.tabs.map((t) => t.value))
  if (v && v !== model.value) model.value = v
}

if (props.hashSync) {
  onMounted(fromHash)
  watch(() => route.hash, fromHash)
  watch(model, (v) => {
    if (route.hash !== `#${v}`) void router.replace({ hash: `#${v}`, query: route.query })
  })
}

// Ids built from tab values; CSS.escape keeps them safe when used as selectors elsewhere.
const tabId = (v: string) => `${id}-tab-${v}`
</script>

<template>
  <div>
    <div
      role="tablist"
      :aria-label="label"
      class="flex overflow-x-auto [scrollbar-width:none]"
      :class="variant === 'pill' ? 'gap-2 pb-1' : 'gap-1 border-b border-line'"
    >
      <button
        v-for="(tab, i) in tabs"
        :id="tabId(tab.value)"
        ref="buttons"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="model === tab.value"
        :aria-controls="`${id}-panel`"
        :tabindex="model === tab.value ? 0 : -1"
        class="flex shrink-0 items-center gap-2 font-heading text-sm tracking-wider whitespace-nowrap uppercase transition-colors"
        :class="
          variant === 'pill'
            ? [
                'h-9 rounded-full px-4',
                model === tab.value ? 'bg-brand text-on-brand' : 'bg-chip text-muted hover:text-text',
              ]
            : [
                '-mb-px border-b-2 px-3 py-2.5',
                model === tab.value ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
              ]
        "
        @click="select(i)"
        @keydown="onKeydown($event, i)"
      >
        {{ tab.label }}
        <span
          v-if="tab.count !== undefined"
          class="tnum text-xs"
          :class="variant === 'pill' && model === tab.value ? 'text-on-brand/80' : 'text-muted'"
          >{{ tab.count }}</span
        >
      </button>
    </div>
    <div
      :id="`${id}-panel`"
      role="tabpanel"
      :aria-labelledby="tabId(model)"
      tabindex="0"
      class="pt-4 focus-visible:outline-offset-4"
    >
      <slot :active="model" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    type?: string
    placeholder?: string
    hint?: string
    error?: string
    required?: boolean
    disabled?: boolean
    autocomplete?: string
    /** id of a <datalist> with suggestions. */
    list?: string
    /** Visually hide the label (still read by screen readers). */
    hideLabel?: boolean
  }>(),
  { type: 'text' },
)

const model = defineModel<string>({ default: '' })
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="eyebrow text-muted" :class="hideLabel ? 'sr-only' : ''">
      {{ label }}<span v-if="required" class="text-gold" aria-hidden="true"> *</span>
    </label>
    <div class="relative">
      <span
        v-if="$slots.prefix"
        class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
      >
        <slot name="prefix" />
      </span>
      <input
        :id="id"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :autocomplete="autocomplete"
        :list="list"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error || hint ? `${id}-desc` : undefined"
        class="h-10 w-full rounded-md border bg-surface-2 px-3 text-sm text-text placeholder:text-faint transition-colors focus:border-gold-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-50"
        :class="[error ? 'border-loss' : 'border-line-strong', $slots.prefix ? 'pl-9' : '']"
      />
    </div>
    <p
      v-if="error || hint"
      :id="`${id}-desc`"
      class="text-xs"
      :class="error ? 'text-loss' : 'text-muted'"
    >
      {{ error || hint }}
    </p>
  </div>
</template>

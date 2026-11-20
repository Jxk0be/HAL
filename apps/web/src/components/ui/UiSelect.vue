<script setup lang="ts" generic="T extends string | number">
import { useId } from 'vue'

defineProps<{
  label: string
  options: readonly { value: T; label: string; disabled?: boolean }[]
  placeholder?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  hideLabel?: boolean
}>()

const model = defineModel<T | ''>({ default: '' })
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="eyebrow text-muted" :class="hideLabel ? 'sr-only' : ''">
      {{ label }}<span v-if="required" class="text-gold" aria-hidden="true"> *</span>
    </label>
    <div class="relative">
      <select
        :id="id"
        v-model="model"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error || hint ? `${id}-desc` : undefined"
        class="h-10 w-full appearance-none rounded-md border bg-surface-2 pr-9 pl-3 text-sm text-text transition-colors focus:border-gold-dim focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-50"
        :class="error ? 'border-loss' : 'border-line-strong'"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
          {{ o.label }}
        </option>
      </select>
      <svg
        class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
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

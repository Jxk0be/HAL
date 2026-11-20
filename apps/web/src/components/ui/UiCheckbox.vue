<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  description?: string
  disabled?: boolean
  required?: boolean
  error?: string
}>()

const model = defineModel<boolean>({ default: false })
const id = useId()
</script>

<template>
  <div class="flex gap-3">
    <span class="relative mt-0.5 grid size-5 shrink-0">
      <input
        :id="id"
        v-model="model"
        type="checkbox"
        :disabled="disabled"
        :required="required"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="description || error ? `${id}-desc` : undefined"
        class="peer size-5 cursor-pointer appearance-none rounded-sm border bg-surface-2 transition-colors checked:border-gold checked:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
        :class="error ? 'border-loss' : 'border-line-strong'"
      />
      <svg
        viewBox="0 0 16 16"
        class="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-on-gold peer-checked:block"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <div class="text-sm">
      <label :for="id" class="text-text" :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'">
        {{ label }}<span v-if="required" class="text-gold" aria-hidden="true"> *</span>
      </label>
      <p
        v-if="description || error"
        :id="`${id}-desc`"
        class="mt-0.5"
        :class="error ? 'text-loss' : 'text-muted'"
      >
        {{ error || description }}
      </p>
    </div>
  </div>
</template>

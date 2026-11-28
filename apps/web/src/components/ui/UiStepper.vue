<script setup lang="ts">
import { computed } from 'vue'
import { stepStates } from './stepper'

const props = defineProps<{
  steps: readonly { key: string; label: string }[]
  currentKey?: string | null
  /** Accessible name. */
  label?: string
}>()

const states = computed(() => stepStates(props.steps.map((s) => s.key), props.currentKey))
const currentIndex = computed(() => states.value.indexOf('current'))
const current = computed(() => props.steps[currentIndex.value])
</script>

<template>
  <div>
    <ol role="list" :aria-label="label ?? 'Progress'" class="flex gap-1">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        class="min-w-0 flex-1"
        :aria-current="states[i] === 'current' ? 'step' : undefined"
      >
        <div
          class="relative h-1.5 rounded-full"
          :class="states[i] === 'upcoming' ? 'bg-track' : 'bg-accent'"
        >
          <span
            v-if="states[i] === 'current'"
            class="absolute top-1/2 right-0 size-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent ring-4 ring-accent-soft motion-safe:animate-pulse"
            aria-hidden="true"
          />
        </div>
        <p
          class="mt-2 hidden truncate text-xs sm:block"
          :class="states[i] === 'current' ? 'font-semibold text-text' : states[i] === 'done' ? 'text-muted' : 'text-faint'"
        >
          {{ step.label }}<span class="sr-only">{{ states[i] === 'done' ? ' (done)' : states[i] === 'current' ? ' (current)' : '' }}</span>
        </p>
        <p class="sr-only sm:hidden">{{ step.label }}</p>
      </li>
    </ol>
    <p v-if="current" class="mt-2 text-xs sm:hidden" aria-hidden="true">
      <span class="font-semibold text-text">{{ current.label }}</span>
      <span class="text-faint"> · Step {{ currentIndex + 1 }} of {{ steps.length }}</span>
    </p>
  </div>
</template>

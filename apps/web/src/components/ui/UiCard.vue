<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Small tracked-caps label above the title. */
    eyebrow?: string
    title?: string
    padded?: boolean
    as?: string
  }>(),
  { padded: true, as: 'section' },
)
</script>

<template>
  <component
    :is="as"
    class="rounded-lg border border-line bg-surface shadow-panel"
    :class="padded ? 'p-5 sm:p-6' : ''"
  >
    <header
      v-if="title || eyebrow || $slots.actions"
      class="mb-4 flex items-start justify-between gap-4"
      :class="padded ? '' : 'px-5 pt-5 sm:px-6 sm:pt-6'"
    >
      <div>
        <p v-if="eyebrow" class="eyebrow text-accent">{{ eyebrow }}</p>
        <h2 v-if="title" class="font-heading text-xl text-text">{{ title }}</h2>
      </div>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>

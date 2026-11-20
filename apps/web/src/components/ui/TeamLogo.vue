<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    tag: string
    name?: string
    logoUrl?: string | null
    size?: 'sm' | 'md' | 'lg' | 'xl'
    decorative?: boolean
  }>(),
  { size: 'md' },
)

const failed = ref(false)
watch(
  () => props.logoUrl,
  () => (failed.value = false),
)

const sizes = {
  sm: 'size-8 text-[0.65rem]',
  md: 'size-11 text-xs',
  lg: 'size-16 text-base',
  xl: 'size-24 text-xl',
}
</script>

<template>
  <span
    class="inline-grid shrink-0 place-items-center overflow-hidden rounded-md border border-gold-dim/60 bg-surface-2 font-heading tracking-wider text-gold"
    :class="sizes[size]"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : `${name ?? tag} logo`"
    :aria-hidden="decorative || undefined"
  >
    <img
      v-if="logoUrl && !failed"
      :src="logoUrl"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <template v-else>{{ tag.toUpperCase() }}</template>
  </span>
</template>

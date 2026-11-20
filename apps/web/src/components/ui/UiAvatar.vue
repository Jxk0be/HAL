<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /** Decorative when the name is shown next to it. */
    decorative?: boolean
  }>(),
  { size: 'md' },
)

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const initials = computed(() => {
  const n = (props.name ?? '').trim()
  if (!n) return '?'
  const parts = n.split(/[\s_.-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
})

const sizes = { xs: 'size-6 text-[0.6rem]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl' }
</script>

<template>
  <span
    class="inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface-3 font-heading text-muted"
    :class="sizes[size]"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : name || 'Player'"
    :aria-hidden="decorative || undefined"
  >
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <template v-else>{{ initials }}</template>
  </span>
</template>

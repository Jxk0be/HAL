<script setup lang="ts">
import { computed } from 'vue'
import logoLarge from '@/assets/brand/hal-logo.webp'
import logoSmall from '@/assets/brand/hal-logo-sm.webp'

/**
 * The HAL logo (winged "HAL" with the halo and "Heaven's Arena League" banner). The artwork
 * already contains the league name, so `compact` only exists for older call sites. The logo
 * never animates.
 */
const props = withDefaults(
  defineProps<{
    /** Kept for compatibility: the logo always includes the league name. */
    compact?: boolean
    /** Height in px. */
    size?: number
    /** Decorative when the league name is also given as text nearby. */
    decorative?: boolean
  }>(),
  { size: 36 },
)

/** Width / height of the trimmed artwork. */
const RATIO = 1328 / 1024
const width = computed(() => Math.round(props.size * RATIO))
// The 240px file covers headers and footers at 2x; anything bigger uses the 960px one.
const src = computed(() => (width.value * 2 <= 240 ? logoSmall : logoLarge))
</script>

<template>
  <img
    :src="src"
    :width="width"
    :height="size"
    :alt="decorative ? '' : `Heaven's Arena League`"
    :aria-hidden="decorative || undefined"
    class="inline-block shrink-0 select-none"
    :style="{ height: `${size}px`, width: 'auto' }"
    draggable="false"
    decoding="async"
  />
</template>

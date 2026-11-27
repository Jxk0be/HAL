<script setup lang="ts">
import { computed } from 'vue'
import logoLarge from '@/assets/brand/logo-960.webp'
import logoSmall from '@/assets/brand/logo-480.webp'
import emblem from '@/assets/brand/emblem-192.webp'
import emblemLarge from '@/assets/brand/emblem.png'
import { site } from '@/config/site'

/**
 * The Blackhat logo. Variants:
 *  - full:   the complete artwork (hooded figure with the BLACKHAT / INVITATIONAL LEAGUE banner)
 *  - lockup: the hooded head beside the league name in text (header and menu, where the full
 *            artwork's lettering would be too small to read)
 *  - emblem: the hooded head alone
 * The logo never animates. Files come from scripts/render-brand.py.
 */
const props = withDefaults(
  defineProps<{
    /** Height in px. */
    size?: number
    variant?: 'full' | 'lockup' | 'emblem'
    /** Decorative when the league name is also given as text nearby (e.g. a labeled link). */
    decorative?: boolean
  }>(),
  { size: 36, variant: 'lockup' },
)

/** Width / height of the full artwork. */
const FULL_RATIO = 1333 / 1180
const fullWidth = computed(() => Math.round(props.size * FULL_RATIO))
// 480px covers anything up to 240px wide at 2x; bigger uses the 960px file.
const fullSrc = computed(() => (fullWidth.value * 2 <= 480 ? logoSmall : logoLarge))
const emblemSrc = computed(() => (props.size * 2 <= 192 ? emblem : emblemLarge))
</script>

<template>
  <img
    v-if="variant === 'full'"
    :src="fullSrc"
    :width="fullWidth"
    :height="size"
    :alt="decorative ? '' : site.name"
    :aria-hidden="decorative || undefined"
    class="inline-block shrink-0 select-none"
    draggable="false"
    decoding="async"
  />
  <span v-else class="inline-flex shrink-0 items-center gap-2.5 select-none" :aria-hidden="decorative || undefined">
    <img
      :src="emblemSrc"
      :width="size"
      :height="size"
      :alt="decorative || variant === 'lockup' ? '' : site.name"
      class="shrink-0 rounded-md"
      draggable="false"
      decoding="async"
    />
    <span v-if="variant === 'lockup'" class="flex flex-col font-heading leading-none">
      <span :style="{ fontSize: `${Math.round(size * 0.44)}px` }" class="tracking-wide text-text">{{ site.wordmark[0] }}</span>
      <span :style="{ fontSize: `${Math.max(9, Math.round(size * 0.2))}px` }" class="mt-0.5 tracking-[0.2em] text-accent">{{ site.wordmark[1] }}</span>
    </span>
  </span>
</template>

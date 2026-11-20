<script setup lang="ts">
/**
 * HAL wordmark: "HAL" in the display face inside a thin gold square frame, with the full league
 * name in small tracked caps beside it. SVG, so it scales cleanly. The logo never animates.
 */
withDefaults(
  defineProps<{
    /** Hide the full league name (mark only). */
    compact?: boolean
    /** Height in px of the square mark. */
    size?: number
    /** Decorative when the league name is also given as text nearby. */
    decorative?: boolean
  }>(),
  { size: 36 },
)
</script>

<template>
  <span
    class="inline-flex items-center gap-3 text-gold"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : `Heaven's Arena League`"
    :aria-hidden="decorative || undefined"
  >
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      class="shrink-0"
    >
      <rect x="1.25" y="1.25" width="45.5" height="45.5" stroke="currentColor" stroke-width="1.5" />
      <rect x="4.5" y="4.5" width="39" height="39" stroke="currentColor" stroke-opacity="0.35" stroke-width="0.75" />
      <text
        x="24"
        y="31.5"
        text-anchor="middle"
        fill="currentColor"
        font-family="'Barlow Condensed', 'Arial Narrow', sans-serif"
        font-weight="700"
        font-size="20"
        letter-spacing="1.2"
      >
        HAL
      </text>
    </svg>
    <span
      v-if="!compact"
      class="flex flex-col font-heading leading-none text-text"
      aria-hidden="true"
    >
      <span class="text-[0.8rem] tracking-[0.28em]">HEAVEN'S ARENA</span>
      <span class="mt-1 text-[0.62rem] tracking-[0.42em] text-gold">LEAGUE</span>
    </span>
  </span>
</template>

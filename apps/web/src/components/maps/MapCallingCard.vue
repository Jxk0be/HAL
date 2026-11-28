<script setup lang="ts">
import { computed } from 'vue'
import { mapArt } from '@/lib/mapArt'

/**
 * A map as a calling card: the map's artwork full-bleed, darkened from the left and the bottom so
 * the name and modes always read, with a red edge like an equipped card. Maps without art get
 * the striped surface instead.
 */
const props = defineProps<{
  name: string
  imageUrl?: string | null
  modes: string[]
  /** Highlight this mode's chip (the page's active filter). */
  activeMode?: string | null
  /** Position in the pool, shown faintly in the corner. */
  index?: number
}>()

const art = computed(() => mapArt({ name: props.name, imageUrl: props.imageUrl }))
</script>

<template>
  <article
    class="group relative isolate flex aspect-[16/7] min-h-36 flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface shadow-panel transition-colors hover:border-line-strong"
  >
    <!-- Art -->
    <picture v-if="art" class="absolute inset-0 -z-20">
      <source v-if="art.srcSm" :srcset="art.srcSm" media="(max-width: 480px)" />
      <img
        :src="art.src"
        alt=""
        loading="lazy"
        decoding="async"
        class="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
    </picture>
    <div v-else class="texture-stripes absolute inset-0 -z-20" aria-hidden="true" />

    <!-- Legibility: a dark wash from the left (where the text sits) and up from the bottom -->
    <div class="absolute inset-0 -z-10 bg-gradient-to-r from-bg/90 via-bg/55 to-bg/0" aria-hidden="true" />
    <div class="absolute inset-0 -z-10 bg-gradient-to-t from-bg/85 via-bg/20 to-transparent" aria-hidden="true" />
    <!-- Calling-card edge -->
    <div class="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden="true" />

    <span v-if="index !== undefined" class="tnum absolute top-3 right-4 font-heading text-sm text-white/55 [text-shadow:0_1px_6px_rgb(0_0_0/0.8)]" aria-hidden="true">
      {{ String(index + 1).padStart(2, '0') }}
    </span>

    <div class="px-5 pb-4 sm:px-6 sm:pb-5">
      <h2 class="font-heading text-3xl leading-none tracking-wide text-white uppercase [text-shadow:0_2px_12px_rgb(0_0_0/0.85)] sm:text-4xl">
        {{ name }}
      </h2>
      <ul class="mt-3 flex flex-wrap gap-1.5" :aria-label="`Modes on ${name}`">
        <li
          v-for="m in modes"
          :key="m"
          class="rounded-sm border px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-sm"
          :class="m === activeMode ? 'border-accent bg-brand text-on-brand' : 'border-white/15 bg-black/55 text-white/90'"
        >
          {{ m }}
        </li>
      </ul>
    </div>
  </article>
</template>

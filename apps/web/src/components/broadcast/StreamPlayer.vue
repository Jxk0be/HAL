<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { streamEmbed, streamPlatform } from '@/lib/broadcast'

/**
 * A Twitch, YouTube or Kick player for a stream or replay link. With clickToLoad nothing loads
 * from the streaming site until the viewer presses play. Links that can't be embedded show a
 * "Watch on …" link instead.
 */
const props = withDefaults(
  defineProps<{
    url: string
    /** Accessible name for the player, e.g. "NMG vs OWL live". */
    title: string
    chat?: boolean
    clickToLoad?: boolean
  }>(),
  { chat: false, clickToLoad: false },
)

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const embed = computed(() => streamEmbed(props.url, host))
const loaded = ref(!props.clickToLoad)
watch(
  () => props.url,
  () => (loaded.value = !props.clickToLoad),
)
const platform = computed(() => streamPlatform(props.url))
</script>

<template>
  <div v-if="embed" class="grid gap-3" :class="chat && embed.chatSrc ? 'lg:grid-cols-[1fr_22rem]' : ''">
    <div class="relative aspect-video overflow-hidden rounded-lg border border-line bg-black">
      <iframe
        v-if="loaded"
        :src="embed.src"
        :title="title"
        class="absolute inset-0 size-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <button
        v-else
        type="button"
        class="group absolute inset-0 grid place-items-center text-text focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent"
        @click="loaded = true"
      >
        <span class="flex flex-col items-center gap-3">
          <span class="grid size-16 place-items-center rounded-full bg-brand text-on-brand transition group-hover:bg-brand-strong" aria-hidden="true">
            <svg viewBox="0 0 20 20" class="ml-1 size-7" fill="currentColor"><path d="M6 4l10 6-10 6z" /></svg>
          </span>
          <span class="text-sm">Play {{ title }}</span>
          <span class="text-xs text-muted">Loads the {{ embed.platform }} player</span>
        </span>
      </button>
    </div>
    <div v-if="chat && embed.chatSrc && loaded" class="hidden h-full min-h-[24rem] overflow-hidden rounded-lg border border-line lg:block">
      <iframe :src="embed.chatSrc" :title="`${title} chat`" class="size-full" />
    </div>
  </div>
  <a
    v-else
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="flex aspect-video items-center justify-center rounded-lg border border-line bg-surface-2 text-accent hover:text-accent-strong"
  >
    Watch on {{ platform }}<span class="sr-only"> (opens in a new tab)</span>
  </a>
</template>

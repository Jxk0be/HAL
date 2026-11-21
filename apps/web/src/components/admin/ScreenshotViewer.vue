<script setup lang="ts">
import { computed, ref } from 'vue'
import UiModal from '@/components/ui/UiModal.vue'

/**
 * Thumbnails that open a viewer: click the image to zoom, arrow keys (or the buttons) move
 * between images, Esc closes.
 */
const props = defineProps<{
  images: { url: string; label: string }[]
  /** Accessible name for the group, e.g. "Alpha screenshots". */
  label: string
}>()

const open = ref(false)
const index = ref(0)
const zoomed = ref(false)
const current = computed(() => props.images[index.value] ?? null)

function show(i: number) {
  index.value = i
  zoomed.value = false
  open.value = true
}
function step(dir: -1 | 1) {
  if (!props.images.length) return
  index.value = (index.value + dir + props.images.length) % props.images.length
  zoomed.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    step(1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    step(-1)
  } else if (e.key.toLowerCase() === 'z') {
    zoomed.value = !zoomed.value
  }
}
</script>

<template>
  <div>
    <ul :aria-label="label" class="flex flex-wrap gap-2">
      <li v-for="(img, i) in images" :key="img.url">
        <button
          type="button"
          class="block overflow-hidden rounded-sm border border-line hover:border-gold-dim focus-visible:outline-2 focus-visible:outline-gold"
          :aria-label="`Open ${img.label}`"
          @click="show(i)"
        >
          <img :src="img.url" :alt="''" class="h-16 w-28 object-cover" loading="lazy" />
        </button>
      </li>
      <li v-if="!images.length" class="text-xs text-faint">No screenshots</li>
    </ul>

    <UiModal v-model="open" :title="current?.label ?? 'Screenshot'" size="lg">
      <div v-if="current" class="flex flex-col gap-3" @keydown="onKeydown">
        <div class="max-h-[70vh] overflow-auto rounded-md border border-line bg-bg">
          <button
            type="button"
            class="block w-full focus-visible:outline-2 focus-visible:outline-gold"
            :class="zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'"
            :aria-label="zoomed ? 'Zoom out' : 'Zoom in'"
            @click="zoomed = !zoomed"
          >
            <img :src="current.url" :alt="current.label" :class="zoomed ? 'max-w-none' : 'w-full'" :style="zoomed ? 'width: 200%' : ''" />
          </button>
        </div>
        <div class="flex items-center justify-between gap-2 text-sm">
          <button type="button" class="rounded-md border border-line-strong px-3 py-1.5 hover:border-gold-dim focus-visible:outline-2 focus-visible:outline-gold" @click="step(-1)">
            <span aria-hidden="true">←</span> Previous
          </button>
          <span class="tnum text-muted">{{ index + 1 }} / {{ images.length }} · Z to zoom</span>
          <button type="button" class="rounded-md border border-line-strong px-3 py-1.5 hover:border-gold-dim focus-visible:outline-2 focus-visible:outline-gold" @click="step(1)">
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </UiModal>
  </div>
</template>

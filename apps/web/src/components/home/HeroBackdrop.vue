<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDocumentVisibility, usePreferredReducedMotion } from '@vueuse/core'
import { bundledMapArt } from '@/lib/mapArt'

/**
 * The home hero's backdrop, back to front:
 *  1. the league's map screenshots, grayscale and dark, cross-fading with a slow push-in
 *  2. a red wash and glow (the one accent)
 *  3. a tactical grid floor sliding toward the viewer
 *  4. embers drifting up
 *  5. a vignette and a fade into the page
 * Decorative only (aria-hidden). Pauses while the tab is hidden; reduced motion gets one still
 * frame with no movement.
 */
const props = withDefaults(defineProps<{ /** Where the glow sits: behind the centered logo, or to the right. */ focus?: 'center' | 'right' }>(), {
  focus: 'center',
})

const SLIDE_MS = 7000
const art = bundledMapArt()
const index = ref(0)
const visible = useDocumentVisibility()
const motion = usePreferredReducedMotion()
const still = computed(() => motion.value === 'reduce')

let timer: ReturnType<typeof setInterval> | undefined
function stop() {
  clearInterval(timer)
  timer = undefined
}
watch(
  [visible, still],
  ([v, s]) => {
    stop()
    if (v === 'visible' && !s && art.length > 1) timer = setInterval(() => (index.value = (index.value + 1) % art.length), SLIDE_MS)
  },
  { immediate: true },
)
onBeforeUnmount(stop)

// Warm the next image so the cross-fade never shows a half-loaded frame.
watch(
  index,
  (i) => {
    const next = art[(i + 1) % art.length]
    if (next) new Image().src = next
  },
  { immediate: true },
)

// Fixed pseudo-random embers (same on every render, no hydration jitter).
const embers = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return {
    left: `${(r(1) * 100).toFixed(1)}%`,
    size: `${(1.5 + r(2) * 2.5).toFixed(1)}px`,
    duration: `${(9 + r(3) * 9).toFixed(1)}s`,
    delay: `${(-r(4) * 18).toFixed(1)}s`,
    drift: `${((r(5) - 0.5) * 80).toFixed(0)}px`,
    opacity: (0.35 + r(6) * 0.5).toFixed(2),
  }
})

const glowPosition = computed(() => (props.focus === 'right' ? '72% 45%' : '50% 30%'))
</script>

<template>
  <div class="hero-backdrop pointer-events-none absolute inset-0 overflow-hidden" :class="{ still }" aria-hidden="true">
    <!-- 1. Map art -->
    <Transition name="hero-slide">
      <div v-if="art.length" :key="index" class="absolute inset-0">
        <img :src="art[index]" alt="" decoding="async" class="hero-art size-full object-cover" />
      </div>
    </Transition>

    <!-- 2. Red wash + glow -->
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_10_11/0.55),rgb(10_10_11/0.82))]" />
    <div class="hero-glow absolute inset-0" :style="{ '--glow-at': glowPosition }" />

    <!-- 3. Grid floor -->
    <div class="hero-floor absolute inset-x-[-50%] bottom-0 h-[55%]">
      <div class="hero-grid size-full" />
    </div>

    <!-- 4. Embers -->
    <span
      v-for="(e, i) in embers"
      :key="i"
      class="hero-ember absolute bottom-[-10px] rounded-full bg-accent"
      :style="{ left: e.left, width: e.size, height: e.size, '--dur': e.duration, '--delay': e.delay, '--drift': e.drift, '--o': e.opacity }"
    />

    <!-- 5. Vignette, scanlines and the fade into the page -->
    <div class="hero-scan absolute inset-0" />
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.65)_100%)]" />
    <div class="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
  </div>
</template>

<style scoped>
.hero-art {
  filter: grayscale(0.85) contrast(1.15) brightness(0.55);
  animation: hero-push 14s ease-out both;
}
@keyframes hero-push {
  from {
    transform: scale(1.12) translate3d(-1.5%, 1%, 0);
  }
  to {
    transform: scale(1.02) translate3d(0, 0, 0);
  }
}
.hero-slide-enter-active,
.hero-slide-leave-active {
  transition: opacity 1.6s ease-in-out;
}
.hero-slide-enter-from,
.hero-slide-leave-to {
  opacity: 0;
}

.hero-glow {
  background:
    radial-gradient(40rem 26rem at var(--glow-at), rgb(217 31 43 / 0.28), transparent 70%),
    radial-gradient(60rem 30rem at 50% 110%, rgb(217 31 43 / 0.18), transparent 70%);
  animation: hero-breathe 9s ease-in-out infinite alternate;
}
@keyframes hero-breathe {
  from {
    opacity: 0.75;
  }
  to {
    opacity: 1;
  }
}

.hero-floor {
  perspective: 420px;
  mask-image: linear-gradient(to top, black 15%, transparent 95%);
}
.hero-grid {
  transform: rotateX(62deg);
  transform-origin: 50% 100%;
  background-image:
    linear-gradient(to right, rgb(255 79 92 / 0.22) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 79 92 / 0.22) 1px, transparent 1px);
  background-size: 56px 56px;
  animation: hero-grid-run 2.4s linear infinite;
}
@keyframes hero-grid-run {
  to {
    background-position: 0 56px;
  }
}

.hero-ember {
  opacity: 0;
  box-shadow: 0 0 6px 1px rgb(255 79 92 / 0.7);
  animation: hero-ember var(--dur) linear var(--delay) infinite;
}
@keyframes hero-ember {
  0% {
    transform: translate3d(0, 0, 0);
    opacity: 0;
  }
  10% {
    opacity: var(--o);
  }
  80% {
    opacity: calc(var(--o) * 0.6);
  }
  100% {
    transform: translate3d(var(--drift), -70vh, 0);
    opacity: 0;
  }
}

.hero-scan {
  background: repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.018) 0 1px, transparent 1px 3px);
}

/* Reduced motion: one still frame. */
.still .hero-art,
.still .hero-glow,
.still .hero-grid {
  animation: none;
}
.still .hero-ember {
  display: none;
}
</style>

<script setup lang="ts">
import BrandLogo from '@/components/brand/BrandLogo.vue'
import { site } from '@/config/site'
</script>

<template>
  <!-- Shown once, while the session and profile load, so the shell never flashes the logged-out chrome. -->
  <div class="grid min-h-dvh place-items-center bg-bg px-4" role="status" aria-live="polite">
    <div class="flex flex-col items-center gap-6">
      <BrandLogo variant="emblem" :size="72" decorative />
      <div class="h-0.5 w-40 overflow-hidden rounded-full bg-track">
        <div class="splash-bar h-full w-1/3 rounded-full bg-brand" />
      </div>
      <span class="sr-only">Loading {{ site.name }}…</span>
    </div>
  </div>
</template>

<style scoped>
.splash-bar {
  animation: splash-slide 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes splash-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .splash-bar {
    animation: none;
    width: 100%;
    opacity: 0.6;
  }
}
</style>

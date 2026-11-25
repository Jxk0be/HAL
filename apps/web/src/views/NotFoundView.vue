<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col items-start px-4 py-24 sm:px-6">
    <p class="eyebrow text-accent">Error 404</p>
    <h1 class="mt-2 font-heading text-5xl">Out of bounds</h1>
    <p class="mt-4 text-muted">That page doesn't exist. It may have moved, or the link is wrong.</p>
    <UiButton to="/" class="mt-8">Back to home</UiButton>
  </div>
</template>

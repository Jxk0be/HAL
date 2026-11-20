<script setup lang="ts">
import { site } from '@/config/site'
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-4">
    <p class="text-sm tracking-[0.2em] text-gold uppercase">{{ site.shortName }}</p>
    <h1 class="text-4xl font-bold">{{ site.name }}</h1>
    <p class="text-muted">{{ site.tagline }} Site under construction.</p>
    <a
      :href="site.discordInviteUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="rounded-md bg-gold px-4 py-2 font-semibold text-on-gold hover:bg-gold-strong"
    >
      Join Discord
    </a>
  </main>
</template>

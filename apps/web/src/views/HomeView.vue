<script setup lang="ts">
import HalWordmark from '@/components/brand/HalWordmark.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { site } from '@/config/site'
import { homeContent as c } from '@/content/home'
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden border-b border-line" aria-labelledby="home-title">
      <!-- Thin gold frame lines, purely decorative -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-linear-to-b from-transparent via-line to-transparent" />
        <div class="absolute top-24 right-0 hidden h-[420px] w-[420px] border border-gold-dim/25 lg:block" />
        <div class="absolute top-32 right-8 hidden h-[420px] w-[420px] border border-gold-dim/10 lg:block" />
      </div>

      <div class="relative mx-auto grid max-w-7xl gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <UiBadge variant="gold">{{ c.status }}</UiBadge>
          <p class="eyebrow mt-6 text-muted">{{ c.eyebrow }}</p>
          <h1 id="home-title" class="mt-3 font-heading text-5xl leading-[0.95] sm:text-7xl">
            {{ c.headline }}
          </h1>
          <p class="mt-6 max-w-xl text-lg text-muted">{{ c.intro }}</p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UiButton :href="site.discordInviteUrl" size="lg">Join the Discord</UiButton>
            <UiButton to="/rules" variant="secondary" size="lg">Read the rules</UiButton>
          </div>
        </div>

        <div class="hidden justify-center lg:flex">
          <HalWordmark :size="220" compact decorative />
        </div>
      </div>

      <!-- Key facts strip -->
      <div class="relative border-t border-line bg-surface/60">
        <dl class="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
          <div
            v-for="(f, i) in c.facts"
            :key="f.label"
            class="py-6 md:px-6"
            :class="[
              i % 2 === 1 ? 'border-l border-line pl-4 md:pl-6' : '',
              i >= 2 ? 'border-t border-line md:border-t-0' : '',
              i === 2 ? 'md:border-l md:border-line' : '',
              i === 0 ? 'md:pl-0' : '',
            ]"
          >
            <dt class="eyebrow text-muted">{{ f.label }}</dt>
            <dd class="tnum mt-1 font-heading text-2xl text-text sm:text-3xl">{{ f.value }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- Pillars -->
    <section class="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="pillars-title">
      <p class="eyebrow text-gold">The league</p>
      <h2 id="pillars-title" class="mt-2 font-heading text-3xl sm:text-4xl">Built like a pro circuit</h2>
      <div class="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
        <article v-for="(p, i) in c.pillars" :key="p.title" class="bg-surface p-6 sm:p-8">
          <p class="tnum font-heading text-sm text-gold" aria-hidden="true">0{{ i + 1 }}</p>
          <h3 class="mt-3 font-heading text-xl">{{ p.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-muted">{{ p.body }}</p>
        </article>
      </div>
    </section>

    <!-- Upcoming matches / results slots (filled in step 13) -->
    <section class="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="next-title">
      <div class="flex flex-col gap-6 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 id="next-title" class="font-heading text-2xl">Want in?</h2>
          <p class="mt-1 max-w-lg text-sm text-muted">
            Log in with Discord to land on the free agent list, or build a team and invite your
            squad. Four starters, three subs.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <UiButton to="/login">Log in with Discord</UiButton>
          <UiButton to="/free-agents" variant="secondary">Browse free agents</UiButton>
        </div>
      </div>
    </section>
  </div>
</template>

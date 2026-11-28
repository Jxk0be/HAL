<script setup lang="ts">
import BrandLogo from '@/components/brand/BrandLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UserMenu from './UserMenu.vue'
import { site } from '@/config/site'
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md print:hidden">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
      <RouterLink to="/" class="shrink-0 rounded-sm" :aria-label="`${site.name} home`">
        <BrandLogo :size="40" decorative />
      </RouterLink>
      <nav aria-label="Main" class="ml-2 hidden sm:block">
        <ul class="flex items-center gap-1">
          <li>
            <RouterLink to="/" class="block px-3 py-2 font-heading text-sm tracking-wider text-muted hover:text-text">Home</RouterLink>
          </li>
          <li>
            <RouterLink to="/rules" class="block px-3 py-2 font-heading text-sm tracking-wider text-muted hover:text-text">Rules</RouterLink>
          </li>
        </ul>
      </nav>
      <div class="ml-auto flex items-center gap-2">
        <span class="hidden sm:block">
          <UiButton :href="site.discordInviteUrl" size="sm">Join Discord</UiButton>
        </span>
        <UserMenu />
      </div>
    </div>
  </header>
</template>

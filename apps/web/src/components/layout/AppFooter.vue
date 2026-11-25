<script setup lang="ts">
import BrandLogo from '@/components/brand/BrandLogo.vue'
import { site } from '@/config/site'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-24 border-t border-line print:hidden">
    <div class="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
      <div>
        <BrandLogo :size="96" variant="full" />
        <p class="mt-4 max-w-sm text-sm text-muted">{{ site.tagline }}</p>
      </div>
      <nav aria-label="Footer">
        <ul class="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:flex sm:gap-6">
          <li><RouterLink to="/rules" class="text-muted hover:text-text">Rules</RouterLink></li>
          <li><RouterLink to="/audit-log" class="text-muted hover:text-text">Audit Log</RouterLink></li>
          <li>
            <a :href="site.discordInviteUrl" target="_blank" rel="noopener noreferrer" class="text-muted hover:text-text">
              Discord<span class="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>
    <div class="border-t border-line">
      <p class="mx-auto max-w-7xl px-4 py-4 text-xs text-muted sm:px-6">
        © {{ year }} {{ site.name }}. Not affiliated with Activision or Call of Duty League.
      </p>
    </div>
  </footer>
</template>

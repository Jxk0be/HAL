<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LiveBanner from '@/components/layout/LiveBanner.vue'
import AccountNotice from '@/components/layout/AccountNotice.vue'
import UiToastHost from '@/components/ui/UiToastHost.vue'
import { useAuthStore } from '@/stores/auth'

void useAuthStore().init()
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 rounded-md bg-brand px-4 py-2 font-heading text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
  >
    Skip to content
  </a>
  <div class="flex min-h-dvh flex-col">
    <LiveBanner />
    <AppHeader />
    <AccountNotice />
    <main id="main" tabindex="-1" class="flex-1 focus:outline-none">
      <RouterView />
    </main>
    <AppFooter />
  </div>
  <UiToastHost />
</template>

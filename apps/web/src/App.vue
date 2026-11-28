<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppRail from '@/components/layout/AppRail.vue'
import AppTopBar from '@/components/layout/AppTopBar.vue'
import AppTabBar from '@/components/layout/AppTabBar.vue'
import MobileMenu from '@/components/layout/MobileMenu.vue'
import PublicHeader from '@/components/layout/PublicHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LiveBanner from '@/components/layout/LiveBanner.vue'
import AccountNotice from '@/components/layout/AccountNotice.vue'
import UiToastHost from '@/components/ui/UiToastHost.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
void auth.init()

const route = useRoute()
// The home page is the public landing page for visitors and part of the app once signed in.
const isPublic = computed(
  () => route.meta.layout === 'public' || (route.name === 'home' && auth.ready && !auth.isSignedIn),
)
const menuOpen = ref(false)
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 rounded-md bg-brand px-4 py-2 font-heading text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
  >
    Skip to content
  </a>

  <div v-if="isPublic" class="flex min-h-dvh flex-col">
    <LiveBanner />
    <PublicHeader />
    <AccountNotice />
    <main id="main" tabindex="-1" class="flex-1 focus:outline-none">
      <RouterView />
    </main>
    <AppFooter />
  </div>

  <template v-else>
    <AppRail />
    <div class="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-rail">
      <LiveBanner />
      <AppTopBar />
      <AccountNotice />
      <main id="main" tabindex="-1" class="flex-1 focus:outline-none">
        <RouterView />
      </main>
      <AppFooter />
    </div>
    <AppTabBar :more-open="menuOpen" @more="menuOpen = true" />
    <MobileMenu v-model="menuOpen" />
  </template>

  <UiToastHost />
</template>

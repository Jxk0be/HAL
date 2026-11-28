<script setup lang="ts">
import { useRouter } from 'vue-router'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import ResultsTicker from './ResultsTicker.vue'
import UserMenu from './UserMenu.vue'
import { site } from '@/config/site'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()

async function login() {
  try {
    await auth.signInWithDiscord(router.currentRoute.value.fullPath)
  } catch {
    toast.error('Could not start Discord login. Please try again.')
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line bg-rail/95 px-4 backdrop-blur-md sm:px-6 print:hidden"
  >
    <RouterLink to="/" class="shrink-0 rounded-sm lg:hidden" :aria-label="`${site.name} home`">
      <BrandLogo :size="36" decorative />
    </RouterLink>
    <ResultsTicker />
    <div class="flex shrink-0 items-center gap-2">
      <template v-if="!auth.isSignedIn">
        <span class="hidden sm:block">
          <UiButton variant="ghost" size="sm" @click="login">Sign in</UiButton>
        </span>
        <UiButton :href="site.discordInviteUrl" size="sm">Join the league</UiButton>
      </template>
      <UserMenu v-else />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import DiscordGlyph from '@/components/brand/DiscordGlyph.vue'
import { site } from '@/config/site'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { safeNext } from '@/lib/redirect'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const busy = ref(false)

const redirect = computed(() => safeNext(route.query.redirect, '/dashboard'))

void auth.init().then(() => {
  if (!auth.isSignedIn) return
  void router.replace(auth.isOnboarded ? redirect.value : { name: 'onboarding', query: { next: redirect.value } })
})

async function login() {
  busy.value = true
  try {
    await auth.signInWithDiscord(redirect.value)
  } catch {
    toast.error('Could not start Discord login. Please try again.')
    busy.value = false
  }
}
</script>

<template>
  <div class="relative grid min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
    <!-- Pitch (desktop) -->
    <section class="relative hidden overflow-hidden border-r border-line bg-rail lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
      <div class="px-12 xl:px-20">
        <p class="eyebrow-line text-faint">{{ site.name }}</p>
        <p class="title-xl mt-5">Your squad.<br /><span class="text-accent">Your stage.</span></p>
        <p class="mt-6 max-w-md text-lg text-muted">
          Free-entry competitive Call of Duty with a real season, verified stats and a $250 prize for the champions.
        </p>
      </div>
      <svg class="waves absolute inset-x-0 bottom-0 h-40 w-[200%]" viewBox="0 0 1600 160" preserveAspectRatio="none" fill="none">
        <path d="M0 90 C 200 30, 200 30, 400 90 C 600 150, 600 150, 800 90 C 1000 30, 1000 30, 1200 90 C 1400 150, 1400 150, 1600 90" stroke="var(--color-line-strong)" stroke-width="2" />
        <path d="M0 110 C 200 150, 200 150, 400 110 C 600 70, 600 70, 800 110 C 1000 150, 1000 150, 1200 110 C 1400 70, 1400 70, 1600 110" stroke="var(--color-accent)" stroke-width="2" opacity="0.7" />
      </svg>
    </section>

    <!-- Sign-in card -->
    <section class="flex items-center justify-center px-4 py-12 sm:py-16">
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-panel sm:p-10">
        <div class="flex justify-center"><BrandLogo :size="160" variant="full" /></div>
        <h1 class="mt-6 font-heading text-3xl">Welcome back</h1>
        <p class="mt-2 text-muted">Blackhat uses your Discord account. Signing in puts you on the free agent list so captains can invite you.</p>
        <button
          type="button"
          class="mt-8 inline-flex h-12 w-full items-center justify-center gap-3 rounded-md bg-discord px-6 font-heading tracking-wide text-white uppercase hover:brightness-110 disabled:opacity-60"
          :disabled="busy"
          :aria-busy="busy || undefined"
          @click="login"
        >
          <DiscordGlyph class="size-5" />
          {{ busy ? 'Opening Discord…' : 'Continue with Discord' }}
        </button>
        <p class="mt-6 text-xs leading-relaxed text-muted">
          You must be 18 or older, play on a controller and live in North America.
          <RouterLink to="/rules#2" class="text-accent hover:underline">Eligibility rules</RouterLink>.
          We use your Discord name, avatar and ID; your email stays private.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.waves {
  animation: drift 24s linear infinite;
}
@keyframes drift {
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .waves {
    animation: none;
  }
}
</style>

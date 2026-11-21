<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HalWordmark from '@/components/brand/HalWordmark.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { safeNext } from '@/lib/redirect'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const busy = ref(false)

const redirect = computed(() => safeNext(route.query.redirect, '/profile'))

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
  <div class="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center sm:py-28">
    <HalWordmark :size="140" />
    <h1 class="mt-8 font-heading text-4xl">Log in to HAL</h1>
    <p class="mt-3 text-muted">
      HAL uses your Discord account. Signing in puts you on the free agent list so captains can
      invite you to their team.
    </p>
    <UiButton size="lg" class="mt-8" :loading="busy" @click="login">Continue with Discord</UiButton>
    <p class="mt-6 text-xs text-muted">
      We use your Discord name, avatar and ID. Your email stays private. You must be 18 or older to
      play.
    </p>
  </div>
</template>

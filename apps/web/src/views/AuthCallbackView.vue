<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiButton from '@/components/ui/UiButton.vue'
import { useAuthStore } from '@/stores/auth'
import { safeNext } from '@/lib/redirect'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const failed = ref<string | null>(null)

onMounted(async () => {
  const providerError = route.query.error_description ?? route.query.error
  if (providerError) {
    failed.value = String(providerError)
    return
  }
  // The Supabase client exchanges the ?code for a session while initializing.
  await auth.init()
  await auth.refresh()
  if (!auth.isSignedIn) {
    failed.value = 'We could not complete the Discord login.'
    return
  }
  // A login started from the home page (or with no destination) lands on the dashboard.
  const requested = safeNext(route.query.next, '/dashboard')
  const next = requested === '/' ? '/dashboard' : requested
  if (!auth.isOnboarded) {
    await router.replace({ name: 'onboarding', query: { next } })
  } else {
    await router.replace(next)
  }
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
    <template v-if="!failed">
      <span class="size-8 animate-spin rounded-full border-2 border-accent border-r-transparent" aria-hidden="true" />
      <p class="mt-6 text-muted" role="status">Signing you in…</p>
    </template>
    <template v-else>
      <h1 class="font-heading text-3xl">Login failed</h1>
      <p class="mt-3 text-muted" role="alert">{{ failed }}</p>
      <UiButton to="/login" class="mt-8">Try again</UiButton>
    </template>
  </div>
</template>

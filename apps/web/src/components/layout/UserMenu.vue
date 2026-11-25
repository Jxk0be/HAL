<script setup lang="ts">
import { ref, useId, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const id = useId()

onClickOutside(root, () => (open.value = false))
onKeyStroke('Escape', () => {
  if (!open.value) return
  open.value = false
  trigger.value?.focus()
})

async function login() {
  try {
    await auth.signInWithDiscord(router.currentRoute.value.fullPath)
  } catch {
    toast.error('Could not start Discord login. Please try again.')
  }
}

async function logout() {
  open.value = false
  await auth.signOut()
  toast.show('Signed out.')
  if (router.currentRoute.value.meta.requiresAuth) await router.push('/')
}
</script>

<template>
  <div ref="root" class="relative">
    <UiButton v-if="!auth.isSignedIn" variant="secondary" size="sm" @click="login">
      <svg viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true">
        <path
          d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1A19.9 19.9 0 0 0 6.3 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.8-3.6-13.7ZM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
        />
      </svg>
      Log in
    </UiButton>

    <template v-else>
      <button
        ref="trigger"
        type="button"
        class="flex items-center gap-2 rounded-full border border-line-strong py-0.5 pr-2.5 pl-0.5 hover:border-accent-dim"
        :aria-expanded="open"
        :aria-controls="`${id}-menu`"
        aria-haspopup="true"
        @click="open = !open"
      >
        <UiAvatar :src="auth.avatarUrl" :name="auth.displayName" size="sm" decorative />
        <span class="hidden max-w-32 truncate text-sm sm:inline">{{ auth.displayName }}</span>
        <span class="sr-only sm:hidden">Account menu for {{ auth.displayName }}</span>
        <svg viewBox="0 0 16 16" class="size-3.5 text-muted" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>

      <nav
        v-show="open"
        :id="`${id}-menu`"
        aria-label="Account"
        class="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-md border border-line-strong bg-surface-2 py-1 shadow-pop"
      >
        <p class="truncate border-b border-line px-4 py-2.5 text-xs text-muted">
          Signed in as <span class="text-text">{{ auth.displayName }}</span>
        </p>
        <RouterLink class="block px-4 py-2 text-sm hover:bg-surface-3" to="/profile" @click="open = false">
          My Profile
        </RouterLink>
        <RouterLink class="block px-4 py-2 text-sm hover:bg-surface-3" to="/my-team" @click="open = false">
          My Team
        </RouterLink>
        <RouterLink
          v-if="auth.isStaff"
          class="block px-4 py-2 text-sm text-accent hover:bg-surface-3"
          to="/admin"
          @click="open = false"
        >
          Admin
        </RouterLink>
        <RouterLink
          v-if="auth.isOwner"
          class="block px-4 py-2 text-sm text-accent hover:bg-surface-3"
          to="/admin/discord"
          @click="open = false"
        >
          Discord sync
        </RouterLink>
        <button
          type="button"
          class="block w-full border-t border-line px-4 py-2 text-left text-sm text-muted hover:bg-surface-3 hover:text-text"
          @click="logout"
        >
          Log out
        </button>
      </nav>
    </template>
  </div>
</template>

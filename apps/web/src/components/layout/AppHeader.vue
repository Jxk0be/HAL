<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import HalWordmark from '@/components/brand/HalWordmark.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UserMenu from './UserMenu.vue'
import { mainNav, site } from '@/config/site'

const route = useRoute()
const drawer = useTemplateRef<HTMLDialogElement>('drawer')
const drawerOpen = ref(false)

function openDrawer() {
  drawer.value?.showModal()
  drawerOpen.value = true
}
function closeDrawer() {
  drawer.value?.close()
}

// Close the drawer after navigating.
watch(() => route.fullPath, closeDrawer)

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md print:hidden">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
      <RouterLink to="/" class="shrink-0 rounded-sm" aria-label="Heaven's Arena League home">
        <span class="hidden sm:block"><HalWordmark :size="34" decorative /></span>
        <span class="block sm:hidden"><HalWordmark :size="34" compact decorative /></span>
      </RouterLink>

      <nav aria-label="Main" class="ml-4 hidden flex-1 lg:block">
        <ul class="flex items-center gap-1">
          <li v-for="item in mainNav" :key="item.to">
            <RouterLink
              :to="item.to"
              class="relative block px-3 py-2 font-heading text-sm tracking-wider transition-colors"
              :class="isActive(item.to) ? 'text-text' : 'text-muted hover:text-text'"
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              {{ item.label }}
              <span
                v-if="isActive(item.to)"
                class="absolute inset-x-3 -bottom-[13px] h-px bg-gold"
                aria-hidden="true"
              />
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <span class="hidden sm:block">
          <UiButton :href="site.discordInviteUrl" size="sm">Join Discord</UiButton>
        </span>
        <UserMenu />
        <button
          type="button"
          class="-mr-1 grid size-10 place-items-center rounded-md text-text hover:bg-surface-2 lg:hidden"
          aria-label="Open menu"
          aria-haspopup="dialog"
          :aria-expanded="drawerOpen"
          @click="openDrawer"
        >
          <svg viewBox="0 0 24 24" class="size-6" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile drawer: native dialog for focus trapping and Esc. -->
    <dialog
      ref="drawer"
      aria-label="Menu"
      class="ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-l border-line bg-surface p-0 text-text backdrop:bg-black/70"
      @close="drawerOpen = false"
      @click="(e) => e.target === drawer && closeDrawer()"
    >
      <div class="flex h-full flex-col">
        <div class="flex h-16 items-center justify-between border-b border-line px-4">
          <HalWordmark :size="30" decorative />
          <button
            type="button"
            class="grid size-10 place-items-center rounded-md hover:bg-surface-2"
            aria-label="Close menu"
            @click="closeDrawer"
          >
            <svg viewBox="0 0 20 20" class="size-5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <nav aria-label="Main (mobile)" class="flex-1 overflow-y-auto px-2 py-4">
          <ul class="flex flex-col">
            <li v-for="item in mainNav" :key="item.to">
              <RouterLink
                :to="item.to"
                class="flex items-center justify-between rounded-md px-3 py-3 font-heading text-lg tracking-wider"
                :class="isActive(item.to) ? 'bg-gold-soft text-text' : 'text-muted hover:bg-surface-2 hover:text-text'"
                :aria-current="isActive(item.to) ? 'page' : undefined"
              >
                {{ item.label }}
                <span v-if="isActive(item.to)" class="h-4 w-px bg-gold" aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
        </nav>
        <div class="border-t border-line p-4">
          <UiButton :href="site.discordInviteUrl" block>Join Discord</UiButton>
        </div>
      </div>
    </dialog>
  </header>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { X } from 'lucide-vue-next'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { mainNav, site, tabBarNav } from '@/config/site'
import { useAuthStore } from '@/stores/auth'
import { isNavActive, navIcons } from './navIcons'

const open = defineModel<boolean>({ required: true })
const route = useRoute()
const auth = useAuthStore()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

const items = computed(() =>
  mainNav.filter(
    (i) =>
      !(tabBarNav as readonly string[]).includes(i.to) && (!i.auth || auth.isSignedIn) && (!i.staff || auth.isStaff),
  ),
)
const accountLinks = computed(() =>
  auth.isSignedIn
    ? [
        { label: 'My Profile', to: '/profile' },
        { label: 'My Team', to: '/my-team' },
        ...(auth.isOwner ? [{ label: 'Discord sync', to: '/admin/discord' }] : []),
      ]
    : [],
)

watch(open, (v) => {
  if (v && !dialog.value?.open) dialog.value?.showModal()
  if (!v && dialog.value?.open) dialog.value.close()
})
// Close after navigating.
watch(() => route.fullPath, () => (open.value = false))
</script>

<template>
  <dialog
    ref="dialog"
    aria-label="Menu"
    class="ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-l border-line bg-surface p-0 text-text backdrop:bg-black/70"
    @close="open = false"
    @click="(e) => e.target === dialog && (open = false)"
  >
    <div class="flex h-full flex-col">
      <div class="flex h-topbar items-center justify-between border-b border-line px-4">
        <BrandLogo :size="36" decorative />
        <button
          type="button"
          class="grid size-11 place-items-center rounded-md hover:bg-surface-2"
          aria-label="Close menu"
          @click="open = false"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="More pages" class="flex-1 overflow-y-auto px-2 py-4">
        <ul class="flex flex-col">
          <li v-for="item in items" :key="item.to">
            <RouterLink
              :to="item.to"
              class="flex items-center gap-3 rounded-md px-3 py-3 font-heading text-lg tracking-wide"
              :class="isNavActive(item.to, route.path) ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'"
              :aria-current="isNavActive(item.to, route.path) ? 'page' : undefined"
            >
              <component :is="navIcons[item.icon]" class="size-5" aria-hidden="true" />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
        <template v-if="accountLinks.length">
          <p class="eyebrow mt-6 mb-2 px-3 text-faint">Account</p>
          <ul class="flex flex-col">
            <li v-for="l in accountLinks" :key="l.to">
              <RouterLink
                :to="l.to"
                class="block rounded-md px-3 py-2.5 text-base"
                :class="isNavActive(l.to, route.path) ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'"
              >
                {{ l.label }}
              </RouterLink>
            </li>
          </ul>
        </template>
      </nav>
      <div class="border-t border-line p-4">
        <UiButton :href="site.discordInviteUrl" block>Join Discord</UiButton>
      </div>
    </div>
  </dialog>
</template>

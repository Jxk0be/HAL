<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { Ellipsis } from 'lucide-vue-next'
import BrandLogo from '@/components/brand/BrandLogo.vue'
import { mainNav, site } from '@/config/site'
import { useAuthStore } from '@/stores/auth'
import { isNavActive, navIcons } from './navIcons'

const route = useRoute()
const auth = useAuthStore()
const id = useId()

const visible = computed(() =>
  mainNav.filter((i) => (!i.auth || auth.isSignedIn) && (!i.staff || auth.isStaff)),
)
const railItems = computed(() => visible.value.filter((i) => i.rail))
const moreItems = computed(() => visible.value.filter((i) => !i.rail))
const moreActive = computed(() => moreItems.value.some((i) => isNavActive(i.to, route.path)))

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

function links(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('a') ?? [])
}
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    links()[0]?.focus()
  }
}
function close(refocus = true) {
  if (!open.value) return
  open.value = false
  if (refocus) trigger.value?.focus()
}
function onMenuKey(e: KeyboardEvent) {
  const items = links()
  const i = items.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
  else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
  else if (e.key === 'Home') items[0]?.focus()
  else if (e.key === 'End') items[items.length - 1]?.focus()
  else return
  e.preventDefault()
}

onClickOutside(root, () => close(false))
onKeyStroke('Escape', () => close())
watch(() => route.fullPath, () => close(false))
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-30 hidden w-rail flex-col items-center border-r border-line bg-rail py-3 lg:flex print:hidden"
  >
    <RouterLink to="/" class="mb-3 rounded-md p-1" :aria-label="`${site.name} home`">
      <BrandLogo variant="emblem" :size="36" decorative />
    </RouterLink>
    <nav aria-label="Main" class="flex w-full flex-1 flex-col px-2">
      <ul class="flex flex-col gap-1">
        <li v-for="item in railItems" :key="item.to">
          <RouterLink
            :to="item.to"
            class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] leading-none font-semibold transition-colors"
            :class="
              isNavActive(item.to, route.path)
                ? 'bg-accent-soft text-accent'
                : 'text-faint hover:bg-surface-2 hover:text-text'
            "
            :aria-label="item.short ? item.label : undefined"
            :aria-current="isNavActive(item.to, route.path) ? 'page' : undefined"
          >
            <component :is="navIcons[item.icon]" class="size-5" aria-hidden="true" />
            <span class="max-w-full truncate px-0.5">{{ item.short ?? item.label }}</span>
          </RouterLink>
        </li>
        <li ref="root" class="relative">
          <button
            ref="trigger"
            type="button"
            class="flex h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] leading-none font-semibold transition-colors"
            :class="moreActive || open ? 'bg-accent-soft text-accent' : 'text-faint hover:bg-surface-2 hover:text-text'"
            aria-haspopup="true"
            :aria-expanded="open"
            :aria-controls="`${id}-more`"
            @click="toggle"
          >
            <Ellipsis class="size-5" aria-hidden="true" />
            More
          </button>
          <nav
            v-show="open"
            :id="`${id}-more`"
            ref="menu"
            aria-label="More pages"
            class="absolute top-0 left-full z-40 ml-3 w-52 overflow-hidden rounded-lg border border-line-strong bg-surface-2 py-1 shadow-pop"
            @keydown="onMenuKey"
          >
            <RouterLink
              v-for="item in moreItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-3 focus-visible:bg-surface-3"
              :class="isNavActive(item.to, route.path) ? 'text-accent' : 'text-text'"
              :aria-current="isNavActive(item.to, route.path) ? 'page' : undefined"
            >
              <component :is="navIcons[item.icon]" class="size-4 text-faint" aria-hidden="true" />
              {{ item.label }}
            </RouterLink>
          </nav>
        </li>
      </ul>
    </nav>
  </aside>
</template>

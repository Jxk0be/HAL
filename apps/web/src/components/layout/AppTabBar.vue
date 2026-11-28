<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Menu } from 'lucide-vue-next'
import { mainNav, tabBarNav } from '@/config/site'
import { isNavActive, navIcons } from './navIcons'

defineEmits<{ more: [] }>()
defineProps<{ moreOpen: boolean }>()

const route = useRoute()
const items = computed(() => tabBarNav.map((to) => mainNav.find((i) => i.to === to)).filter((i) => !!i))
const moreActive = computed(() => !items.value.some((i) => isNavActive(i.to, route.path)))
</script>

<template>
  <nav
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-rail/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden"
  >
    <ul class="grid grid-cols-5">
      <li v-for="item in items" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold"
          :class="isNavActive(item.to, route.path) ? 'text-accent' : 'text-faint hover:text-text'"
          :aria-current="isNavActive(item.to, route.path) ? 'page' : undefined"
        >
          <component :is="navIcons[item.icon]" class="size-5" aria-hidden="true" />
          {{ item.label }}
        </RouterLink>
      </li>
      <li>
        <button
          type="button"
          class="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold"
          :class="moreActive || moreOpen ? 'text-accent' : 'text-faint hover:text-text'"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          @click="$emit('more')"
        >
          <Menu class="size-5" aria-hidden="true" />
          More
        </button>
      </li>
    </ul>
  </nav>
</template>

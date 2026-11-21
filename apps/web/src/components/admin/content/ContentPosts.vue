<script setup lang="ts">
import { computed, ref } from 'vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import LeagueTime from '@/components/match/LeagueTime.vue'
import { useContentPosts, type ContentPost } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const c = useContentPosts()
const { posts, loading, busy } = c
const activeOnly = ref(true)
const shown = computed(() => (activeOnly.value ? posts.value.filter((p) => p.active) : posts.value))

async function setActive(p: ContentPost, active: boolean) {
  const r = await c.setActive(p.id, active)
  if (r.ok) toast.success(active ? 'Post reactivated.' : 'Post hidden from the board.')
  else toast.error(r.message)
}
async function remove(p: ContentPost) {
  if (!window.confirm(`Delete ${p.player}'s free agent post? This can't be undone.`)) return
  const r = await c.remove(p.id)
  if (r.ok) toast.success('Post deleted.')
  else toast.error(r.message)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiCheckbox v-model="activeOnly" label="Active posts only" />
    <PublicLogNotice />
    <UiSkeleton v-if="loading" :lines="6" />
    <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      <li v-if="!shown.length" class="px-4 py-3 text-sm text-muted">No posts.</li>
      <li v-for="p in shown" :key="p.id" class="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span class="min-w-48 flex-1">
          <RouterLink :to="`/players/${p.userId}`" class="font-medium hover:text-gold">{{ p.player }}</RouterLink>
          <span class="block text-xs text-muted">{{ p.platform }}<template v-if="p.role"> · {{ p.role }}</template> · <LeagueTime :iso="p.createdAt" /></span>
          <span v-if="p.note" class="mt-1 block text-muted">{{ p.note }}</span>
        </span>
        <UiBadge :variant="p.active ? 'win' : 'neutral'">{{ p.active ? 'Active' : 'Hidden' }}</UiBadge>
        <span class="flex gap-1.5">
          <UiButton size="sm" variant="ghost" :disabled="busy" @click="setActive(p, !p.active)">{{ p.active ? 'Deactivate' : 'Reactivate' }}</UiButton>
          <UiButton size="sm" variant="danger" :disabled="busy" @click="remove(p)">Delete</UiButton>
        </span>
      </li>
    </ul>
  </div>
</template>

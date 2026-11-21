<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useAdminHealth } from '@/composables/useAdmin'

const { health, loading, reload } = useAdminHealth()
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const tiles = computed(() => {
  const h = health.value
  if (!h) return []
  const stale = h.outbox_oldest && Date.now() - new Date(h.outbox_oldest).getTime() > 15 * 60_000
  return [
    { label: 'Site errors, 24h', value: h.client_errors_24h, bad: h.client_errors_24h > 0 },
    { label: 'Bot errors, 24h', value: h.bot_errors_24h, bad: h.bot_errors_24h > 0 },
    { label: 'Discord posts waiting', value: h.outbox_waiting, bad: Boolean(stale) },
    { label: 'Posts retrying', value: h.outbox_failing, bad: h.outbox_failing > 0 },
  ]
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Admin" title="Health" description="Errors from the site and the Discord bot, the queue of Discord posts, and the scheduled jobs.">
      <template #actions><UiButton size="sm" variant="secondary" @click="reload">Refresh</UiButton></template>
    </PageHeader>
    <div class="flex flex-col gap-6 px-4 py-8 sm:px-6">
      <UiSkeleton v-if="loading" :lines="6" />
      <template v-else-if="health">
        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <li v-for="t in tiles" :key="t.label" class="rounded-lg border bg-surface p-5" :class="t.bad ? 'border-loss/50' : 'border-line'">
            <span class="eyebrow text-muted">{{ t.label }}</span>
            <span class="tnum mt-2 block font-heading text-4xl" :class="t.bad ? 'text-loss' : ''">{{ t.value }}</span>
          </li>
        </ul>
        <p v-if="health.outbox_oldest" class="text-sm text-muted">
          Oldest waiting Discord post: {{ when(health.outbox_oldest) }}. Posts go out every 5 minutes; anything much older means the bot is failing (see Bot errors).
        </p>

        <UiCard eyebrow="pg_cron" title="Scheduled jobs">
          <ul class="flex flex-col divide-y divide-line text-sm">
            <li v-for="j in health.cron" :key="j.job" class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span class="min-w-56 flex-1 font-mono text-xs">{{ j.job }}</span>
              <span class="font-mono text-xs text-muted">{{ j.schedule }}</span>
              <UiBadge :variant="!j.active ? 'neutral' : j.last_status === 'failed' ? 'loss' : 'win'">
                {{ !j.active ? 'paused' : (j.last_status ?? 'not run yet') }}
              </UiBadge>
              <span class="text-xs text-muted">{{ when(j.last_run) }}</span>
            </li>
          </ul>
        </UiCard>

        <div class="grid gap-6 xl:grid-cols-2">
          <UiCard eyebrow="Latest 30" title="Site errors">
            <p v-if="!health.client_errors.length" class="text-sm text-muted">No errors reported.</p>
            <ul v-else class="flex flex-col divide-y divide-line text-sm">
              <li v-for="e in health.client_errors" :key="e.id" class="py-3">
                <p class="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{{ when(e.at) }}</span><span v-if="e.release" class="font-mono">{{ e.release }}</span>
                  <span v-if="e.url" class="truncate">{{ e.url }}</span>
                </p>
                <p class="mt-1 break-words">{{ e.message }}</p>
                <details v-if="e.stack" class="mt-1 text-xs text-muted">
                  <summary class="cursor-pointer">Stack</summary>
                  <pre class="mt-1 overflow-x-auto whitespace-pre-wrap">{{ e.stack }}</pre>
                </details>
              </li>
            </ul>
          </UiCard>
          <UiCard eyebrow="Latest 30" title="Bot errors">
            <p v-if="!health.bot_errors.length" class="text-sm text-muted">No bot errors.</p>
            <ul v-else class="flex flex-col divide-y divide-line text-sm">
              <li v-for="e in health.bot_errors" :key="e.id" class="py-3">
                <p class="flex flex-wrap gap-x-3 text-xs"><span class="font-mono text-gold">{{ e.action }}</span><span class="text-muted">{{ when(e.at) }}</span></p>
                <p class="mt-1 break-words text-muted">{{ e.error }}</p>
              </li>
            </ul>
          </UiCard>
        </div>
      </template>
    </div>
  </div>
</template>

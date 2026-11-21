<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useDiscordSync } from '@/composables/useDiscordSync'
import { useToast } from '@/composables/useToast'
import { site } from '@/config/site'

const toast = useToast()
const { running, lastStats, errors, loadingErrors, resync, reloadErrors } = useDiscordSync()

async function run() {
  const result = await resync()
  if (result.ok) toast.success('Discord is in sync with the league.')
  else toast.error(result.message)
}

const statRows = [
  ['teams', 'Teams synced'],
  ['users', 'Members synced'],
  ['rolesAdded', 'Roles added'],
  ['rolesRemoved', 'Roles removed'],
  ['notInServer', 'Not in the server'],
  ['errors', 'Errors'],
] as const

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Owner"
      title="Discord sync"
      description="Team roles, private team channels and the Captain, Player, Free Agent, HAL Admin and HAL Caster roles follow the database automatically."
    >
      <template #actions>
        <UiButton :href="site.discordInviteUrl" variant="secondary" size="sm">Open server</UiButton>
      </template>
    </PageHeader>

    <div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[22rem_1fr]">
      <UiCard eyebrow="Repair" title="Resync Discord">
        <p class="text-sm text-muted">
          Rebuilds every team role and channel and every member's roles from the database. Use it if
          someone edited roles or deleted a channel by hand. Safe to run any time.
        </p>
        <UiButton class="mt-5" :loading="running" @click="run">Resync Discord</UiButton>

        <dl v-if="lastStats" class="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div v-for="[key, label] in statRows" :key="key">
            <dt class="eyebrow text-muted">{{ label }}</dt>
            <dd class="tnum mt-0.5 font-heading text-2xl" :class="key === 'errors' && lastStats[key] > 0 ? 'text-loss' : ''">
              {{ lastStats[key] }}
            </dd>
          </div>
        </dl>
        <p v-if="lastStats && lastStats.notInServer > 0" class="mt-3 text-xs text-muted">
          Players who haven't joined the Discord server yet get their roles automatically the next time they
          log in to the site after joining.
        </p>
      </UiCard>

      <UiCard eyebrow="Last 20" title="Sync errors">
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="reloadErrors">Refresh</UiButton>
        </template>
        <UiSkeleton v-if="loadingErrors" :lines="4" />
        <p v-else-if="errors.length === 0" class="text-sm text-muted">No sync errors. Everything is in step.</p>
        <ul v-else class="flex flex-col divide-y divide-line">
          <li v-for="e in errors" :key="e.id" class="py-3 text-sm">
            <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-mono text-xs text-gold">{{ e.action }}</span>
              <time class="text-xs text-muted" :datetime="e.createdAt">{{ when(e.createdAt) }}</time>
            </p>
            <p class="mt-1 break-words text-muted">{{ e.error }}</p>
          </li>
        </ul>
      </UiCard>
    </div>
  </div>
</template>

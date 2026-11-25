<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useRankExceptions } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

/**
 * Rule 2.9: Iridescent players play only with an approved exception (for extenuating circumstances).
 * Approving lets them join a team; revoking stops new joins. A player who changes rank loses it.
 */
const toast = useToast()
const { rows, loading, busy, setException } = useRankExceptions()

async function act(id: string, name: string, approve: boolean) {
  const r = await setException(id, approve)
  if (!r.ok) toast.error(r.message)
  else toast.success(approve ? `${name} can play in the league.` : `${name}'s exception was revoked.`)
}
const approvedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
</script>

<template>
  <section aria-labelledby="rank-exceptions-title" class="flex flex-col gap-3">
    <div>
      <h2 id="rank-exceptions-title" class="font-heading text-2xl">Iridescent exceptions</h2>
      <p class="mt-1 max-w-2xl text-sm text-muted">
        Blackhat is for Gold to Crimson players. Iridescent players can play only in extenuating circumstances, once an admin
        approves it here (rule 2.9). Approvals are logged publicly in the audit log.
      </p>
    </div>
    <UiSkeleton v-if="loading" :lines="3" />
    <p v-else-if="!rows.length" class="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
      No Iridescent players right now.
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="p in rows" :key="p.id" class="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <div class="min-w-0 flex-1">
          <RouterLink :to="`/players/${p.id}`" class="font-medium hover:text-accent">{{ p.name }}</RouterLink>
          <p v-if="p.discordUsername" class="text-sm text-muted">{{ p.discordUsername }}</p>
        </div>
        <UiBadge v-if="p.approvedAt" variant="win">Approved {{ approvedOn(p.approvedAt) }}</UiBadge>
        <UiBadge v-else variant="accent">Waiting</UiBadge>
        <UiButton v-if="p.approvedAt" size="sm" variant="ghost" :disabled="busy" @click="act(p.id, p.name, false)">
          Revoke<span class="sr-only"> {{ p.name }}'s exception</span>
        </UiButton>
        <UiButton v-else size="sm" :disabled="busy" @click="act(p.id, p.name, true)">
          Approve<span class="sr-only"> {{ p.name }}</span>
        </UiButton>
      </li>
    </ul>
  </section>
</template>

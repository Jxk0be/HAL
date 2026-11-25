<script setup lang="ts">
import { ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import PageHeader from '@/components/layout/PageHeader.vue'
import PublicLogNotice from '@/components/admin/PublicLogNotice.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useStaffRoles, type StaffRole, type UserWithRoles } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const s = useStaffRoles()
const { staff, results, loading, busy } = s
const query = ref('')
watchDebounced(query, (q) => void s.search(q), { debounce: 300 })

const GRANTABLE: { role: StaffRole; label: string; help: string }[] = [
  { role: 'admin', label: 'Admin', help: 'Settles mismatches and disputes, edits content, approves teams and rosters.' },
  { role: 'caster', label: 'Caster', help: 'Marks matches live and adds their stream link.' },
]

async function toggle(u: UserWithRoles, role: StaffRole) {
  const on = !u.roles.includes(role)
  if (!on && !window.confirm(`Remove ${role} from ${u.name}?`)) return
  const r = await s.setRole(u.id, role, on)
  if (r.ok) toast.success(on ? `${u.name} is now ${role === 'admin' ? 'an admin' : 'a caster'}. Their Discord role updates shortly.` : `${role} removed from ${u.name}.`)
  else toast.error(r.message)
}

async function togglePlaying(u: UserWithRoles) {
  const next = !u.isPlayer
  if (!next && !window.confirm(`Make ${u.name} staff-only? They come off every player list and can't be on a team.`)) return
  const r = await s.setPlaying(u.id, next)
  if (r.ok) toast.success(next ? `${u.name} can play again.` : `${u.name} is now staff-only.`)
  else toast.error(r.message)
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Owner" title="User roles" description="Grant and revoke Admin and Caster. Staff roles sync to Discord automatically." />
    <div class="flex flex-col gap-8 px-4 py-8 sm:px-6">
      <ul class="grid gap-3 text-sm sm:grid-cols-2">
        <li v-for="g in GRANTABLE" :key="g.role" class="rounded-lg border border-line bg-surface p-4">
          <span class="font-heading text-lg text-accent">{{ g.label }}</span>
          <p class="mt-1 text-muted">{{ g.help }}</p>
        </li>
      </ul>

      <section aria-labelledby="find-title" class="flex flex-col gap-3">
        <h2 id="find-title" class="eyebrow text-accent">Find someone</h2>
        <div class="max-w-sm"><UiInput v-model="query" label="Search by Discord name" placeholder="At least 2 characters" autocomplete="off" /></div>
        <ul v-if="results.length" class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          <li v-for="u in results" :key="u.id" class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <UiAvatar :src="u.avatarUrl" :name="u.name" size="sm" decorative />
            <span class="min-w-40 flex-1">
              <span class="block font-medium">{{ u.name }}</span>
              <span class="text-xs text-muted">{{ u.activisionId ?? 'No Activision ID' }}</span>
            </span>
            <UiBadge v-if="u.roles.includes('owner')" variant="accent">Owner</UiBadge>
            <UiButton
              v-for="g in GRANTABLE"
              :key="g.role"
              size="sm"
              :variant="u.roles.includes(g.role) ? 'danger' : 'secondary'"
              :disabled="busy"
              @click="toggle(u, g.role)"
            >
              {{ u.roles.includes(g.role) ? `Remove ${g.label}` : `Make ${g.label}` }}
            </UiButton>
          </li>
        </ul>
        <p v-else-if="query.trim().length >= 2" class="text-sm text-muted">No one found. They need to have logged in to the site once.</p>
      </section>

      <section aria-labelledby="staff-title" class="flex flex-col gap-3">
        <h2 id="staff-title" class="eyebrow text-accent">Current staff</h2>
        <UiSkeleton v-if="loading" :lines="3" />
        <ul v-else class="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          <li v-for="u in staff" :key="u.id" class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <UiAvatar :src="u.avatarUrl" :name="u.name" size="sm" decorative />
            <span class="min-w-40 flex-1 font-medium">{{ u.name }}</span>
            <UiBadge v-for="r in u.roles" :key="r" :variant="r === 'owner' ? 'accent' : 'neutral'">{{ r }}</UiBadge>
            <UiBadge v-if="!u.isPlayer" variant="outline">Staff only</UiBadge>
            <UiButton size="sm" variant="ghost" :disabled="busy" @click="togglePlaying(u)">
              {{ u.isPlayer ? 'Make staff-only' : 'Let them play' }}<span class="sr-only">: {{ u.name }}</span>
            </UiButton>
            <UiButton v-for="g in GRANTABLE.filter((x) => u.roles.includes(x.role))" :key="g.role" size="sm" variant="ghost" :disabled="busy" @click="toggle(u, g.role)">
              Remove {{ g.label }}<span class="sr-only"> from {{ u.name }}</span>
            </UiButton>
          </li>
        </ul>
        <p class="text-xs text-muted">
          The owner role can’t be removed from the last owner. Staff-only accounts run the league but don’t play: they’re off the player,
          free agent and invite lists and can’t be on a team.
        </p>
        <PublicLogNotice />
      </section>
    </div>
  </div>
</template>

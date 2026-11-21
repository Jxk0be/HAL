<script setup lang="ts">
import { reactive, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import { useBotChannels, type BotChannels } from '@/composables/useDiscordSync'
import { useToast } from '@/composables/useToast'

/** Where the bot posts results, "Now live" and admin alerts. Team reminders go to team channels. */
const toast = useToast()
const { channels, loading, saving, save } = useBotChannels()
const form = reactive<BotChannels>({ lfg: '', disputes: '', results: '', announcements: '', admin: '' })
watch(channels, (c) => Object.assign(form, c), { immediate: true })

const FIELDS: { key: keyof BotChannels; label: string; hint: string }[] = [
  { key: 'lfg', label: '#lfg-free-agents', hint: '/lfg posts with an Invite to team button for captains.' },
  { key: 'results', label: '#results', hint: 'Final scores, map by map, and the top performer.' },
  { key: 'announcements', label: '#announcements', hint: '"Now live" posts when a caster goes live.' },
  { key: 'disputes', label: '#disputes', hint: 'A private thread per dispute with both captains and the non-recused admins.' },
  { key: 'admin', label: '#admin-only', hint: 'Missing check-ins (and new disputes if #disputes is blank).' },
]

async function submit() {
  const r = await save({ ...form })
  if (r.ok) toast.success('Channels saved. The bot uses them from its next run (every 5 minutes).')
  else toast.error(r.message)
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <p class="text-sm text-muted">
      In Discord: User Settings → Advanced → turn on <strong class="text-text">Developer Mode</strong>, then right-click a
      channel → <strong class="text-text">Copy Channel ID</strong>. Leave one blank to switch those posts off.
    </p>
    <UiInput
      v-for="f in FIELDS"
      :key="f.key"
      v-model="form[f.key]"
      :label="f.label"
      :hint="f.hint"
      :disabled="loading"
      placeholder="123456789012345678"
      autocomplete="off"
    />
    <UiButton type="submit" class="self-start" :loading="saving">Save channels</UiButton>
  </form>
</template>

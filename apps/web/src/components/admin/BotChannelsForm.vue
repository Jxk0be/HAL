<script setup lang="ts">
import { reactive, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import { BOT_CHANNEL_KEYS, useBotChannels, type BotChannels } from '@/composables/useDiscordSync'
import { useToast } from '@/composables/useToast'

/** Where the bot posts results, "Now live", admin alerts and the live boards. Team reminders go to team channels. */
const toast = useToast()
const { channels, loading, saving, save } = useBotChannels()
const form = reactive<BotChannels>(Object.fromEntries(BOT_CHANNEL_KEYS.map((k) => [k, ''])) as BotChannels)
watch(channels, (c) => Object.assign(form, c), { immediate: true })

const GROUPS: { title: string; fields: { key: keyof BotChannels; label: string; hint: string }[] }[] = [
  {
    title: 'Posts',
    fields: [
      { key: 'announcements', label: '#announcements', hint: 'Season announcements and "Now live" posts when a caster goes live.' },
      { key: 'results', label: '#results', hint: 'Final scores, map by map, and the top performer.' },
      { key: 'lfg', label: '#free-agents', hint: 'Free agent cards with an Invite to team button. Players post with the buttons on the pinned guide.' },
      { key: 'disputes', label: '#disputes', hint: 'A private thread per dispute with both captains and the non-recused admins.' },
      { key: 'admin', label: '#admin-only', hint: 'Everything waiting on an admin, with a BIL Admin ping.' },
    ],
  },
  {
    title: 'Live boards (kept up to date every 5 minutes)',
    fields: [
      { key: 'rosters', label: '#team-rosters', hint: 'One post per approved team, edited when the roster changes.' },
      { key: 'standings', label: '#standings', hint: 'One table per division, updated after every result.' },
      { key: 'schedule', label: '#match-schedule', hint: "This week's matches and results, one post per week." },
      { key: 'subs', label: '#sub-board', hint: "Teams short for a match. Free agents press I'm available; the captain is told." },
      { key: 'potw', label: '#player-of-the-week', hint: "Monday at noon ET: last week's best average score (2+ maps), plus two mentions." },
    ],
  },
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
    <fieldset v-for="g in GROUPS" :key="g.title" class="flex flex-col gap-4">
      <legend class="eyebrow mb-2 text-muted">{{ g.title }}</legend>
      <UiInput
        v-for="f in g.fields"
        :key="f.key"
        v-model="form[f.key]"
        :label="f.label"
        :hint="f.hint"
        :disabled="loading"
        placeholder="123456789012345678"
        autocomplete="off"
      />
    </fieldset>
    <UiButton type="submit" class="self-start" :loading="saving">Save channels</UiButton>
  </form>
</template>

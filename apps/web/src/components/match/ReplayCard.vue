<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'
import UiInput from '@/components/ui/UiInput.vue'
import StreamPlayer from '@/components/broadcast/StreamPlayer.vue'
import { setVod } from '@/composables/useBroadcasts'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { isStreamUrl } from '@/lib/broadcast'
import type { MatchCardData } from '@/composables/useMatches'

/** Match page: the replay player, and for the match's caster (or an admin) the replay link form. */
const props = defineProps<{ match: MatchCardData }>()
const emit = defineEmits<{ saved: [] }>()

const auth = useAuthStore()
const toast = useToast()

const started = computed(() => new Date(props.match.scheduledAt).getTime() <= Date.now())
const canEdit = computed(
  () =>
    started.value &&
    !props.match.broadcastLive &&
    props.match.status !== 'cancelled' &&
    (auth.isAdmin || (auth.isCaster && (!props.match.broadcastBy || props.match.broadcastBy === auth.user?.id))),
)

const url = ref('')
watch(
  () => props.match.vodUrl,
  (v) => (url.value = v ?? ''),
  { immediate: true },
)
const urlError = computed(() => (url.value.trim() && !isStreamUrl(url.value) ? 'Use an https:// link to Twitch, YouTube or Kick.' : undefined))
const saving = ref(false)

async function save(clear = false) {
  saving.value = true
  const r = await setVod(props.match.id, clear ? '' : url.value)
  saving.value = false
  if (!r.ok) return toast.error(r.message)
  toast.success(clear ? 'Replay removed.' : 'Replay saved. It shows here and on the Watch page.')
  emit('saved')
}
</script>

<template>
  <UiCard v-if="match.vodUrl || canEdit" id="replay" eyebrow="Broadcast" title="Replay" class="scroll-mt-24">
    <StreamPlayer v-if="match.vodUrl" :url="match.vodUrl" :title="`${match.home.tag} vs ${match.away.tag} replay`" click-to-load />
    <p v-else class="text-sm text-muted">No replay yet.</p>

    <form v-if="canEdit" class="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end" @submit.prevent="save()">
      <div class="flex-1">
        <UiInput
          v-model="url"
          label="Replay link"
          type="url"
          placeholder="https://www.twitch.tv/videos/…"
          hint="The Twitch VOD, YouTube video or Kick link. Shown here and on the Watch page."
          :error="urlError"
          autocomplete="off"
        />
      </div>
      <div class="flex gap-2">
        <UiButton type="submit" size="sm" :loading="saving" :disabled="!url.trim() || Boolean(urlError)">Save replay</UiButton>
        <UiButton v-if="match.vodUrl" size="sm" variant="ghost" :disabled="saving" @click="save(true)">Remove</UiButton>
      </div>
    </form>
  </UiCard>
</template>

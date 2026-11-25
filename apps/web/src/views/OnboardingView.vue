<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import ProfileForm from '@/components/profile/ProfileForm.vue'
import UiAvatar from '@/components/ui/UiAvatar.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { safeNext } from '@/lib/redirect'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()

async function done() {
  toast.success("You're all set. Welcome to Blackhat.")
  await router.replace(safeNext(route.query.next, '/profile'))
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Step 1 of 1"
      title="Set up your player profile"
      description="Captains use this to find and invite you. You need it before you can join or create a team."
    />
    <div class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div class="mb-8 flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
        <UiAvatar :src="auth.avatarUrl" :name="auth.displayName" size="md" decorative />
        <div>
          <p class="eyebrow text-muted">Signed in with Discord</p>
          <p class="font-medium">{{ auth.displayName }}</p>
        </div>
      </div>
      <ProfileForm
        v-if="auth.profile"
        :profile="auth.profile"
        :on-team="Boolean(auth.team)"
        submit-label="Finish setup"
        @saved="done"
      />
      <div v-else-if="auth.profileError" role="alert" class="rounded-md border border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss">
        Your profile couldn't be loaded. Refresh the page; if it keeps happening, tell an admin.
        <UiButton size="sm" variant="secondary" class="mt-3 block" @click="auth.refresh()">Try again</UiButton>
      </div>
      <UiSkeleton v-else :lines="6" />
    </div>
  </div>
</template>

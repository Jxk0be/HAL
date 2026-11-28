<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'

defineProps<{ bannerUrl: string | null; busy: boolean }>()
const emit = defineEmits<{ upload: [file: File]; remove: [] }>()

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload', file)
  input.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="texture-stripes aspect-[3/1] overflow-hidden rounded-lg border border-line bg-surface-2">
      <img v-if="bannerUrl" :src="bannerUrl" alt="Current team banner" class="size-full object-cover" />
    </div>
    <p class="text-sm text-muted">A wide 3:1 image for your team card and page. It's converted to WebP (1600px wide max).</p>
    <div class="flex flex-wrap gap-2">
      <label
        class="inline-flex h-11 cursor-pointer items-center rounded-md border border-line bg-chip px-4 font-heading text-sm tracking-wide text-text uppercase focus-within:outline-2 focus-within:outline-accent hover:border-line-strong"
      >
        {{ bannerUrl ? 'Replace banner' : 'Upload banner' }}
        <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" :disabled="busy" @change="onFile" />
      </label>
      <UiButton v-if="bannerUrl" variant="ghost" :disabled="busy" @click="emit('remove')">Remove</UiButton>
    </div>
  </div>
</template>
